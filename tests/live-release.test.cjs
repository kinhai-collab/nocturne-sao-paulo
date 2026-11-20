'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE = 'https://kinhai-collab.github.io/nocturne-sao-paulo/';
const TIME = '2026-12-24T02:30:00.000Z';
const initialMeal = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  organizer: true,
  title: 'Family dinner',
  selectedTime: TIME,
  timeZone: 'America/Los_Angeles',
  duration: 90,
  location: 'San Jose, CA',
  restaurant: '',
  restaurants: [],
  venues: [],
  times: [TIME],
  guests: ['Parent', 'Child'],
  attending: [],
  responses: [],
  joinedCount: 0,
  myVote: null,
  calendarEnabled: false,
  cancelled: false,
  status: 'Unbooked',
});
const places = ['A Bistro', 'B Bistro', 'C Bistro'].map((name,i)=>({
  id: 'place_'+i,
  displayName: { text: name },
  formattedAddress: String(100+i) + ' Example Road, San Jose, CA',
  rating: 4.8-i*.1,
  userRatingCount: 1000-i*100,
  priceLevel: 'PRICE_LEVEL_MODERATE',
}));

async function boot(page) {
  const response = await page.goto(BASE + 'planner.html', {waitUntil:'domcontentloaded', timeout:45000});
  assert.equal(response?.status(),200, 'Public planner must return HTTP 200');
  await page.waitForFunction(() => !!window.EnkaiGroupPicks &&
    typeof window.EnkaiGroupPicks.shortlist === 'function' &&
    typeof window.openGroupFinder === 'function' &&
    typeof window.mealDetails === 'function',null,{timeout:30000});
  return response;
}

async function demo(browser,mode) {
  const page = await browser.newPage({viewport:{width:390,height:844},locale:'en-US'});
  const calls=[];
  let persisted = initialMeal();
  await page.route('**/functions/v1/meal-planner', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body);
    let data;
    if(body.action === 'places') data = places;
    else if(body.action === 'manage') {
      persisted = {...persisted,...body.details,id:body.id,version:body.version+1,
        organizer:true,responses:[],joinedCount:0,myVote:null};
      data = {id: body.id};
    } else if(body.action === 'list') data = [persisted];
    else data={id:persisted.id};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  page.on('dialog', dialog => dialog.accept());
  await boot(page);
  await page.evaluate(meal=>{
    state.meals = [meal];
    mealDetails(meal);
  }, initialMeal());
  await page.getByRole('button',{name:'Find three places'}).first().click();
  const form=page.locator('[data-form="group-search"]');
  assert.equal(await form.locator('input[name="city"]').inputValue(),'San Jose, CA');
  await form.getByRole('button',{name:'Find three places'}).click();
  await page.locator('[data-action="group-pick"]').first().waitFor({timeout:15000});
  assert.equal(await page.locator('[data-action="group-pick"]').count(),3);
  assert.match(await page.locator('[data-group-results]').innerText(),/not verified/i);
  const query=calls.find(c=>c.action==='places');
  assert.equal(query.city,'San Jose, CA');
  if(mode==='pick') {
    await page.locator('[data-action="group-pick"]').first().click();
  } else {
    await page.getByRole('button',{name:'Ask the family about these places'}).click();
  }
  await page.waitForFunction(() => document.querySelector('h2#panel-title')?.textContent === 'Family dinner',null,{timeout:15000});
  const managed=calls.find(c=>c.action==='manage');
  assert.ok(managed,'Manage action must be emitted');
  assert.equal(managed.details.selectedTime,TIME);
  assert.equal(managed.details.status,'Unbooked');
  if(mode==='pick') {
    assert.equal(managed.details.restaurant, 'A Bistro');
    assert.equal(managed.details.venues[0].placeId, 'place_0');
  } else {
    assert.equal(managed.details.restaurant,'');
    assert.equal(managed.details.restaurants.length,3);
  }
  assert.ok(calls.some(c=>c.action==='list'),'Planner must reload updated dinner');
  await page.close();
}

test('Published Enkai serves feature scripts and allows a mock family decision', async() => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const publicFiles=['planner.html','group-shortlist.js','group-finder.js'];
    for(const path of publicFiles){
      const response=await page.request.get(BASE + path,{timeout:30000});
      assert.equal(response.status(),200,path+' must be publicly reachable');
      assert.ok((await response.body()).length>300,path+' must have content');
    }
    await page.close();
    await demo(browser,'pick');
    await demo(browser,'vote');
  } finally {
    await browser.close();
  }
});

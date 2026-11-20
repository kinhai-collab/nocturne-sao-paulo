const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const meal = {
  id:'meal-a',version:1,organizer:true,selectedTime:'2026-12-24T02:30:00.000Z',
  restaurant:'',restaurants:[],location:'San Jose, CA',guests:['Parent','Child'],
  status:'Unbooked',timeZone:'America/Los_Angeles',duration:90,
  times:['2026-12-24T02:30:00.000Z'],attending:[],cancelled:false,
};

async function setup(page) {
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><dialog id="panel"></dialog></body></html>');
  await page.evaluate(base => {
    window.panel=document.querySelector('#panel');
    window.activeMeal=structuredClone(base);
    window.state={meals:[window.activeMeal]};
    window.requestInFlight=false;
    window.saved=[];
    window.placesQueries=[];
    window.escape=s=>String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    window.mealDateTime=()=> 'December 23, 6:30 PM';
    window.maps=(name,city)=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name+' '+city);
    window.show=(title,body)=>{panel.innerHTML='<h2>'+title+'</h2>'+body;panel.showModal();};
    window.confirm=()=>true;
    window.api=async (action,payload)=>{
      window.placesQueries.push({action,payload});
      return ['Cedar Bistro','Garden Table','Family Kitchen'].map((name,i)=>({
        id:'place_'+i,displayName:{text:name},formattedAddress:'Sample street '+i+', San Jose',
        priceLevel:'PRICE_LEVEL_MODERATE',rating:4.6,userRatingCount:190+i
      }));
    };
    window.syncMeal=(action,payload)=>{window.saved.push({action,payload});};
  },meal);
  await page.addScriptTag({path:'group-shortlist.js'});
  await page.addScriptTag({path:'group-finder.js'});
  await page.evaluate(()=>{
    document.addEventListener('submit',e=>{if(e.target.dataset.form==='group-search'){e.preventDefault();searchGroupPlaces(e.target);}});
    document.addEventListener('click',e=>{
      const el=e.target.closest('[data-action]');
      if(!el)return;
      if(el.dataset.action==='group-pick')saveGroupShortlist('pick',el.dataset.index);
      if(el.dataset.action==='group-vote')saveGroupShortlist('vote');
    });
    openGroupFinder();
  });
}

test('Mobile browser: three suggestions, choose or family poll, no false booking',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await setup(page);
    await page.locator('button[type=submit]').click();
    await page.locator('[data-action=group-pick]').first().waitFor();
    assert.equal(await page.locator('[data-action=group-pick]').count(),3);
    assert.match(await page.locator('[data-group-results]').innerText(),/not verified/i);
    const search=await page.evaluate(()=>window.placesQueries);
    assert.equal(search.length,1);
    assert.equal(search[0].action,'places');
    await page.locator('[data-action=group-pick]').first().click();
    const chosen=await page.evaluate(()=>window.saved[0]);
    assert.equal(chosen.action,'manage');
    assert.equal(chosen.payload.details.restaurant,'Family Kitchen');
    assert.equal(chosen.payload.details.status,'Unbooked');
    assert.equal(chosen.payload.details.selectedTime,meal.selectedTime);
    await page.close();

    const votePage=await browser.newPage({viewport:{width:390,height:844}});
    await setup(votePage);
    await votePage.locator('button[type=submit]').click();
    await votePage.locator('[data-action=group-vote]').click();
    const voted=await votePage.evaluate(()=>window.saved[0]);
    assert.equal(voted.payload.details.restaurant,'');
    assert.equal(voted.payload.details.restaurants.length,3);
    assert.equal(voted.payload.details.status,'Unbooked');
    await votePage.close();
  } finally {
    await browser.close();
  }
});

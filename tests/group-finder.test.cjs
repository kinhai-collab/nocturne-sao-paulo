const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('group-finder.js','utf8');
const ranking = fs.readFileSync('group-shortlist.js','utf8');
const place = (name, index) => ({
  id:'place_' + index,displayName:{text:name},
  formattedAddress:'123 Main St', priceLevel:'PRICE_LEVEL_MODERATE',
  rating:4.5,userRatingCount:100+index,
});

function harness(overrides = {}) {
  const meal = {id:'meal_1',version:7,organizer:true,selectedTime:'2026-12-25T00:00:00.000Z',
    restaurant:'',restaurants:[],location:'San Jose, CA',guests:['A','B'],
    status:'Unbooked',timeZone:'America/Los_Angeles',duration:90,
    times:['2026-12-25T00:00:00.000Z'],attending:[],cancelled:false,
    ...overrides};
  const nodes = {
    '[data-group-status]':{textContent:''},
    '[data-group-results]':{innerHTML:'',replaceChildren(){this.innerHTML='';}},
    '[data-group-google-maps]':{href:''},
  };
  const calls=[];
  const panel = {
    open:true,
    querySelector(selector){return nodes[selector];},
    addEventListener(){},
  };
  const context=vm.createContext({
    activeMeal:meal,state:{meals:[meal]},panel,
    window:{confirm:()=>true},requestInFlight:false,
    escape:text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    maps:(name,city)=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name+' '+city),
    mealDateTime:()=>'December 24 at 4:00 PM',
    show:(title,html)=>calls.push({action:'show',title,html}),
    api:async (action,payload)=>{calls.push({action,payload});return [
      place('A Bistro',1),place('B Bistro',2),place('C Bistro',3)
    ];},
    syncMeal:(action,payload,newContacts,trigger)=>calls.push({action,payload,newContacts,trigger}),
  });
  vm.runInContext(ranking,context,{filename:'group-shortlist.js'});
  vm.runInContext(source,context,{filename:'group-finder.js'});
  const form = {
    elements:{city:{value:'San Jose, CA'},food:{value:'Italian'},budget:{value:'2'}},
    querySelector:()=>({disabled:false}),
  };
  return {context,calls,meal,nodes,form};
}

test('organizer with agreed time can open finder with the time preserved',()=>{
  const h=harness();
  vm.runInContext('openGroupFinder()',h.context);
  const screen=h.calls.find(c=>c.action==='show');
  assert.match(screen.html,/December 24 at 4:00 PM/);
  assert.match(screen.html,/Find three places/);
  assert.doesNotMatch(screen.html,/available for 12|reservation confirmed/i);
});

test('guests and meals with an existing restaurant poll cannot open the shortcut',()=>{
  for(const options of [{organizer:false},{selectedTime:''},{restaurants:['Prior option']},{restaurant:'Booked place'},{cancelled:true}]) {
    const h=harness(options);
    vm.runInContext('openGroupFinder()',h.context);
    assert.equal(h.calls.length,0);
  }
});

test('live search uses current authenticated Places action and shows no availability guarantee',async()=>{
  const h=harness();
  vm.runInContext('openGroupFinder()',h.context);
  // Use the existing context to retain its lexical groupFinderState.
  h.context.form=h.form;
  await vm.runInContext('searchGroupPlaces(form)',h.context);
  const apiCall=h.calls.find(c=>c.action==='places');
  assert.equal(apiCall.payload.city,'San Jose, CA');
  assert.equal(apiCall.payload.food,'Italian');
  assert.equal((h.nodes['[data-group-results]'].innerHTML.match(/data-action="group-pick"/g)||[]).length,3);
  assert.match(h.nodes['[data-group-results]'].innerHTML,/not verified/i);
  assert.doesNotMatch(h.nodes['[data-group-results]'].innerHTML,/confirmed reservation/i);
});

test('choose one persists Unbooked status and the selected Google Place ID without list-only agent data',async()=>{
  const h=harness({agentResult:{status:'works',proposedTime:'PRIVATE_AGENT_TIME'}});
  h.context.form=h.form;
  vm.runInContext('openGroupFinder()',h.context);
  await vm.runInContext('searchGroupPlaces(form)',h.context);
  h.context.trigger={textContent:'Choose this restaurant'};
  vm.runInContext("saveGroupShortlist('pick', 1, trigger)",h.context);
  const saved=h.calls.find(c=>c.action==='manage');
  assert.equal(saved.payload.version,7);
  assert.equal(saved.payload.details.restaurant,'B Bistro');
  assert.equal(saved.payload.details.status,'Unbooked');
  assert.equal(saved.payload.details.venues[0].placeId,'place_2');
  assert.equal(saved.payload.details.selectedTime,h.meal.selectedTime);
  assert.equal(saved.payload.details.timeZone,h.meal.timeZone);
  assert(!('agentResult' in saved.payload.details));
  assert.equal(saved.trigger,h.context.trigger,'the clicked pick button owns the saving state');
});

test('ask family reuses existing poll structure without choosing a restaurant',async()=>{
  const h=harness();h.context.form=h.form;
  vm.runInContext('openGroupFinder()',h.context);
  await vm.runInContext('searchGroupPlaces(form)',h.context);
  h.context.trigger={textContent:'Ask the group'};
  vm.runInContext("saveGroupShortlist('vote', undefined, trigger)",h.context);
  const saved=h.calls.find(c=>c.action==='manage');
  assert.equal(saved.payload.details.restaurant,'');
  assert.equal(saved.payload.details.status,'Unbooked');
  assert.deepEqual(Array.from(saved.payload.details.restaurants),['C Bistro','B Bistro','A Bistro']);
  assert.equal(saved.payload.details.venues.length,3);
  assert.equal(saved.trigger,h.context.trigger,'the clicked vote button owns the saving state');
});

test('stale/invalid user actions cannot change existing restaurant polls',async()=>{
  const h=harness();h.context.form=h.form;
  vm.runInContext('openGroupFinder()',h.context);
  await vm.runInContext('searchGroupPlaces(form)',h.context);
  h.meal.restaurants=['Prior option'];
  vm.runInContext("saveGroupShortlist('vote')",h.context);
  assert.equal(h.calls.filter(c=>c.action==='manage').length,0);
});

test('provider errors stay visible and do not manufacture results',async()=>{
  const h=harness();h.context.form=h.form;
  h.context.api=async()=>{throw Error('Monthly limit reached');};
  vm.runInContext('openGroupFinder()',h.context);
  await vm.runInContext('searchGroupPlaces(form)',h.context);
  assert.equal(h.nodes['[data-group-status]'].textContent,'Monthly limit reached');
  assert.equal(h.nodes['[data-group-results]'].innerHTML,'');
});

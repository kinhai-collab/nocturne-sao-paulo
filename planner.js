'use strict';

const root = document.querySelector('#planner');
const panel = document.querySelector('#panel');
const notice = document.querySelector('#notice');
const storageKey = 'nocturne-planner-preview-v1';
const durations = [60, 90, 120, 150, 180, 240];
const statuses = ['Unbooked', 'Booked', 'Confirmed', 'In-person booking only'];
const blank = { meals: [], wishes: [], people: [], profile: '', busy: [] };
let state;
try { state = { ...blank, ...JSON.parse(localStorage.getItem(storageKey)) }; }
catch { state = structuredClone(blank); }
let view = 'dashboard';
let days = 3;
let anchor = new Date();
let activeMeal = null;
let activeWish = null;
let noticeTimer;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const format = (date, options) => new Intl.DateTimeFormat(undefined, options).format(new Date(date));
const dateTime = date => format(date, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const localDay = date => format(date, { weekday: 'long', month: 'short', day: 'numeric' });
const midnight = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const moveDays = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
const split = text => [...new Set(String(text || '').split(/[,\n]/).map(item => item.trim()).filter(Boolean))];
const maps = (restaurant, location) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([restaurant, location].filter(Boolean).join(' '));
const isPolling = meal => !meal.selectedTime || (!meal.restaurant && meal.restaurants.length > 0);
const status = meal => meal.selectedTime ? meal.status : 'Polling';
const durationLabel = minutes => minutes % 60 === 0 ? (minutes / 60) + ' hr' : minutes + ' min';

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { message('This browser could not save your changes.'); }
}
function message(text) {
  notice.textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 4200);
}
function show(title, body) {
  panel.innerHTML = `<div class="row spread"><h2 id="panel-title">${escape(title)}</h2><button type="button" data-action="close" aria-label="Close">×</button></div>${body}`;
  if (!panel.open) panel.showModal();
}
function statusPill(text) { return `<span class="pill">${escape(text)}</span>`; }

function card(meal) {
  const responses = Object.keys(meal.votes).length;
  const attendance = meal.attending.length;
  return `<article class="card stack"><div class="row spread"><h3>${escape(meal.title)}</h3>${statusPill(status(meal))}</div>
    <div class="muted">${meal.selectedTime ? escape(dateTime(meal.selectedTime)) + ' · ' + durationLabel(meal.duration) : meal.times.length + ' time options · ' + meal.restaurants.length + ' restaurant options'}</div>
    <div>${escape(meal.restaurant || meal.location || 'Restaurant to be decided')}</div>
    <small>${meal.selectedTime ? attendance + ' attending' : responses + ' responses'} · ${meal.guests.length} invited${meal.selectedTime && attendance ? ' · ' + escape(meal.attending.join(', ')) : ''}</small>
    <div class="row"><button data-action="meal" data-id="${meal.id}">${meal.selectedTime ? 'Meal details' : 'Open poll'}</button></div></article>`;
}
function dashboard() {
  const dates = Array.from({ length: days }, (_, i) => moveDays(anchor, i));
  const scheduled = state.meals.filter(meal => meal.selectedTime);
  const pending = state.meals.filter(meal => isPolling(meal));
  return `<div class="row period spread"><div class="row" aria-label="Calendar range">${[1,3,7].map(n => `<button data-action="range" data-days="${n}" aria-pressed="${n===days}">${n===1?'Day':n+' days'}</button>`).join('')}</div>
    <div class="row"><button data-action="previous" aria-label="Previous dates">‹</button><button data-action="today">Today</button><button data-action="next" aria-label="Next dates">›</button></div></div>
    ${dates.map(date => {
      const start = +midnight(date), end = +moveDays(date, 1);
      const meals = scheduled.filter(m => +new Date(m.selectedTime) >= start && +new Date(m.selectedTime) < end).sort((a,b) => +new Date(a.selectedTime) - +new Date(b.selectedTime));
      return `<section class="day"><h2>${escape(localDay(date))}</h2><div class="stack">${meals.length ? meals.map(card).join('') : '<p class="muted">No meals scheduled.</p>'}</div></section>`;
    }).join('')}
    ${pending.length ? `<section class="day"><h2>Still polling</h2><div class="stack">${pending.map(card).join('')}</div></section>` : ''}`;
}
function wishlist() {
  return `<div class="row spread"><h2>Places to try</h2><button class="primary" data-action="wish-new">Add a restaurant</button></div><div class="stack">
    ${state.wishes.map(w => `<article class="card stack"><h3>${escape(w.name)}</h3><small>${escape(w.location)} · ${w.interested.length} interested</small>
      <div class="row"><a class="button" href="${maps(w.name,w.location)}" target="_blank" rel="noopener">Find on Google Maps</a><button data-action="wish-interest" data-id="${w.id}">Interest list</button><button data-action="wish-date" data-id="${w.id}">It’s a Date</button></div></article>`).join('') || '<p class="muted">Save a restaurant you’d like to visit.</p>'}</div>`;
}
function render() {
  const names = { dashboard: 'Your upcoming meals', polls: 'Open polls', wishlist: 'Your restaurant wish list' };
  root.innerHTML = `<section class="hero"><p class="eyebrow">Meal planner · Local preview</p><h1>${names[view]}</h1>
    <p class="muted">Try the planning flow on this device. Accounts, shared responses and calendar sync are not connected in this preview.</p>
    <div class="row"><button class="primary" data-action="new">Plan a meal</button><button data-action="people">Connections</button><button data-action="busy">Calendar blocks</button></div></section>
    ${view==='dashboard' ? dashboard() : view==='wishlist' ? wishlist() : '<div class="stack">'+(state.meals.filter(isPolling).map(card).join('') || '<p class="muted">No open polls yet.</p>')+'</div>'}`;
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view===view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
}

function timeInput(value = '') {
  return `<div class="row"><label>Local date and time <input type="datetime-local" name="time" value="${escape(value)}"></label><button type="button" data-action="remove-time" aria-label="Remove time">Remove</button></div>`;
}
function mealForm(wish) {
  activeWish = wish || null;
  show('Plan a meal', `<form class="stack" data-form="new">
    <label>Meal name <input name="title" maxlength="100" required value="${escape(wish ? 'Dinner at '+wish.name : '')}"></label>
    <label>City or neighbourhood <input name="location" maxlength="120" value="${escape(wish?.location)}"></label>
    <label>Duration <select name="duration">${durations.map(m=>`<option value="${m}" ${m===90?'selected':''}>${durationLabel(m)}</option>`).join('')}</select></label>
    <fieldset class="stack"><legend>Time options · up to 10</legend><div class="stack" id="time-options">${wish ? '' : timeInput()}</div><button type="button" data-action="add-time">Add a time option</button></fieldset>
    <label>Restaurant options, separated by commas <input name="restaurants" maxlength="450" value="${escape(wish?.name)}"></label>
    <label>Guests, separated by commas <input name="guests" maxlength="500" value="${escape(wish?.interested.join(', '))}" list="connections"></label>
    <datalist id="connections">${state.people.map(p=>`<option value="${escape(p)}"></option>`).join('')}</datalist>
    <small>Start with a time, a restaurant, or both.</small><button class="primary">Create poll</button></form>`);
}
function hasConflict(time, duration) {
  const start = +new Date(time);
  const end = start + duration * 60000;
  return state.busy.some(block => start < +new Date(block.end) && end > +new Date(block.start));
}
function choices(values, name, selected, label) {
  return values.map(value=>`<label class="option"><input type="checkbox" name="${name}" value="${escape(value)}" ${selected.includes(value)?'checked':''}><span>${label(value)}</span></label>`).join('') || '<p class="muted">No options yet.</p>';
}
function mealDetails(meal) {
  activeMeal = meal;
  const person = state.profile;
  const vote = Object.hasOwn(meal.votes,person) ? meal.votes[person] : { times: [], restaurants: [] };
  const tally = (key, val) => Object.values(meal.votes).filter(v=>v[key].includes(val)).length;
  const guests = meal.guests.length ? escape(meal.guests.join(', ')) : 'None entered';
  const options = meal.times.map(t=>`<option value="${escape(t)}" ${t===meal.selectedTime?'selected':''}>${escape(dateTime(t))} · ${tally('times',t)} votes</option>`).join('');
  const restaurants = meal.restaurants.map(r=>`<option value="${escape(r)}" ${r===meal.restaurant?'selected':''}>${escape(r)} · ${tally('restaurants',r)} votes</option>`).join('');
  show(meal.title, `<div class="stack"><div>${statusPill(status(meal))} · ${durationLabel(meal.duration)}</div>
    <p class="muted">Guests: ${guests}</p>
    <div class="row"><button data-action="share">Share a preview copy</button><small>Recipients get a separate copy. Responses stay on their device.</small></div>
    ${meal.restaurant ? `<a href="${maps(meal.restaurant,meal.location)}" target="_blank" rel="noopener">Find ${escape(meal.restaurant)} on Google Maps ↗</a>` : ''}
    ${isPolling(meal) ? `<form class="stack card" data-form="vote"><h3>Respond to poll</h3><label>Your name in this preview <input name="person" maxlength="80" value="${escape(person)}" required></label>
      <fieldset><legend>Times that work</legend>${choices(meal.selectedTime?[]:meal.times,'times',vote.times,t=>escape(dateTime(t))+' · '+tally('times',t)+' votes'+(hasConflict(t,meal.duration)?' · ⚠ Calendar block overlaps':''))}</fieldset>
      <fieldset><legend>Restaurants you’d visit</legend>${choices(meal.restaurant?[]:meal.restaurants,'restaurants',vote.restaurants,r=>escape(r)+' · '+tally('restaurants',r)+' votes')}</fieldset><button class="primary">Save response</button></form>` : ''}
    <form class="stack card" data-form="manage"><h3>Organizer controls · preview</h3>
      <label>Chosen date and time <select name="selectedTime"><option value="">Keep polling</option>${options}</select></label>
      <label>Add another time option <input type="datetime-local" name="newTime"></label>
      <label>Chosen restaurant <select name="restaurant"><option value="">Decide later</option>${restaurants}</select></label>
      <label>Add a restaurant option <input name="newRestaurant" maxlength="120"></label>
      <label>Booking status <select name="status">${statuses.map(s=>`<option ${s===meal.status?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Attending guests <input name="attending" maxlength="500" value="${escape(meal.attending.join(', '))}"></label>
      <button>Save meal details</button></form></div>`);
}
function peopleForm() {
  show('Connections', `<form class="stack" data-form="people"><p class="muted">Keep a local list of people you plan meals with.</p><label>Names, separated by commas <input name="people" maxlength="800" value="${escape(state.people.join(', '))}"></label><button class="primary">Save connections</button></form>`);
}
function busyForm() {
  show('Calendar blocks', `<form class="stack" data-form="busy"><p class="muted">Add a block to see how conflicts appear in the time poll.</p>
    ${state.busy.map((b,i)=>`<div class="row spread"><span>${escape(dateTime(b.start))} – ${escape(dateTime(b.end))}</span><button type="button" data-action="busy-remove" data-id="${i}">Remove</button></div>`).join('')}
    <label>Start <input type="datetime-local" name="start" required></label><label>End <input type="datetime-local" name="end" required></label><button class="primary">Add block</button></form>`);
}

document.addEventListener('click', event=>{
  const button = event.target.closest('button');
  if (!button) return;
  const { action, id, view: tab } = button.dataset;
  if (tab) { view=tab; render(); window.scrollTo(0,0); return; }
  switch(action) {
    case 'close': panel.close(); break;
    case 'range': days=Number(button.dataset.days); render(); break;
    case 'previous': anchor=moveDays(anchor,-days); render(); break;
    case 'next': anchor=moveDays(anchor,days); render(); break;
    case 'today': anchor=new Date(); render(); break;
    case 'new': mealForm(); break;
    case 'share': {
      const { id, title, location, duration, times, restaurants } = activeMeal;
      const url = new URL(window.location.href);
      url.hash = 'preview=' + encodeURIComponent(JSON.stringify({ id, title, location, duration, times, restaurants }));
      if(navigator.share) navigator.share({ title, url: url.href }).catch(error=>{if(error.name!=='AbortError') copyPreview(url.href);});
      else copyPreview(url.href);
      break;
    }
    case 'meal': mealDetails(state.meals.find(m=>m.id===id)); break;
    case 'people': peopleForm(); break;
    case 'busy': busyForm(); break;
    case 'busy-remove': state.busy.splice(Number(id),1); save(); busyForm(); break;
    case 'add-time': {
      const options=document.querySelector('#time-options');
      if(options.children.length>=10) { message('The poll already has 10 time options.'); break; }
      options.insertAdjacentHTML('beforeend',timeInput());
      options.lastElementChild.querySelector('input').focus();
      break;
    }
    case 'remove-time': button.parentElement.remove(); break;
    case 'wish-new': show('Add to your wish list', '<form class="stack" data-form="wish"><label>Restaurant <input name="name" maxlength="120" required></label><label>City or neighbourhood <input name="location" maxlength="120"></label><button class="primary">Save restaurant</button></form>'); break;
    case 'wish-interest':
      activeWish=state.wishes.find(w=>w.id===id);
      show(activeWish.name,`<form class="stack" data-form="interest"><label>Interested guests, separated by commas <input name="people" maxlength="500" value="${escape(activeWish.interested.join(', '))}"></label><button class="primary">Save interest list</button></form>`);
      break;
    case 'wish-date': mealForm(state.wishes.find(w=>w.id===id)); break;
  }
});

panel.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target, data=new FormData(form);
  const value=name=>String(data.get(name)||'').trim();
  switch(form.dataset.form) {
    case 'new': {
      const times=[...new Set(data.getAll('time').filter(Boolean).map(t=>new Date(t).toISOString()))].sort();
      const restaurants=split(value('restaurants'));
      if(!value('title')||(!times.length&&!restaurants.length)) { message('Enter a meal name and at least one option.'); return; }
      const meal={id:crypto.randomUUID(),title:value('title'),location:value('location'),duration:Number(value('duration')),
        times,restaurants,guests:split(value('guests')),votes:{},status:statuses[0],selectedTime:'',restaurant:'',attending:[]};
      state.meals.push(meal); view='polls'; save(); render(); mealDetails(meal); return;
    }
    case 'vote': {
      const person=value('person');
      if(!person) return;
      state.profile=person;
      Object.defineProperty(activeMeal.votes,person,{value:{times:activeMeal.selectedTime?(Object.hasOwn(activeMeal.votes,person)?activeMeal.votes[person].times:[]):data.getAll('times'),restaurants:activeMeal.restaurant?(Object.hasOwn(activeMeal.votes,person)?activeMeal.votes[person].restaurants:[]):data.getAll('restaurants')},enumerable:true,writable:true,configurable:true});
      save(); render(); mealDetails(activeMeal); message('Response saved on this device.'); return;
    }
    case 'manage': {
      const newTime=value('newTime'), restaurant=value('newRestaurant');
      const time=newTime?new Date(newTime).toISOString():'';
      if(time&&!activeMeal.times.includes(time)&&activeMeal.times.length>=10) { message('The poll already has 10 time options.'); return; }
      if(time&&!activeMeal.times.includes(time)) activeMeal.times.push(time);
      activeMeal.times.sort();
      if(restaurant&&!activeMeal.restaurants.includes(restaurant)) activeMeal.restaurants.push(restaurant);
      Object.assign(activeMeal,{selectedTime:value('selectedTime'),restaurant:value('restaurant'),status:value('status'),attending:split(value('attending'))});
      if(activeMeal.selectedTime){anchor=new Date(activeMeal.selectedTime);view='dashboard';}
      save(); render(); mealDetails(activeMeal); message('Meal details saved.'); return;
    }
    case 'people': state.people=split(value('people')); break;
    case 'busy':
      if(!(new Date(value('end'))>new Date(value('start')))) { message('The end must come after the start.'); return; }
      state.busy.push({start:value('start'),end:value('end')}); save(); busyForm(); return;
    case 'wish':
      if(!value('name')) return;
      state.wishes.push({id:crypto.randomUUID(),name:value('name'),location:value('location'),interested:[]}); break;
    case 'interest': activeWish.interested=split(value('people')); break;
  }
  save(); panel.close(); render();
});

async function copyPreview(url) {
  try { await navigator.clipboard.writeText(url); message('Preview link copied.'); }
  catch { show('Share a preview copy', `<label>Copy this link<input readonly value="${escape(url)}"></label>`); }
}

function openPreviewLink() {
  if (!location.hash.startsWith('#preview=')) return;
  try {
    const entry=JSON.parse(decodeURIComponent(location.hash.slice(9)));
    if (!/^[0-9a-f-]{36}$/i.test(entry.id)||typeof entry.title!=='string'||!entry.title.trim()||
        entry.title.length>100||typeof entry.location!=='string'||entry.location.length>120||
        !durations.includes(entry.duration)||!Array.isArray(entry.times)||entry.times.length>10||
        entry.times.some(t=>typeof t!=='string'||t.length!==24||!t.endsWith('Z')||!Number.isFinite(+new Date(t)))||
        !Array.isArray(entry.restaurants)||entry.restaurants.length>50||
        entry.restaurants.some(r=>typeof r!=='string'||!r.trim()||r.length>450)||
        (!entry.times.length&&!entry.restaurants.length)) throw Error('Invalid preview link');
    let meal=state.meals.find(m=>m.id===entry.id);
    if(!meal){
      const {id,title,location:area,duration,times,restaurants}=entry;
      meal={id,title,location:area,duration,times,restaurants,guests:[],votes:{},status:statuses[0],selectedTime:'',restaurant:'',attending:[]};
      state.meals.push(meal);
      save();
    }
    history.replaceState(null,'',location.pathname+location.search);
    view='polls';render();mealDetails(meal);
  } catch { message('This preview link could not be opened.'); }
}

render();
openPreviewLink();

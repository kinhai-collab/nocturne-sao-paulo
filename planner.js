'use strict';

const root = document.querySelector('#planner');
const panel = document.querySelector('#panel');
const notice = document.querySelector('#notice');
const storageKey = 'nocturne-planner-preview-v1';
const durations = [60, 90, 120, 150, 180, 240];
const statuses = ['Unbooked', 'Booked', 'Confirmed', 'In-person booking only'];
const blank = { meals: [], wishes: [], people: [], busy: [] };
let state;
try { state = { ...blank, ...JSON.parse(localStorage.getItem(storageKey)) }; }
catch { state = structuredClone(blank); }
state.meals = [];
let view = 'dashboard';
let days = 3;
let anchor = new Date();
let activeMeal = null;
let activeWish = null;
let noticeTimer;
let credential = '';
let provider = 'google';
const microsoftFlowKey = 'nocturne-microsoft-flow';
let microsoftClient;
let signingIn = false;
let requestInFlight = false;
let invite = new URLSearchParams(location.hash.slice(1)).get('invite');
const endpoint = new URL('meal-planner', window.POLL_CONFIG.endpoint).href;

async function api(action, payload = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credential, ...(provider === 'microsoft' ? { 'Authorization-Provider': 'microsoft' } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok && action === 'list' && !Array.isArray(data)) throw Error('Could not load your meals.');
  if (response.status === 401) {
    credential = '';
    state.meals = [];
    if (panel.open) panel.close();
    render();
  }
  if (!response.ok) throw Error(data.error || 'Could not reach the meal planner.');
  return data;
}
async function refresh() {
  const meals = await api('list');
  state.meals = meals;
  render();
}
async function finishSignIn() {
  let joined;
  if (invite) {
    try { joined = await api('join', { invite }); }
    catch (error) {
      if (!credential || !/unavailable|invalid/i.test(error.message)) throw error;
      message(error.message);
    }
    invite = null;
    history.replaceState(null, '', location.pathname + location.search);
  }
  await refresh();
  if (joined) mealDetails(state.meals.find(meal => meal.id === joined.id));
  else if (panel.open) panel.close();
}

async function getMicrosoftClient() {
  if (!microsoftClient) {
    const { PublicClientApplication } = await import('https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.30.0/+esm');
    const client = new PublicClientApplication({
      auth: {
        clientId: 'f3b49437-bb05-4ea3-a4cb-9925ea767320',
        authority: 'https://login.microsoftonline.com/consumers',
        redirectUri: new URL('planner.html', location.href).href,
        navigateToLoginRequestUrl: false,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    await client.initialize();
    microsoftClient = client;
  }
  return microsoftClient;
}
async function startMicrosoft(linking) {
  try {
    sessionStorage.setItem(microsoftFlowKey, JSON.stringify({ invite, linking }));
    const client = await getMicrosoftClient();
    await client.loginRedirect({ scopes: ['openid', 'profile'], prompt: 'select_account' });
  } catch (error) {
    sessionStorage.removeItem(microsoftFlowKey);
    message('Microsoft sign-in could not start. Try again in your browser.');
  }
}
async function resumeMicrosoft() {
  const pending = sessionStorage.getItem(microsoftFlowKey);
  if (!pending) return;
  sessionStorage.removeItem(microsoftFlowKey);
  try {
    const { invite: savedInvite, linking } = JSON.parse(pending);
    invite = savedInvite;
    const result = await (await getMicrosoftClient()).handleRedirectPromise();
    if (!result?.idToken) return;
    credential = result.idToken;
    provider = 'microsoft';
    await finishSignIn();
    if (linking) await startSignIn(true);
  } catch (error) { message(error.message); }
}

async function startSignIn(linking = false) {
  if (signingIn) return;
  signingIn = true;
  show(linking ? 'Link your Google account' : 'Sign in with Google',
    '<div id="planner-google" class="stack"><p class="muted">Loading Google sign-in…</p></div>');
  try {
    if (!window.google?.accounts?.id) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      const timer = setTimeout(() => reject(Error('Google sign-in did not load. Try opening this link in Chrome or Safari.')), 12000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(Error('Google sign-in did not load. Try opening this link in Chrome or Safari.')); };
      document.head.append(script);
    });
    google.accounts.id.initialize({
      client_id: window.POLL_CONFIG.googleClientId,
      callback: async result => {
        try {
          if (linking) {
            await api('link', { googleCredential: result.credential });
            await refresh();
            if (panel.open) panel.close();
            message('Accounts linked. Both sign-in methods now open the same planner.');
          } else {
            provider = 'google';
            credential = result.credential;
            await finishSignIn();
          }
        } catch (error) {
          if (!linking) credential = '';
          message(error.message);
        }
      },
    });
    const button = document.querySelector('#planner-google');
    if (button) {
      button.replaceChildren();
      google.accounts.id.renderButton(button, { theme: 'outline', size: 'large', text: 'signin_with' });
    }
  } catch (error) { message(error.message); }
  finally { signingIn = false; }
}

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
  try { const { wishes, people, busy } = state; localStorage.setItem(storageKey, JSON.stringify({ wishes, people, busy })); }
  catch { message('This browser could not save your changes.'); }
}
function message(text) {
  const target = panel.open ? panel.querySelector('.dialog-notice') : notice;
  if (!target) return;
  target.textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { target.textContent = ''; }, 6500);
}
function show(title, body) {
  panel.innerHTML = `<div class="row spread"><h2 id="panel-title">${escape(title)}</h2><button type="button" data-action="close" aria-label="Close">×</button></div>${body}<p class="dialog-notice" role="status"></p>`;
  if (!panel.open) panel.showModal();
}
function statusPill(text) { return `<span class="pill">${escape(text)}</span>`; }

function card(meal) {
  const responses = meal.organizer ? meal.responses.length : Number(Boolean(meal.myVote));
  const attendance = meal.attending.length;
  return `<article class="card stack"><div class="row spread"><h3>${escape(meal.title)}</h3>${statusPill(status(meal))}</div>
    <div class="muted">${meal.selectedTime ? escape(dateTime(meal.selectedTime)) + ' · ' + durationLabel(meal.duration) : meal.times.length + ' time options · ' + meal.restaurants.length + ' restaurant options'}</div>
    <div>${escape(meal.restaurant || meal.location || 'Restaurant to be decided')}</div>
    <small>${meal.selectedTime ? attendance + ' attending' : meal.organizer ? responses + ' responses' : responses ? 'Response saved' : 'Awaiting your response'} · ${meal.joinedCount ?? 0} joined${meal.selectedTime && attendance ? ' · ' + escape(meal.attending.join(', ')) : ''}</small>
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
  root.innerHTML = `<section class="hero"><p class="eyebrow">Meal planner</p><h1>${names[view]}</h1>
    <p class="muted">${credential ? 'Share a poll link and see responses as guests vote.' : invite ? 'You’ve been invited to a meal. Sign in to view the options and vote. If Google sign-in is blocked in your messaging app, open this link in Chrome or Safari.' : 'Sign in to plan meals, invite guests, and collect responses.'}</p>
    <div class="row">${credential ? '<button class="primary" data-action="new">Plan a meal</button><button data-action="refresh">Refresh responses</button><button data-action="signout">Sign out</button>' + (provider === 'google' ? '<button data-action="link-microsoft">Link Microsoft account</button>' : '<button data-action="link-google">Link Google account</button>') : '<button class="primary" data-action="signin">Sign in with Google</button><button data-action="microsoft">Sign in with Microsoft</button>'}<button data-action="people">Connections</button><button data-action="busy">Calendar blocks</button></div></section>
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
    <label>Guest names for your plan, separated by commas <input name="guests" maxlength="500" value="${escape(wish?.interested.join(', '))}" list="connections"></label>
    <datalist id="connections">${state.people.map(p=>`<option value="${escape(p)}"></option>`).join('')}</datalist>
    <small>Start with a time, a restaurant, or both. Share the invite after creating the poll.</small><button class="primary">Create poll</button></form>`);
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
  const vote = meal.myVote || { times: [], restaurants: [] };
  const tally = (key, val) => meal.organizer ? meal.responses.filter(r=>r.vote[key].includes(val)).length : 0;
  const votesLabel = (key, val) => meal.organizer ? ' · '+tally(key,val)+' votes' : '';
  const guests = meal.guests.length ? escape(meal.guests.join(', ')) : 'None entered';
  const options = meal.times.map(t=>`<option value="${escape(t)}" ${t===meal.selectedTime?'selected':''}>${escape(dateTime(t))}${votesLabel('times',t)}</option>`).join('');
  const restaurants = meal.restaurants.map(r=>`<option value="${escape(r)}" ${r===meal.restaurant?'selected':''}>${escape(r)}${votesLabel('restaurants',r)}</option>`).join('');
  show(meal.title, `<div class="stack"><div>${statusPill(status(meal))} · ${durationLabel(meal.duration)}</div>
    <p class="muted">Guests: ${guests}</p>
    ${meal.organizer ? `<div class="row"><button data-action="share">Share invite</button><a class="button" href="https://wa.me/?text=${encodeURIComponent(inviteUrl(meal))}" target="_blank" rel="noopener">WhatsApp</a><button data-action="refresh-meal">Refresh responses</button></div>
    <section class="card stack"><h3>Guest responses · ${meal.responses.length}</h3>${meal.responses.map(({name,vote})=>`<div><strong>${escape(name)}</strong><div><small>Times: ${escape(vote.times.map(dateTime).join(', ') || 'None selected')}</small></div><div><small>Restaurants: ${escape(vote.restaurants.join(', ') || 'None selected')}</small></div></div>`).join('') || '<p class="muted">No responses yet.</p>'}</section>` : '<p class="muted">The organizer can see your display name and your choices.</p>'}
    ${meal.restaurant ? `<a href="${maps(meal.restaurant,meal.location)}" target="_blank" rel="noopener">Find ${escape(meal.restaurant)} on Google Maps ↗</a>` : ''}
    ${isPolling(meal) ? `<form class="stack card" data-form="vote"><h3>Respond to poll</h3>
      <fieldset><legend>Times that work</legend>${choices(meal.selectedTime?[]:meal.times,'times',vote.times,t=>escape(dateTime(t))+votesLabel('times',t)+(hasConflict(t,meal.duration)?' · ⚠ Calendar block overlaps':''))}</fieldset>
      <fieldset><legend>Restaurants you’d visit</legend>${choices(meal.restaurant?[]:meal.restaurants,'restaurants',vote.restaurants,r=>escape(r)+votesLabel('restaurants',r))}</fieldset><button class="primary">Save response</button></form>` : ''}
    ${meal.organizer ? `<form class="stack card" data-form="manage"><h3>Organizer controls</h3>
      <label>Chosen date and time <select name="selectedTime"><option value="">Keep polling</option>${options}</select></label>
      <label>Add another time option <input type="datetime-local" name="newTime"></label>
      <label>Chosen restaurant <select name="restaurant"><option value="">Decide later</option>${restaurants}</select></label>
      <label>Add a restaurant option <input name="newRestaurant" maxlength="120"></label>
      <label>Booking status <select name="status">${statuses.map(s=>`<option ${s===meal.status?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Attending guests <input name="attending" maxlength="500" value="${escape(meal.attending.join(', '))}"></label>
      <button>Save meal details</button></form>` : ''}</div>`);
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
    case 'new': if (credential) mealForm(); else startSignIn(); break;
    case 'signin': startSignIn(); break;
    case 'microsoft': startMicrosoft(false); break;
    case 'link-microsoft': startMicrosoft(true); break;
    case 'link-google': startSignIn(true); break;
    case 'signout':
      credential=''; state.meals=[]; window.google?.accounts?.id?.disableAutoSelect(); microsoftClient?.clearCache().catch(()=>{}); render(); break;
    case 'refresh':
      refresh().then(()=>message('Responses refreshed.')).catch(error=>message(error.message)); break;
    case 'refresh-meal': {
      const id = activeMeal.id;
      refresh().then(()=>{ if(panel.open) mealDetails(state.meals.find(meal=>meal.id===id)); }).catch(error=>message(error.message));
      break;
    }
    case 'share': {
      const url = inviteUrl(activeMeal);
      if(navigator.share) navigator.share({ title: activeMeal.title, url }).catch(error=>{if(error.name!=='AbortError') copyInvite(url);});
      else copyInvite(url);
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
    case 'wish-date': if (credential) mealForm(state.wishes.find(w=>w.id===id)); else startSignIn(); break;
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
      const details={title:value('title'),location:value('location'),duration:Number(value('duration')),
        times,restaurants,guests:split(value('guests')),status:statuses[0],selectedTime:'',restaurant:'',attending:[]};
      syncMeal('create', { details }); return;
    }
    case 'vote': {
      syncMeal('vote', { id: activeMeal.id, vote: { times: data.getAll('times'), restaurants: data.getAll('restaurants') } }); return;
    }
    case 'manage': {
      const newTime=value('newTime');
      const time=newTime?new Date(newTime).toISOString():'', restaurant=value('newRestaurant');
      const times=[...new Set([...activeMeal.times,...(time?[time]:[])])].sort();
      if(times.length>10) { message('The poll already has 10 time options.'); return; }
      const restaurants=[...new Set([...activeMeal.restaurants,...(restaurant?[restaurant]:[])])];
      const details={...activeMeal,times,restaurants,selectedTime:value('selectedTime'),restaurant:value('restaurant'),
        status:value('status'),attending:split(value('attending'))};
      for (const key of ['id','version','invite','myVote','responses','organizer','joinedCount']) delete details[key];
      syncMeal('manage', { id: activeMeal.id, version: activeMeal.version, details }); return;
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

async function syncMeal(action, payload) {
  if (requestInFlight) return;
  requestInFlight = true;
  const buttons = panel.querySelectorAll('[type=submit], form button:not([type])');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const { id } = await api(action, payload);
    if (action === 'create') view = 'polls';
    if (action === 'manage' && payload.details.selectedTime) {
      anchor = new Date(payload.details.selectedTime);
      view = 'dashboard';
    }
    await refresh();
    if (panel.open) mealDetails(state.meals.find(meal => meal.id === id));
    message(action === 'vote' ? 'Response saved for the organizer.' : 'Meal saved.');
  } catch (error) { message(error.message); }
  finally { requestInFlight = false; buttons.forEach(button => { button.disabled = false; }); }
}

function inviteUrl(meal) {
  const url = new URL(location.pathname, location.origin);
  url.hash = 'invite=' + meal.invite;
  return url.href;
}
async function copyInvite(url) {
  try { await navigator.clipboard.writeText(url); message('Invite link copied.'); }
  catch { show('Share invite', `<label>Copy this link<input readonly value="${escape(url)}"></label>`); }
}
render();
resumeMicrosoft().catch(error=>message(error.message));

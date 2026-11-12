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
let view = ['discover','wishlist','settings','polls'].includes(new URLSearchParams(location.search).get('view')) ? new URLSearchParams(location.search).get('view') : 'dashboard';
let activeMeal = null;
let activeWish = null;
let noticeTimer;
const rememberedSessionKey = 'nocturne-planner-session';
const tabSessionKey = 'enkai-tab-session';
let credential = '';
let lastMealRefresh = 0;
let autoRefreshing = false;

function savedSession() {
  try {
    const tab=JSON.parse(sessionStorage.getItem(tabSessionKey));
    if(tab)return tab;
    const saved=JSON.parse(localStorage.getItem(rememberedSessionKey));
    return saved ? {...saved,persistent:true} : null;
  }
  catch { return null; }
}
function forgetSession() {
  try { localStorage.removeItem(rememberedSessionKey); } catch {}
  try { sessionStorage.removeItem(tabSessionKey); } catch {}
}
async function rememberSession(persistent = true) {
  try {
    const { token } = await api('remember', { persistent });
    const saved = JSON.stringify({ token, provider, persistent });
    forgetSession();
    (persistent ? localStorage : sessionStorage).setItem(persistent ? rememberedSessionKey : tabSessionKey, saved);
    credential = token;
  } catch {
    // Still survive a reload for the remaining lifetime of the provider token.
    try { sessionStorage.setItem(tabSessionKey, JSON.stringify({ token: credential, provider, persistent: false })); } catch {}
    message('Signed in for this visit. Longer sign-in could not be saved.');
  }
}
async function restoreSession() {
  const saved = savedSession();
  if (!saved?.token) return;
  credential = saved.token;
  provider = saved.provider === 'microsoft' ? 'microsoft' : 'google';
  try { await finishSignIn(); }
  catch (error) { credential = ''; render(); message(error.message); }
}
async function signOut() {
  const saved = savedSession();
  if (saved?.token) {
    credential = saved.token;
    try { await api('signout'); }
    catch (error) { if (credential) { message(error.message); return; } }
  }
  forgetSession();
  sessionStorage.removeItem(planDraftKey); sessionStorage.removeItem(responseDraftKey);
  credential = '';
  state.meals = [];
  view = 'dashboard';
  window.google?.accounts?.id?.disableAutoSelect();
  microsoftClient?.clearCache().catch(()=>{});
  render();
}

const rememberSelected = () => panel.querySelector('[data-remember-me]')?.checked === true;
let provider = 'google';
const microsoftFlowKey = 'nocturne-microsoft-flow';
let microsoftClient;
let signingIn = false;
let requestInFlight = false;
let invite = new URLSearchParams(location.hash.slice(1)).get('invite');
let invitationPreview = null;
let inviteError = '';
let pendingMealId = new URLSearchParams(location.hash.slice(1)).get('meal');
const plannerUrl = new URL(location.href);
const restaurantName = plannerUrl.searchParams.get('restaurant')?.trim().slice(0, 120);
let guideBooking = restaurantName ? {
  name: restaurantName,
  location: plannerUrl.searchParams.get('location')?.trim().slice(0, 120),
} : null;
const openSignIn = Boolean(invite) || Boolean(pendingMealId) || Boolean(guideBooking) || plannerUrl.searchParams.get('signin') === '1';
function applyPlannerTheme(theme) {
  if (!['supper-club', 'after-hours'].includes(theme)) return;
  document.body.dataset.plannerTheme = theme;
  const url = new URL(location.href);
  url.searchParams.set('theme', theme);
  history.replaceState(history.state, '', url);
  const brand=document.querySelector('header .brand');
  if(brand) {const home=new URL('planner.html',location.href);home.searchParams.set('theme',theme);brand.href=home;}
}
applyPlannerTheme(plannerUrl.searchParams.get('theme') || 'supper-club');
if (openSignIn) {
  const url = new URL(location.href);
  url.searchParams.delete('signin');
  history.replaceState(history.state, '', url);
}

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
    if (credential === savedSession()?.token) forgetSession();
    credential = '';
    state.meals = [];
    persistOpenDraft();
    if (activeMeal) pendingMealId = activeMeal.id;
    if (panel.open) panel.close();
    render();
    chooseSignIn();
  }
  if (!response.ok) throw Error(data.error || 'Could not reach the meal planner.');
  return data;
}
async function refresh(inBackground = false) {
  const currentCredential = credential;
  const meals = await api('list');
  if (credential !== currentCredential || (inBackground && requestInFlight)) return;
  state.meals = meals;
  lastMealRefresh = Date.now();
  render();
}
async function refreshOnReturn() {
  if (!credential || document.hidden || panel.open || requestInFlight || autoRefreshing ||
      !['dashboard', 'polls'].includes(view) || Date.now() - lastMealRefresh < 60_000) return;
  autoRefreshing = true;
  try { await refresh(true); }
  catch { /* Keep the current plans visible when a background refresh fails. */ }
  finally { autoRefreshing = false; }
}
async function finishSignIn() {
  let joined;
  if (invite) {
    joined = await api('join', { invite });
    invite = null;
    pendingMealId = joined.id;
    setMealAddress(joined.id);
  }
  await refresh();
  if (pendingMealId) mealDetails(state.meals.find(meal => meal.id === pendingMealId));
  else if (guideBooking) {
    const restaurant = guideBooking;
    guideBooking = null;
    const url = new URL(location.href);
    url.searchParams.delete('restaurant');
    url.searchParams.delete('location');
    history.replaceState(history.state, '', url);
    mealForm(restaurant);
  } else if (panel.open) panel.close();
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
    persistOpenDraft();
    sessionStorage.setItem(microsoftFlowKey, JSON.stringify({ invite, meal: pendingMealId, linking, guideBooking, theme: document.body.dataset.plannerTheme, remember: linking ? savedSession()?.persistent === true : rememberSelected() }));
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
    const { invite: savedInvite, meal, linking, remember, theme, guideBooking: savedBooking } = JSON.parse(pending);
    invite = savedInvite;
    pendingMealId = meal || pendingMealId;
    guideBooking = savedBooking ?? guideBooking;
    const result = await (await getMicrosoftClient()).handleRedirectPromise();
    applyPlannerTheme(theme);
    if (!result?.idToken) {
      await restoreSession();
      if (guideBooking && !credential) chooseSignIn();
      return;
    }
    credential = result.idToken;
    provider = 'microsoft';
    if (linking) { await finishSignIn(); await startSignIn(true, remember); }
    else { await rememberSession(Boolean(remember)); await finishSignIn(); }
  } catch (error) { message(error.message); }
}

function chooseSignIn() {
  show(invite ? 'Join this dinner' : 'Sign in to Enkai', `<div class="stack">
    ${invite ? '<p class="muted">Sign in to save your response. Your host will see your name and choices.</p>' : '<p class="muted">Keep your invitations and dinner plans together.</p>'}
    <div id="planner-google" class="stack"><p>Loading Google sign-in…</p></div>
    <button type="button" data-action="microsoft">Continue with Microsoft</button><small>Personal Outlook, Hotmail or Microsoft account</small>
    <label class="option"><input type="checkbox" data-remember-me><span>Keep me signed in for 30 days</span></label>
    <small>Otherwise, you’ll stay signed in in this tab for up to 24 hours. <a href="privacy.html">Privacy</a></small>
  </div>`);
  startSignIn(false, false, true);
}

async function startSignIn(linking = false, remember = rememberSelected(), inline = false) {
  if (signingIn) return;
  signingIn = true;
  if (!inline) show(linking ? 'Link your Google account' : 'Sign in with Google',
    `<div id="planner-google" class="stack"><p class="muted">Loading Google sign-in…</p></div>
    ${linking ? '' : `<label class="option"><input type="checkbox" data-google-remember ${remember?'checked':''}><span>Remember me on this browser for 30 days</span></label>`}`);
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
            await rememberSession(remember);
            await refresh();
            if (panel.open) panel.close();
            message('Accounts linked. Both sign-in methods now open the same planner.');
          } else {
            const keepSignedIn = panel.querySelector('[data-google-remember], [data-remember-me]')?.checked === true;
            provider = 'google';
            credential = result.credential;
            await rememberSession(keepSignedIn);
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
  } catch (error) {
    const target = document.querySelector('#planner-google');
    if (target) target.innerHTML = '<p>Google sign-in is unavailable. Open this page in Safari or Chrome, or try Microsoft.</p><button type="button" data-action="signin">Retry Google</button>';
    message(error.message);
  }
  finally { signingIn = false; }
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const format = (date, options) => new Intl.DateTimeFormat(undefined, options).format(new Date(date));
const dateTime = date => format(date, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const split = text => [...new Set(String(text || '').split(/[,\n]/).map(item => item.trim()).filter(Boolean))];
const maps = (restaurant, location) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([restaurant, location].filter(Boolean).join(' '));
const isPolling = meal => !meal.selectedTime || (!meal.restaurant && meal.restaurants.length > 0);
const status = meal => !meal.selectedTime ? 'Choosing a date' :
  !meal.restaurant ? 'Choosing a restaurant' : meal.status === 'Unbooked' ? 'Reservation needed' : meal.status;
const durationLabel = minutes => minutes % 60 === 0 ? (minutes / 60) + ' hr' : minutes + ' min';
const mealZone = meal => EnkaiTime.validZone(meal.timeZone) ? meal.timeZone : EnkaiTime.guessZone(meal.location) || 'UTC';
const mealDateTime = (date, meal) => EnkaiTime.format(date, mealZone(meal));


function save() {
  try { const { wishes, people, busy } = state; localStorage.setItem(storageKey, JSON.stringify({ wishes, people, busy })); }
  catch { message('This browser could not save your changes.'); }
}
function message(text) {
  const target = panel.open ? panel.querySelector('.dialog-notice') : notice;
  if (!target) return;
  target.textContent = text;
  if (panel.open) target.scrollIntoView({block:'nearest'});
  clearTimeout(noticeTimer);
  if (!panel.open) noticeTimer = setTimeout(() => { target.textContent = ''; }, 6500);
}
function show(title, body) {
  panel.innerHTML = `<div class="panel-heading row spread"><h2 id="panel-title">${escape(title)}</h2><button type="button" data-action="close" aria-label="Close">×</button></div><p class="dialog-notice" role="status"></p>${body}`;
  if (!panel.open) panel.showModal();
  panel.scrollTop = 0;
}
function statusPill(text) { return `<span class="pill">${escape(text)}</span>`; }

const attendanceLabels = { going: 'Going', maybe: 'Maybe', declined: 'Can’t make it' };
function attendingGuests(meal) {
  const responses = meal.attendanceResponses || [];
  return [
    ...responses.filter(response => response.attendance === 'going').map(response => response.name),
    ...meal.attending.filter(name => !responses.some(response => response.name === name)),
  ];
}

function card(meal) {
  const responses = meal.organizer ? meal.responses.filter(item => item.vote.times.length || item.vote.restaurants.length).length : Number(Boolean(meal.myVote));
  const attendance = attendingGuests(meal).length;
  const picture = venueImage(meal.restaurant, meal.location);
  return `<article class="card stack dinner-card">${picture}<div class="row spread"><h3>${escape(meal.title)}</h3>${statusPill(status(meal))}</div>
    <div class="muted">${meal.selectedTime ? escape(mealDateTime(meal.selectedTime, meal)) + ' · ' + durationLabel(meal.duration) : meal.times.length + ' time options · ' + meal.restaurants.length + ' restaurant options'}</div>
    ${!meal.timeZone ? '<small>Destination time zone needs organizer confirmation</small>' : ''}
    <div>${escape(meal.restaurant || (meal.restaurants.length ? meal.restaurants.join(' · ') : 'Restaurant to be decided'))}</div><small>${escape(meal.location)} · ${escape(destinationLabel(meal))}</small>
    <small>${meal.organizer ? attendance+' going · '+(meal.attendanceResponses||[]).filter(r=>r.attendance==='maybe').length+' maybe · '+Math.max(0,(meal.joinedCount||0)-(meal.attendanceResponses||[]).length)+' joined guests yet to RSVP' : 'Your response: '+escape(attendanceLabels[meal.myVote?.attendance] || 'Not sent yet')}</small>
    <div class="row"><button data-action="meal" data-id="${meal.id}">${!meal.organizer ? (isPolling(meal) ? 'RSVP & vote' : 'RSVP & details') : isPolling(meal) ? 'Open poll' : !meal.restaurant ? 'Choose restaurants' : 'Meal details'}</button></div></article>`;
}
function dashboard() {
  if (!credential) return '';

  const now = Date.now();
  const dated = state.meals
    .filter(meal => meal.selectedTime)
    .sort((a, b) => Date.parse(a.selectedTime) - Date.parse(b.selectedTime));
  const upcoming = dated.filter(meal => Date.parse(meal.selectedTime) >= now);
  const next = upcoming.find(meal => meal.restaurant);
  const later = upcoming.filter(meal => meal !== next && !isPolling(meal));
  const confirmed = later.filter(meal => meal.restaurant && ['Booked', 'Confirmed'].includes(meal.status));
  const pending = later.filter(meal => !confirmed.includes(meal));
  const polling = [...upcoming.filter(isPolling), ...state.meals.filter(meal => !meal.selectedTime)];
  const past = dated.filter(meal => Date.parse(meal.selectedTime) < now).reverse();
  const group = (title, meals) => meals.length
    ? `<section class="meal-group"><h2>${title}</h2><div class="stack">${meals.map(card).join('')}</div></section>`
    : '';

  return `<section class="meal-group next-dinner"><h2>Next Dinner Date</h2>
      ${next ? card(next) : '<p class="muted">Your next dinner will appear here once a date and restaurant are chosen.</p>'}</section>
    ${group('Confirmed', confirmed)}
    ${group('Pending', pending)}
    ${group('Polling', polling)}
    ${past.length ? `<details class="meal-group past-meals"><summary>Past meals</summary><div class="stack">${past.map(card).join('')}</div></details>` : ''}`;
}
function wishlist() {
  syncGuideSaves();
  return `<div class="row spread"><h2>Places to try</h2><button class="primary" data-action="wish-new">Add a restaurant</button></div><p class="muted">Saved on this device. Companion names are your own notes; they aren’t invitations or RSVPs.</p><div class="stack">
    ${state.wishes.map(w => `<article class="card stack"><h3>${escape(w.name)}</h3><small>${escape(w.location)} · ${w.interested.length} interested</small>
      <div class="row"><a class="button" href="${maps(w.name,w.location)}" target="_blank" rel="noopener">Find on Google Maps</a><button data-action="wish-interest" data-id="${w.id}">Interest list</button><button data-action="wish-date" data-id="${w.id}">It’s a Date</button></div></article>`).join('') || '<p class="muted">Save a restaurant you’d like to visit.</p>'}</div>`;
}
function settings() {
  const link = provider === 'google'
    ? '<button data-action="link-microsoft">Link Microsoft account</button>'
    : '<button data-action="link-google">Link Google account</button>';
  return `<div class="stack">
    <section class="card stack"><h2>Account</h2><div class="row">${link}<button data-action="signout">Sign out</button></div></section>
    <section class="card stack"><h2>Appearance</h2><div class="row"><button data-action="theme" data-id="supper-club">Supper Club</button><button data-action="theme" data-id="after-hours">After Hours</button></div></section>
    <section class="card stack"><h2>Planning</h2><div class="row"><button data-action="people">Saved guests</button><button data-action="busy">Calendar blocks</button></div><small>Names and calendar blocks are saved on this device. Your Google or Outlook calendar isn’t connected.</small></section><a href="privacy.html">Privacy & account information</a>
  </div>`;
}
function render() {
  if (!credential && view==='settings') view='dashboard';
  const names={dashboard:'Your dates await',polls:'Needs your attention',wishlist:'Your saved places',settings:'Settings',discover:'Find your next table'};
  root.innerHTML=`<section class="hero"><h1>${!credential&&invite?'You’re invited':names[view]}</h1>
    ${!credential&&!invite?'<p class="muted">Good food. Your favourite people. Make a plan together.</p>':''}
    ${view==='dashboard'&&!(invite&&!credential)?`<button class="primary" data-action="${credential?'new':'choose-signin'}">${credential?'Plan an evening':'Get started'}</button>`:''}
    ${credential&&readPlanDraft()&&view==='dashboard'?'<button data-action="resume-plan">Continue your unfinished plan</button>':''}</section>
    ${!credential&&invite?invitationLanding():view==='dashboard'?(credential?dashboard():discoverView()):view==='discover'?discoverView():view==='wishlist'?wishlist():view==='settings'?settings():
      '<div class="stack">'+(state.meals.filter(isPolling).map(card).join('')||'<p>No open polls yet.</p>')+'</div>'}`;
  document.querySelector('[data-view=settings]').hidden=!credential;
  document.querySelectorAll('[data-view]').forEach(button=>{
    if(button.dataset.view===view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
}

function timeZoneSelector(selected = '') {
  const zones = [...new Set([...(selected ? [selected] : []), ...EnkaiTime.zones])];
  return `<details class="zone-setting" ${selected?'':'open'}><summary data-zone-summary>${selected?escape(zoneName(selected))+' time · Change':'Choose the destination time zone'}</summary><label>Destination time zone <select name="timeZone" required>
    <option value="">Choose the restaurant’s time zone</option>
    ${zones.map(zone => `<option value="${escape(zone)}" ${zone === selected ? 'selected' : ''}>${escape(zoneName(zone))} · ${escape(zone.split('/')[0])}</option>`).join('')}
  </select></label></details><small data-destination-time>All dinner times use the destination time zone.</small>`;
}
function timeInput(value = '', name = 'time', removable = true) {
  return `<div class="stack time-option"><div class="row"><label>Destination date and time
    <input type="datetime-local" name="${name}" value="${escape(value)}"></label>
    ${removable ? '<button type="button" data-action="remove-time" aria-label="Remove time">Remove</button>' : ''}</div>
    <label data-occurrence hidden>This time occurs twice <select name="${name}Occurrence"></select></label>
  </div>`;
}
function updateTimeInputs(form) {
  const zone = form.querySelector('[name=timeZone]')?.value;
  const hint = form.querySelector('[data-destination-time]');
  if (hint) hint.textContent = zone ? 'Times are in ' + zoneName(zone) + ', where you’ll meet.' : 'Enter a city, then confirm its time zone.';
  const summary = form.querySelector('[data-zone-summary]');
  if(summary) summary.textContent = zone ? zoneName(zone)+' time · Change' : 'Choose the destination time zone';
  for (const input of form.querySelectorAll('[name=time], [name=newTime]')) {
    input.disabled = !zone;
    const occurrence = input.closest('.time-option').querySelector('[data-occurrence]');
    occurrence.hidden = true;
    if (!input.value || !zone) continue;
    try {
      const matches = EnkaiTime.candidates(input.value, zone);
      if (matches.length > 1) {
        const select = occurrence.querySelector('select');
        const previous = select.value;
        select.innerHTML = '<option value="">Choose an occurrence</option>' + matches.map((instant, index) =>
          `<option value="${index ? 'later' : 'earlier'}">${index ? 'Second' : 'First'} · ${escape(EnkaiTime.format(instant, zone))}</option>`).join('');
        select.value = previous;
        occurrence.hidden = false;
      }
    } catch { /* Submission reports invalid dates or skipped clock-change times. */ }
  }
  if (form.dataset.form === 'manage') {
    for (const option of form.querySelectorAll('[name=selectedTime] option[value]:not([value=""])')) {
      const votes = activeMeal.responses.filter(response => response.vote.times.includes(option.value)).length;
      option.textContent = EnkaiTime.format(option.value, zone || mealZone(activeMeal)) + ' · ' + votes + ' votes';
    }
  }
}
function readDestinationTime(input, zone) {
  const occurrence = input.closest('.time-option').querySelector('select').value;
  return EnkaiTime.toInstant(input.value, zone, occurrence);
}
function chooseFlow() {
  show('Plan an evening', `<div class="stack flow-choices">
    ${readPlanDraft()?'<button class="primary" data-action="resume-plan">Continue your unfinished plan</button>':''}
    <button data-action="flow" data-id="restaurant"><strong>I know the restaurant</strong><br><small>Pick the place first</small></button>
    <button data-action="flow" data-id="date"><strong>I know the date</strong><br><small>Set a time, then choose a place</small></button>
    <button data-action="flow" data-id="undecided"><strong>Help us decide</strong><br><small>Poll dates first, then restaurants</small></button></div>`);
}
let restaurantReturn = null;

function restaurantPicker(value = '', single = false) {
  return `<fieldset class="stack"><legend>Restaurant choices</legend>
    <button type="button" data-action="browse-restaurants">Search restaurants</button>
    <div class="restaurant-selected" data-selected-restaurants></div>
    <details ${value?'open':''}><summary>Enter or edit names yourself</summary><label>Restaurant names, one per line <textarea name="restaurants" rows="3" maxlength="450">${escape(value)}</textarea></label></details>
    <input type="hidden" name="venues" value="${escape(JSON.stringify(activeMeal?.venues||[]))}">
    <small>${single?'Choose the restaurant for this evening.':'Choose one place, or 2–5 for a poll.'}</small></fieldset>`;
}

function browseRestaurants(guest = false) {
  const input = guest ? null : panel.querySelector('[name=restaurants]');
  const location = panel.querySelector('[name=location]')?.value || activeMeal?.location || '';
  restaurantReturn = { nodes: [...panel.childNodes], scrollTop: panel.scrollTop, input, guest, location, meal: activeMeal, places: [] };
  panel.classList.add('restaurant-browser');
  show('Search restaurants', `<div class="stack">
    <button type="button" data-action="return-restaurants">← Back to meal</button>
    <form class="stack" data-form="restaurant-search">
      <label>City <input type="search" required maxlength="120" data-restaurant-city placeholder="e.g. Toronto" autocomplete="off"></label>
      <label>Food type <input type="search" maxlength="100" data-restaurant-search placeholder="e.g. Sushi or Italian" autocomplete="off"></label>
      <div class="row" data-cuisine-suggestions aria-label="Cuisine suggestions"></div>
      <div class="row spread"><button type="submit" class="primary">Search</button>
        <label>Sort by <select data-restaurant-sort><option value="match">Best match</option><option value="popular">Popularity</option><option value="rating">Highest rating</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label>
      </div>
    </form>
    <p class="muted" data-restaurant-count role="status" tabindex="-1"></p>
    <div class="stack" data-restaurant-results></div>
    <small translate="no">Google Maps</small>
    <a data-google-search target="_blank" rel="noopener">Search Google Maps ↗</a>
    ${guest ? '<form class="stack" data-form="suggest"><label>Suggest a restaurant by name <input name="suggestion" required maxlength="120"></label><button>Add to poll</button></form>' : ''}
    <div class="search-footer"><button type="button" class="primary" data-action="return-restaurants" data-search-done>Done</button></div>
  </div>`);
  const search = panel.querySelector('[data-restaurant-search]');
  const city = panel.querySelector('[data-restaurant-city]');
  city.value = location;
  updateRestaurantResults(search);
  panel.querySelector('[data-restaurant-count]').textContent = 'Enter a city and select Search.';
  if (matchMedia("(pointer: fine)").matches) city.focus();
}

function closeRestaurantBrowser() {
  const previous = restaurantReturn;
  if (!previous) return;
  restaurantReturn = null;
  panel.classList.remove('restaurant-browser');
  panel.replaceChildren(...previous.nodes);
  updateSelectedRestaurants();
  persistOpenDraft();
  panel.scrollTop = previous.scrollTop;
  panel.querySelector('[data-action=browse-restaurants], [data-action=suggest-restaurant]')?.focus({ preventScroll: true });
}

const cuisineSuggestions = ['Sushi','Italian','Japanese','French','Korean','Thai','Chinese','Cantonese','Dim sum','Brazilian','Canadian','Seafood','Barbecue','Mexican','Pizza','Steakhouse'];
const normalizeRestaurantText = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

function suggestCuisines(input) {
  const query = normalizeRestaurantText(input.value);
  const matches = query ? cuisineSuggestions.filter(cuisine => {
    const name = normalizeRestaurantText(cuisine);
    return name !== query && name.startsWith(query);
  }) : [];
  panel.querySelector('[data-cuisine-suggestions]').innerHTML = matches.map(cuisine =>
    `<button type="button" data-action="search-cuisine" data-cuisine="${escape(cuisine)}">${escape(cuisine)}</button>`
  ).join('');
}

function compareRestaurantPrices(a, b, direction) {
  const rank = restaurant => restaurant.price?.length ? 0 : /^\$+$/.test(restaurant.priceLevel || '') ? 1 : 2;
  const group = rank(a);
  const difference = group - rank(b);
  if (difference) return difference;
  if (group === 0) return direction * (a.price[0] - b.price[0]);
  if (group === 1) return direction * (a.priceLevel.length - b.priceLevel.length);
  return 0;
}

function updateRestaurantResults(input) {
  const { input: names, guest, meal, location } = restaurantReturn;
  const cityInput = panel.querySelector('[data-restaurant-city]').value.trim();
  const matches = [...restaurantReturn.places];
  const sort = panel.querySelector('[data-restaurant-sort]').value;
  const popularity = r => r.rating * Math.log1p(r.reviewCount || 0) || 0;
  if (sort === 'popular') matches.sort((a,b)=>popularity(b)-popularity(a) || (b.rating || 0)-(a.rating || 0));
  if (sort === 'rating') matches.sort((a,b)=>(b.rating || 0)-(a.rating || 0) || (b.reviewCount || 0)-(a.reviewCount || 0));
  if (sort === 'low' || sort === 'high') matches.sort((a,b)=>compareRestaurantPrices(a,b,sort==='low'?1:-1));
  const selected = new Set([...(meal?.restaurants || []), ...(names?.value.split('\n') || [])].map(name=>name.trim().toLowerCase()).filter(Boolean));
  const card = (name, r) => {
    const address = r.address;
    const added = selected.has(name.toLowerCase());
    const preview = r ? [r.cuisine, r.rating ? '★ '+r.rating+(r.reviewCount?' ('+r.reviewCount.toLocaleString()+' reviews)':'') : '', r.priceLevel || 'Price not listed'].filter(Boolean).join(' · ') : '';
    return `<article class="card venue-result">
      ${r.photo?'<div class="photo-preview" data-photo-index="'+restaurantReturn.places.indexOf(r)+'">'+(r.loadedPhoto?placePhotoMarkup(r):'<button type="button" data-action="load-photo" data-photo-index="'+restaurantReturn.places.indexOf(r)+'">View restaurant photo</button>')+'</div>':venueImage(name,cityInput)}
      <div><h3>${escape(name)}</h3><small>${escape(preview)}</small><p>${escape(address)}</p>
      ${r.hours?.length?'<details><summary>Opening hours</summary><small>'+r.hours.map(escape).join('<br>')+'</small></details>':'<small>Check opening hours with the restaurant</small>'}
      <div><a href="${escape(venueMaps(name,{location:r.address||location,venues:r.placeId?[{name,placeId:r.placeId}]:[]}))}" target="_blank" rel="noopener">Reviews & location ↗</a></div>${r.attributions.map(item=>`<small>${escape(item.provider)}</small>`).join('')}</div>
      <button type="button" data-action="pick-restaurant" data-name="${escape(name)}" data-city="${escape(cityInput)}" aria-label="${added?'Added to poll':'Add to poll'}: ${escape(name)}" ${added || (guest && meal.suggested) ? 'disabled' : ''}>${added?'Added to poll':'Add to poll'}</button></article>`;
  };
  panel.querySelector('[data-restaurant-results]').innerHTML = matches.map(r=>card(r.name,r)).join('');
  panel.querySelector('[data-google-search]').href = maps(input.value.trim() || 'restaurants', cityInput || location);
  const done=panel.querySelector('[data-search-done]');
  if(done) done.textContent=guest?'Back to your response':'Done'+(selected.size?' · '+selected.size+' selected':'');
}

const googlePriceLevels = {
  PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

async function searchGooglePlaces(form) {
  const search = restaurantReturn;
  const city = form.querySelector('[data-restaurant-city]').value.trim();
  const food = form.querySelector('[data-restaurant-search]');
  const summary = panel.querySelector('[data-restaurant-count]');
  const button = form.querySelector('[type=submit]');
  if (!city || button.disabled) return;
  button.disabled = true;
  search.places = [];
  updateRestaurantResults(food);
  summary.textContent = 'Searching Google Maps…';
  try {
    const places = await api('places', { city, food: food.value.trim() });
    if (search !== restaurantReturn) return;
    search.places = places.filter(place=>place.displayName?.text).map(place=>({
      name: place.displayName.text, cuisine: place.primaryTypeDisplayName?.text,
      placeId:place.id,photo:place.photos?.[0],hours:place.regularOpeningHours?.weekdayDescriptions,
      area: place.formattedAddress, address: place.formattedAddress,
      rating: place.rating, reviewCount: place.userRatingCount,
      priceLevel: googlePriceLevels[place.priceLevel], attributions: place.attributions || [],
    }));
    updateRestaurantResults(food);
    summary.textContent = search.places.length ? `${search.places.length} Google Maps results in ${city}.` : `No results in ${city}. Try another food type.`;
  } catch (error) {
    summary.textContent = error.message;
  } finally {
    button.disabled = false;
    if (search === restaurantReturn) {
      summary.focus({ preventScroll: true });
      summary.scrollIntoView?.({ block: 'start' });
    }
  }
}

async function suggestRestaurant(name, placeId) {
  const meal = restaurantReturn?.meal;
  if (!meal || requestInFlight) return;
  requestInFlight = true;
  try {
    persistOpenDraft();
    await api('suggest', { id: meal.id, restaurant: name.trim(), ...(placeId?{placeId}:{}) });
    await refresh();
    const updated = state.meals.find(item=>item.id===meal.id);
    closeRestaurantBrowser();
    mealDetails(updated);
    message('Restaurant added to the poll. You can now vote for it.');
  } catch(error) { message(error.message); }
  finally { requestInFlight = false; }
}
function mealForm(wish, flow = 'restaurant') { openPlan(wish, flow); }

function hasConflict(time, duration) {
  const start = +new Date(time);
  const end = start + duration * 60000;
  return state.busy.some(block => start < +new Date(block.end) && end > +new Date(block.start));
}
function choices(values, name, selected, label) {
  return values.map(value=>`<label class="option"><input type="checkbox" name="${name}" value="${escape(value)}" ${selected.includes(value)?'checked':''}><span>${label(value)}</span></label>`).join('') || '<p class="muted">No options yet.</p>';
}
function mealDetails(meal) {
  if (!meal) {
    show('Dinner unavailable', '<p>We could not find this dinner. Reopen your invitation or refresh your dashboard.</p>');
    return;
  }
  activeMeal = meal;
  setMealAddress(meal.id);
  const vote = meal.myVote || { times: [], restaurants: [] };
  const tally = (key, val) => meal.organizer ? meal.responses.filter(r=>r.vote[key].includes(val)).length : 0;
  const options = meal.times.map(t=>`<option value="${escape(t)}" ${t===meal.selectedTime?'selected':''}>${escape(mealDateTime(t,meal))} · ${tally('times',t)} votes</option>`).join('');
  const restaurants = meal.restaurants.map(r=>`<option value="${escape(r)}" ${r===meal.restaurant?'selected':''}>${escape(r)} · ${tally('restaurants',r)} votes</option>`).join('');
  const responses = meal.attendanceResponses || [];
  show(meal.title, `<div class="stack dinner-detail">
    <div class="dinner-facts"><p class="eyebrow">${meal.organizer?'Your plan':'You’re invited'}</p>
      <h3>${escape(meal.restaurant || 'Choosing a restaurant together')}</h3>
      <p>${escape(meal.location)}${meal.selectedTime?' · '+durationLabel(meal.duration):''}</p>
      <p class="dinner-date">${meal.selectedTime?escape(mealDateTime(meal.selectedTime,meal)):'Choose the times that work for you'}</p>
      <small>${escape(destinationLabel(meal))}</small>${localTimeNote(meal)}
      ${!meal.timeZone?'<p class="muted">Your host needs to confirm the destination time zone for this existing plan.</p>':''}
      <p>${statusPill(status(meal))}</p>
      ${meal.restaurant?`<a href="${venueMaps(meal.restaurant,meal)}" target="_blank" rel="noopener">Restaurant reviews & directions ↗</a>`:''}
    </div>
    ${meal.organizer?`<section class="share-card stack"><h3>Invite your people</h3><div class="row"><button class="primary" data-action="share">Share invitation</button><button data-action="copy-invite">Copy link</button><a class="button" href="https://wa.me/?text=${encodeURIComponent(meal.title+' · '+inviteUrl(meal))}" target="_blank" rel="noopener">WhatsApp</a></div><small>Guest names alone don’t send invitations. Share this link to invite them.</small></section>`:''}
    ${responseReceipt===meal.id?receiptView(meal):(!meal.organizer||isPolling(meal)?responseForm(meal):'')}
    ${meal.selectedTime && meal.restaurant && meal.timeZone?'<button type="button" data-action="calendar">Add to calendar</button><small>Downloads a calendar event. Updates aren’t synced automatically.</small>':''}
    <details class="guest-details"><summary>People & responses · ${attendingGuests(meal).length} going</summary>
      <div class="stack"><p>Invited names: ${escape(meal.guests.join(', ')||'Invite by sharing the link')}</p>
      ${responses.map(r=>`<p><strong>${escape(r.name)}</strong> · ${attendanceLabels[r.attendance]}</p>`).join('')||'<p>No RSVPs yet.</p>'}
      ${meal.organizer?meal.responses.map(({name,vote})=>`<p><strong>${escape(name)}</strong><br><small>${escape(vote.times.map(t=>mealDateTime(t,meal)).join(' · ')||'No time choices')}<br>${escape(vote.restaurants.join(' · ')||'No restaurant choices')}</small></p>`).join(''):''}</div>
    </details>
    ${meal.organizer?`<details class="organizer-details" ${meal.selectedTime&&!meal.restaurant&&!meal.restaurants.length?'open':''}><summary>Finalize the plan & reservation</summary>
      <form class="stack" data-form="manage"><p class="muted">Choose the group’s date and restaurant, then record the reservation separately.</p>
      ${timeZoneSelector(meal.timeZone||EnkaiTime.guessZone(meal.location))}
      <label>Dinner date<select name="selectedTime"><option value="">Keep polling</option>${options}</select></label>
      <details><summary>Add or change the time</summary>${timeInput('','newTime',false)}<label class="option"><input type="checkbox" name="useNewTime"><span>Use this as the dinner time</span></label></details>
      <label>Restaurant<select name="restaurant"><option value="">Decide later</option>${restaurants}</select></label>
      ${meal.selectedTime&&!meal.restaurant?restaurantPicker():''}
      <label>Restaurant reservation<select name="status">${statuses.map(s=>`<option value="${s}" ${s===meal.status?'selected':''}>${{'Unbooked':'Not reserved yet','Booked':'Reserved','Confirmed':'Reservation reconfirmed','In-person booking only':'Walk-in only'}[s]}</option>`).join('')}</select></label>
      <small>Enkai doesn’t make restaurant reservations. Update this after contacting the restaurant.</small>
      <details><summary>Additional attendees</summary><label>Names without an app RSVP<input name="attending" maxlength="500" value="${escape(meal.attending.join(', '))}"></label></details>
      <button class="primary">Save plan</button></form></details><button data-action="refresh-meal">Refresh responses</button>`:''}
    </div>`);
  restoreResponseDraft(meal);
  const manageForm=panel.querySelector('[data-form=manage]');
  if(manageForm) updateTimeInputs(manageForm);
}

function peopleForm() {
  show('Saved guests', `<form class="stack" data-form="people"><p class="muted">Keep a local list of people you plan meals with.</p><label>Names, separated by commas <input name="people" maxlength="800" value="${escape(state.people.join(', '))}"></label><button class="primary">Save guests</button></form>`);
}
function busyForm() {
  show('Calendar blocks', `<form class="stack" data-form="busy"><p class="muted">Add a block to see how conflicts appear in the time poll.</p>
    ${state.busy.map((b,i)=>`<div class="row spread"><span>${escape(dateTime(b.start))} – ${escape(dateTime(b.end))}</span><button type="button" data-action="busy-remove" data-id="${i}">Remove</button></div>`).join('')}
    <label>Start <input type="datetime-local" name="start" required></label><label>End <input type="datetime-local" name="end" required></label><button class="primary">Add block</button></form>`);
}

panel.addEventListener('close',()=>{ restaurantReturn=null; panel.classList.remove('restaurant-browser'); });
panel.addEventListener('input',persistOpenDraft);
panel.addEventListener('change',persistOpenDraft);
panel.addEventListener('cancel',()=>persistOpenDraft());
window.addEventListener('popstate',()=>{
  persistOpenDraft();
  const id=new URLSearchParams(location.hash.slice(1)).get('meal');
  pendingMealId=id;
  if(credential&&id) mealDetails(state.meals.find(m=>m.id===id));
  else if(panel.open) panel.close();
});
panel.addEventListener('cancel',event=>{ if(restaurantReturn){ event.preventDefault(); closeRestaurantBrowser(); } });
panel.addEventListener('input',event=>{
  if (event.target.matches('[name=location]')) {
    const form = event.target.form;
    const zone = form?.querySelector('[name=timeZone]');
    if (zone && zone.dataset.manual !== 'true') {
      zone.value = EnkaiTime.guessZone(event.target.value);
      const setting=zone.closest('details');if(setting)setting.open=!zone.value;
      updateTimeInputs(form);
    }
  }
  if (event.target.matches('[name=time], [name=newTime]')) updateTimeInputs(event.target.form);
  if(event.target.matches('[name=restaurants]')) updateSelectedRestaurants();

  const search = panel.querySelector('[data-restaurant-search]');
  if (event.target === search) {
    suggestCuisines(search);
    updateRestaurantResults(search);
  } else if (event.target.matches('[data-restaurant-city]')) {
    updateRestaurantResults(search);
  }
  persistOpenDraft();
});
panel.addEventListener('change',event=>{
  if (event.target.matches('[name=timeZone]')) {
    event.target.dataset.manual = 'true';
    updateTimeInputs(event.target.form);
  }

  if(event.target.matches('[data-restaurant-sort]')) updateRestaurantResults(panel.querySelector('[data-restaurant-search]'));
  if(!event.target.matches('[name=dateMode]')) return;
  const options = panel.querySelector('#time-options');
  const poll = event.target.value==='poll';
  panel.querySelector('[data-action=add-time]').hidden = !poll;
  while(options.children.length>(poll?5:1)) options.lastElementChild.remove();
  while(poll && options.children.length<2) options.insertAdjacentHTML('beforeend',timeInput());
  updateTimeInputs(options.closest('form'));
});
document.addEventListener('click', event=>{
  const button = event.target.closest('button');
  if (!button) return;
  const { action, id, view: tab } = button.dataset;
  if (tab) { navigatePlanner(tab); return; }
  switch(action) {
    case 'close': if (restaurantReturn) closeRestaurantBrowser(); else {persistOpenDraft(); panel.close(); setMealAddress('',true); render();} break;
    case 'retry-invite': loadInvitation(); break;
    case 'theme': applyPlannerTheme(id); render(); break;
    case 'load-photo': showPlacePhoto(button); break;
    case 'photo-fallback': window.open(maps(button.dataset.name,button.dataset.city),'_blank','noopener'); break;
    case 'remove-restaurant': {
      const input=panel.querySelector('[name=restaurants]');
      input.value=input.value.split('\n').filter(name=>name.trim()!==button.dataset.name).join('\n');
      updateSelectedRestaurants();persistOpenDraft();break;
    }
    case 'resume-plan': openPlan(null,'restaurant',true); break;
    case 'plan-next': if(validatePlanStep()){wizardStep++;renderWizard();} break;
    case 'plan-back': persistOpenDraft(); if(wizardStep){wizardStep--;renderWizard();}else chooseFlow(); break;
    case 'edit-response': responseReceipt=''; mealDetails(activeMeal); break;
    case 'copy-invite': copyInvite(inviteUrl(activeMeal)); break;
    case 'new': if (credential) chooseFlow(); else chooseSignIn(); break;
    case 'flow': mealForm(null,id); break;
    case 'search-cuisine': {
      const search = panel.querySelector('[data-restaurant-search]');
      search.value = button.dataset.cuisine;
      suggestCuisines(search);
      updateRestaurantResults(search);
      search.focus();
      break;
    }
    case 'browse-restaurants': browseRestaurants(); break;
    case 'suggest-restaurant': browseRestaurants(true); break;
    case 'return-restaurants': closeRestaurantBrowser(); break;
    case 'pick-restaurant': {
      const { input, guest } = restaurantReturn;
      const picked=restaurantReturn.places.find(r=>r.name===button.dataset.name);
      if (guest) { suggestRestaurant(button.dataset.name,picked?.placeId); break; }
      const names = input.value.split('\n').map(name=>name.trim()).filter(Boolean);
      const limit = input.form.dataset.flow === 'restaurant' ? 1 : 5;
      if (names.length >= limit) { message(limit===1?'One restaurant is already selected.':'You can add up to five restaurants.'); break; }
      input.value = [...names,button.dataset.name].join('\n');
      const venues=input.form.querySelector('[name=venues]');
      if(venues&&picked?.placeId) venues.value=JSON.stringify([...JSON.parse(venues.value||'[]').filter(v=>v.name!==picked.name),{name:picked.name,placeId:picked.placeId}]);
      const destination = input.form.querySelector('[name=location]');
      const zone = input.form.querySelector('[name=timeZone]');
      if (button.dataset.city && destination && (input.form.dataset.flow === 'restaurant' || !destination.value)) {
        destination.value = button.dataset.city.slice(0, 120);
        if (zone && zone.dataset.manual !== 'true') zone.value = EnkaiTime.guessZone(destination.value);
        updateTimeInputs(input.form);
      }
      button.textContent = 'Added to poll';
      button.setAttribute('aria-label','Added to poll: '+button.dataset.name);
      button.disabled = true;
      persistOpenDraft();
      if(limit===1) closeRestaurantBrowser();
      else updateRestaurantResults(panel.querySelector('[data-restaurant-search]'));
      break;
    }
    case 'choose-signin': chooseSignIn(); break;
    case 'signin': startSignIn(); break;
    case 'microsoft': startMicrosoft(false); break;
    case 'link-microsoft': startMicrosoft(true); break;
    case 'link-google':
      if (credential === savedSession()?.token) startMicrosoft(true);
      else startSignIn(true);
      break;
    case 'signout':
      signOut(); break;
    case 'refresh-meal': {
      persistOpenDraft();
      const id = activeMeal.id;
      refresh().then(()=>{ if(panel.open) mealDetails(state.meals.find(meal=>meal.id===id)); }).catch(error=>message(error.message));
      break;
    }
    case 'reload-dinner': {
      refresh().then(()=>mealDetails(state.meals.find(m=>m.id===id))).catch(error=>message(error.message));
      break;
    }
    case 'share': {
      const url = inviteUrl(activeMeal);
      if(navigator.share) navigator.share({ title: activeMeal.title, url }).catch(error=>{if(error.name!=='AbortError') copyInvite(url);});
      else copyInvite(url);
      break;
    }
    case 'calendar': downloadCalendar(activeMeal); break;
    case 'meal': responseReceipt=''; mealDetails(state.meals.find(m=>m.id===id)); break;
    case 'people': peopleForm(); break;
    case 'busy': busyForm(); break;
    case 'busy-remove': state.busy.splice(Number(id),1); save(); busyForm(); break;
    case 'add-time': {
      const options=document.querySelector('#time-options');
      if(options.children.length>=5) { message('Add up to five times.'); break; }
      options.insertAdjacentHTML('beforeend',timeInput());
      updateTimeInputs(options.closest('form'));
      options.lastElementChild.querySelector('input').focus();
      break;
    }
    case 'remove-time': {
      const option = button.closest('.time-option');
      if (option.parentElement.children.length > 1) option.remove();
      else { option.querySelector('input').value = ''; updateTimeInputs(option.closest('form')); }
      break;
    }
    case 'wish-new': show('Add to your wish list', '<form class="stack" data-form="wish"><label>Restaurant <input name="name" maxlength="120" required></label><label>City or neighbourhood <input name="location" maxlength="120"></label><button class="primary">Save restaurant</button></form>'); break;
    case 'wish-interest':
      activeWish=state.wishes.find(w=>w.id===id);
      show(activeWish.name,`<form class="stack" data-form="interest"><label>Interested guests, separated by commas <input name="people" maxlength="500" value="${escape(activeWish.interested.join(', '))}"></label><button class="primary">Save interest list</button></form>`);
      break;
    case 'wish-date': if (credential) mealForm(state.wishes.find(w=>w.id===id)); else chooseSignIn(); break;
  }
});

panel.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target, data=new FormData(form);
  const value=name=>String(data.get(name)||'').trim();
  const destinationTimeZone = value('timeZone');
  try {
  switch(form.dataset.form) {
    case 'new': {
      const flow = form.dataset.flow;
      if(form.classList.contains('wizard') && wizardStep < form.querySelectorAll('[data-step]').length-1){if(validatePlanStep()){wizardStep++;renderWizard();}return;}
      const pollTime = flow==='undecided' || value('dateMode')==='poll';
      const times=[...new Set(Array.from(form.querySelectorAll('[name=time]')).filter(input=>input.value).map(input=>readDestinationTime(input,destinationTimeZone)))].sort();
      const restaurants=[...new Set(value('restaurants').split('\n').map(name=>name.trim()).filter(Boolean))];
      if(!value('title')) { message('Enter a meal name.'); return; }
      if(pollTime ? times.length<2 || times.length>5 : times.length!==1) {
        message(pollTime?'Add two to five different times.':'Choose one date and time.'); return;
      }
      if(flow==='restaurant' && restaurants.length!==1) { message('Choose one restaurant.'); return; }
      if(flow==='date' && (restaurants.length>5)) { message('Choose up to five restaurants.'); return; }
      const details={title:value('title'),location:value('location'),timeZone:destinationTimeZone,duration:Number(value('duration')),
        venues:JSON.parse(value('venues')||'[]').filter(v=>restaurants.includes(v.name)),
        times,restaurants,guests:[...new Set([...data.getAll('contacts'),...split(value('guests'))])],
        status:statuses[0],selectedTime:pollTime?'':times[0],restaurant:restaurants.length===1?restaurants[0]:'',attending:[]};
      const newContacts = data.has('saveContacts') ? split(value('guests')) : [];
      syncMeal('create', { details }, newContacts); return;
    }
    case 'restaurant-search': searchGooglePlaces(form); return;
    case 'suggest': suggestRestaurant(value('suggestion')); return;
    case 'respond': {
      persistOpenDraft();
      syncMeal('respond', {id:activeMeal.id, version:activeMeal.version,
        ...(!activeMeal.organizer?{attendance:value('attendance')}:{}),
        vote:{times:activeMeal.selectedTime?(activeMeal.myVote?.times||[]):data.getAll('times'),
          restaurants:activeMeal.restaurant?(activeMeal.myVote?.restaurants||[]):data.getAll('restaurants')}});
      return;
    }
    case 'rsvp': {
      syncMeal('rsvp', { id: activeMeal.id, attendance: value('attendance') }); return;
    }
    case 'vote': {
      syncMeal('vote', { id: activeMeal.id, vote: { times: data.getAll('times'), restaurants: data.getAll('restaurants') } }); return;
    }
    case 'manage': {
      const newTime=value('newTime');
      const time=newTime?readDestinationTime(form.querySelector('[name=newTime]'),destinationTimeZone):'';
      if (!EnkaiTime.validZone(destinationTimeZone)) { message('Choose the destination time zone.'); return; }
      if (data.has('useNewTime') && !time) { message('Enter the new destination date and time.'); return; }
      const times=[...new Set([...activeMeal.times,...(time?[time]:[])])].sort();
      if(times.length>Math.max(5,activeMeal.times.length)) { message('Add up to five times.'); return; }
      const additions=value('restaurants').split('\n').map(name=>name.trim()).filter(Boolean);
      const restaurants=[...new Set([...activeMeal.restaurants,...additions])];
      if(additions.length && !value('selectedTime')) { message('Choose the date before opening a restaurant poll.'); return; }
      if(additions.length && (restaurants.length>5)) { message('Choose up to five restaurants.'); return; }
      const details={...activeMeal,times,restaurants,timeZone:destinationTimeZone,selectedTime:data.has('useNewTime') && time ? time : value('selectedTime'),restaurant:value('restaurant') || (additions.length && restaurants.length===1 ? restaurants[0] : ''),
        venues:JSON.parse(value('venues')||JSON.stringify(activeMeal.venues||[])).filter(v=>restaurants.includes(v.name)),
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
  } catch (error) { message(error.message); }
});

async function syncMeal(action, payload, newContacts = []) {
  if (requestInFlight) return;
  requestInFlight = true;
  const buttons = panel.querySelectorAll('[type=submit], form button:not([type])');
  buttons.forEach(button => { button.disabled = true; });
  let savedId;
  try {
    const { id } = await api(action, payload);
    savedId=id;
    setMealAddress(id,true);
    if(action==='respond') {sessionStorage.removeItem(responseDraftKey);responseReceipt=id;}
    if(action==='create') sessionStorage.removeItem(planDraftKey);
    if (action === 'create') {
      if (newContacts.length) {
        state.people = [...new Set([...state.people,...newContacts])];
        save();
      }
      view = payload.details.selectedTime ? 'dashboard' : 'polls';
    }
    if (action === 'manage' && payload.details.selectedTime) {
      view = 'dashboard';
    }
    await refresh();
    if (panel.open) mealDetails(state.meals.find(meal => meal.id === id));
    message(action === 'respond' ? 'Your complete response is saved.' : action === 'rsvp' ? 'Your RSVP is saved. The organizer can see your response.' : action === 'vote' ? 'Your votes are saved for the organizer.' : 'Meal saved.');
  } catch (error) {
    if(savedId && credential) show('Saved — reconnect to continue','<p>Your changes were saved, but the updated dinner could not be loaded.</p><button class="primary" data-action="reload-dinner" data-id="'+escape(savedId)+'">Open the saved dinner</button>');
    message(error.message);
  }
  finally { requestInFlight = false; buttons.forEach(button => { button.disabled = false; }); }
}

function inviteUrl(meal) {
  const hex = meal.invite.replaceAll('-', '');
  const bytes = hex.match(/../g).map(pair => String.fromCharCode(parseInt(pair, 16))).join('');
  const code = btoa(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = new URL('i.html', location.href);
  url.searchParams.set('code', code);
  if (document.body.dataset.plannerTheme) url.searchParams.set('theme', document.body.dataset.plannerTheme);
  return url.href;
}
async function copyInvite(url) {
  try { await navigator.clipboard.writeText(url); message('Invite link copied.'); }
  catch { show('Share invite', `<label>Copy this link<input readonly value="${escape(url)}"></label>`); }
}
document.addEventListener('visibilitychange', refreshOnReturn);
window.addEventListener('pageshow', event => { if (event.persisted) refreshOnReturn(); });

render();
if (sessionStorage.getItem(microsoftFlowKey)) resumeMicrosoft().catch(error=>message(error.message));
else restoreSession().then(() => {
  if(!credential && invite) loadInvitation();
  else if(openSignIn && !credential) chooseSignIn();
});

function downloadCalendar(meal) {
  if (!meal?.selectedTime || !meal.restaurant || !EnkaiTime.validZone(meal.timeZone)) {
    message('Confirm the destination time zone, dinner time, and restaurant first.');
    return;
  }
  const blob = new Blob([EnkaiTime.calendar(meal)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'enkai-dinner.ics';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

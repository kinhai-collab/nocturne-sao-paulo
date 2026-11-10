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
let activeMeal = null;
let activeWish = null;
let noticeTimer;
const rememberedSessionKey = 'nocturne-planner-session';
let credential = '';

function savedSession() {
  try { return JSON.parse(localStorage.getItem(rememberedSessionKey)); }
  catch { return null; }
}
function forgetSession() {
  try { localStorage.removeItem(rememberedSessionKey); } catch {}
}
async function rememberSession() {
  try {
    const { token } = await api('remember');
    localStorage.setItem(rememberedSessionKey, JSON.stringify({ token, provider }));
    credential = token;
  } catch {
    message('Signed in for now. This browser could not remember your sign-in.');
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
  credential = '';
  state.meals = [];
  window.google?.accounts?.id?.disableAutoSelect();
  microsoftClient?.clearCache().catch(()=>{});
  render();
}

const rememberSelected = () => root.querySelector('[data-remember-me]')?.checked === true;
let provider = 'google';
const microsoftFlowKey = 'nocturne-microsoft-flow';
let microsoftClient;
let signingIn = false;
let requestInFlight = false;
let invite = new URLSearchParams(location.hash.slice(1)).get('invite');
const plannerUrl = new URL(location.href);
const openSignIn = plannerUrl.searchParams.get('signin') === '1';
function applyPlannerTheme(theme) {
  if (!['supper-club', 'after-hours'].includes(theme)) return;
  document.body.dataset.plannerTheme = theme;
  const url = new URL(location.href);
  url.searchParams.set('theme', theme);
  history.replaceState(history.state, '', url);
}
applyPlannerTheme(plannerUrl.searchParams.get('theme'));
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
    sessionStorage.setItem(microsoftFlowKey, JSON.stringify({ invite, linking, theme: document.body.dataset.plannerTheme, remember: linking ? Boolean(savedSession()) : rememberSelected() }));
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
    const { invite: savedInvite, linking, remember, theme } = JSON.parse(pending);
    invite = savedInvite;
    const result = await (await getMicrosoftClient()).handleRedirectPromise();
    applyPlannerTheme(theme);
    if (!result?.idToken) return restoreSession();
    credential = result.idToken;
    provider = 'microsoft';
    await finishSignIn();
    if (linking) await startSignIn(true, remember);
    else if (remember) await rememberSession();
  } catch (error) { message(error.message); }
}

function chooseSignIn() {
  show('Sign in to Enkai', `<div class="stack">
    <button type="button" data-action="signin">Continue with Google</button>
    <button type="button" data-action="microsoft">Continue with Microsoft</button>
  </div>`);
}

async function startSignIn(linking = false, remember = rememberSelected()) {
  if (signingIn) return;
  signingIn = true;
  show(linking ? 'Link your Google account' : 'Sign in with Google',
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
            if (remember && !savedSession()) await rememberSession();
            await refresh();
            if (panel.open) panel.close();
            message('Accounts linked. Both sign-in methods now open the same planner.');
          } else {
            const keepSignedIn = panel.querySelector('[data-google-remember]')?.checked === true;
            provider = 'google';
            credential = result.credential;
            await finishSignIn();
            if (keepSignedIn) await rememberSession();
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
const split = text => [...new Set(String(text || '').split(/[,\n]/).map(item => item.trim()).filter(Boolean))];
const maps = (restaurant, location) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([restaurant, location].filter(Boolean).join(' '));
const isPolling = meal => !meal.selectedTime || (!meal.restaurant && meal.restaurants.length > 0);
const status = meal => !meal.selectedTime ? 'Choosing a date' :
  !meal.restaurant ? 'Choosing a restaurant' : meal.status === 'Unbooked' ? 'Reservation needed' : meal.status;
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
  panel.scrollTop = 0;
}
function statusPill(text) { return `<span class="pill">${escape(text)}</span>`; }

function card(meal) {
  const responses = meal.organizer ? meal.responses.length : Number(Boolean(meal.myVote));
  const attendance = meal.attending.length;
  return `<article class="card stack"><div class="row spread"><h3>${escape(meal.title)}</h3>${statusPill(status(meal))}</div>
    <div class="muted">${meal.selectedTime ? escape(dateTime(meal.selectedTime)) + ' · ' + durationLabel(meal.duration) : meal.times.length + ' time options · ' + meal.restaurants.length + ' restaurant options'}</div>
    <div>${escape(meal.restaurant || (meal.restaurants.length ? meal.restaurants.join(' · ') : 'Restaurant to be decided'))}</div>
    <small>${meal.selectedTime ? attendance + ' attending' : meal.organizer ? responses + ' responses' : responses ? 'Response saved' : 'Awaiting your response'} · ${meal.joinedCount ?? 0} joined${meal.organizer ? '' : ' · Guest'}${meal.selectedTime && attendance ? ' · ' + escape(meal.attending.join(', ')) : ''}</small>
    <div class="row"><button data-action="meal" data-id="${meal.id}">${isPolling(meal) ? 'Open poll' : meal.organizer && !meal.restaurant ? 'Choose restaurants' : 'Meal details'}</button></div></article>`;
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
  return `<div class="row spread"><h2>Places to try</h2><button class="primary" data-action="wish-new">Add a restaurant</button></div><div class="stack">
    ${state.wishes.map(w => `<article class="card stack"><h3>${escape(w.name)}</h3><small>${escape(w.location)} · ${w.interested.length} interested</small>
      <div class="row"><a class="button" href="${maps(w.name,w.location)}" target="_blank" rel="noopener">Find on Google Maps</a><button data-action="wish-interest" data-id="${w.id}">Interest list</button><button data-action="wish-date" data-id="${w.id}">It’s a Date</button></div></article>`).join('') || '<p class="muted">Save a restaurant you’d like to visit.</p>'}</div>`;
}
function render() {
  const names = { dashboard: 'Your meals', polls: 'Open polls', wishlist: 'Your restaurant wish list' };
  root.innerHTML = `<section class="hero"><p class="eyebrow">Meal planner</p><h1>${names[view]}</h1>
    <p class="muted">${credential ? 'Share a poll link and see responses as guests vote.' : invite ? 'You’ve been invited to a meal. Sign in to view the options and vote. If Google sign-in is blocked in your messaging app, open this link in Chrome or Safari.' : 'Sign in to plan meals, invite guests, and collect responses.'}</p>
    <div class="row">${credential ? '<button class="primary" data-action="new">Plan a meal</button><button data-action="refresh">Refresh responses</button><button data-action="signout">Sign out</button>' + (provider === 'google' ? '<button data-action="link-microsoft">Link Microsoft account</button>' : '<button data-action="link-google">Link Google account</button>') : '<button class="primary" data-action="choose-signin">Sign in</button>'}<button data-action="people">Connections</button><button data-action="busy">Calendar blocks</button></div>
    ${credential ? '' : '<label class="option"><input type="checkbox" data-remember-me><span>Remember me on this browser for 30 days</span></label>'}</section>
    ${view==='dashboard' ? dashboard() : view==='wishlist' ? wishlist() : '<div class="stack">'+(state.meals.filter(isPolling).map(card).join('') || '<p class="muted">No open polls yet.</p>')+'</div>'}`;
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view===view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
}

function timeInput(value = '') {
  return `<div class="row"><label>Local date and time <input type="datetime-local" name="time" value="${escape(value)}"></label><button type="button" data-action="remove-time" aria-label="Remove time">Remove</button></div>`;
}
function chooseFlow() {
  show('Plan a meal', `<div class="stack">
    <button data-action="flow" data-id="restaurant"><strong>I know the restaurant</strong><br><small>Pick the place first</small></button>
    <button data-action="flow" data-id="date"><strong>I know the date</strong><br><small>Set a time, then choose a place</small></button>
    <button data-action="flow" data-id="undecided"><strong>Help us decide</strong><br><small>Poll dates first, then restaurants</small></button></div>`);
}
let restaurantReturn = null;

function restaurantPicker(value = '') {
  return `<fieldset class="stack"><legend>Restaurant choices</legend>
    <button type="button" data-action="browse-restaurants">Search restaurants</button>
    <label>Restaurant names, one per line <textarea name="restaurants" rows="3" maxlength="450">${escape(value)}</textarea></label>
    <small>Use 3–5 choices for a restaurant poll. A single name sets the restaurant.</small></fieldset>`;
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
  const selected = new Set([...(meal?.restaurants || []), ...(names?.value.split('\n') || [])].map(name=>name.trim().toLowerCase()));
  const card = (name, r) => {
    const address = r.address;
    const added = selected.has(name.toLowerCase());
    const preview = r ? [r.area, r.cuisine, r.rating ? '★ '+r.rating+(r.reviewCount?' ('+r.reviewCount.toLocaleString()+' reviews)':'') : '', r.price ? 'CA$'+r.price[0] : r.priceLevel || ''].filter(Boolean).join(' · ') : '';
    return `<article class="card venue-result">
      <div><h3>${escape(name)}</h3><small>${escape(preview)}</small><p>${escape(address)}</p><div><a href="${maps(name,r.address || location)}" target="_blank" rel="noopener">View on Google Maps ↗</a></div>${r.attributions.map(item=>`<small>${escape(item.provider)}</small>`).join('')}</div>
      <button type="button" data-action="pick-restaurant" data-name="${escape(name)}" aria-label="${added?'Added to poll':'Add to poll'}: ${escape(name)}" ${added || (guest && meal.suggested) ? 'disabled' : ''}>${added?'Added to poll':'Add to poll'}</button></article>`;
  };
  panel.querySelector('[data-restaurant-results]').innerHTML = matches.map(r=>card(r.name,r)).join('');
  panel.querySelector('[data-google-search]').href = maps(input.value.trim() || 'restaurants', cityInput || location);
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

async function suggestRestaurant(name) {
  const meal = restaurantReturn?.meal;
  if (!meal || requestInFlight) return;
  requestInFlight = true;
  try {
    await api('suggest', { id: meal.id, restaurant: name.trim() });
    await refresh();
    const updated = state.meals.find(item=>item.id===meal.id);
    closeRestaurantBrowser();
    mealDetails(updated);
    message('Restaurant added to the poll. You can now vote for it.');
  } catch(error) { message(error.message); }
  finally { requestInFlight = false; }
}
function mealForm(wish, flow = 'restaurant') {
  activeWish = wish || null;
  activeMeal = null;
  const timeFields = `<fieldset class="stack"><legend>${flow==='date'?'Set the date':'Choose a time'}</legend>
    ${flow==='restaurant'?'<label>Who decides? <select name="dateMode"><option value="fixed">I’ll choose</option><option value="poll">Let guests decide</option></select></label>':''}
    <div class="stack" id="time-options">${timeInput().repeat(flow==='undecided'?3:1)}</div>
    <button type="button" data-action="add-time" ${flow==='undecided'?'':'hidden'}>Add a time option</button></fieldset>`;
  const venue = restaurantPicker(wish?.name);
  show('Plan a meal', `<form class="stack" data-form="new" data-flow="${flow}">
    <p class="eyebrow">${{restaurant:'By restaurant',date:'By date',undecided:'Help us decide'}[flow]}</p>
    <label>Meal name <input name="title" maxlength="100" required value="${escape(wish ? 'Dinner at '+wish.name : 'Dinner')}"></label>
    <label>City or neighbourhood <input name="location" maxlength="120" value="${escape(wish?.location)}"></label>
    ${flow==='restaurant' ? venue+timeFields : timeFields+(flow==='date'?venue:'<small>After choosing a time, you can start a restaurant poll on this meal.</small>')}
    <label>Duration <select name="duration">${durations.map(m=>`<option value="${m}" ${m===90?'selected':''}>${durationLabel(m)}</option>`).join('')}</select></label>
    <fieldset class="stack"><legend>Invite guests</legend>
      ${state.people.length ? choices(state.people,'contacts',wish?.interested || [],escape) : '<small>Add people in Connections, or enter guest names below.</small>'}
      <label>Other guest names <input name="guests" maxlength="500" placeholder="Names separated by commas" value="${escape(wish?.interested.filter(p=>!state.people.includes(p)).join(', '))}"></label>
      <label class="option"><input type="checkbox" name="saveContacts"><span>Save new guest names to Connections</span></label>
      <small>Share the invite link after saving. Guests appear as joined when they open it and sign in.</small></fieldset>
    <div class="row"><button type="button" data-action="new">Back</button><button class="primary">Save and get invite link</button></div></form>`);
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
    ${meal.selectedTime ? `<p>${escape(dateTime(meal.selectedTime))}</p>` : ''}
    ${meal.organizer ? `<div class="row"><button data-action="share">Share invite</button><a class="button" href="https://wa.me/?text=${encodeURIComponent(inviteUrl(meal))}" target="_blank" rel="noopener">WhatsApp</a><button data-action="refresh-meal">Refresh responses</button></div>
    <section class="card stack"><h3>Guest responses · ${meal.responses.length}</h3>${meal.responses.map(({name,vote})=>`<div><strong>${escape(name)}</strong><div><small>Times: ${escape(vote.times.map(dateTime).join(', ') || 'None selected')}</small></div><div><small>Restaurants: ${escape(vote.restaurants.join(', ') || 'None selected')}</small></div></div>`).join('') || '<p class="muted">No responses yet.</p>'}</section>` : '<p class="muted">The organizer can see your display name and your choices.</p>'}
    ${!meal.restaurant && !meal.restaurants.length ? '<p class="muted">Restaurant to be decided.</p>' : ''}
    ${meal.restaurant ? `<a href="${maps(meal.restaurant,meal.location)}" target="_blank" rel="noopener">Find ${escape(meal.restaurant)} on Google Maps ↗</a>` : ''}
    ${isPolling(meal) ? `<form class="stack card" data-form="vote"><h3>Respond to poll</h3>
      ${!meal.organizer && !meal.restaurant && meal.restaurants.length ? (meal.suggested ? '<small>You’ve added your restaurant suggestion.</small>' : '<button type="button" data-action="suggest-restaurant">Suggest one restaurant</button>') : ''}
      ${!meal.selectedTime && meal.times.length ? `<fieldset><legend>Times that work</legend>${choices(meal.times,'times',vote.times,t=>escape(dateTime(t))+votesLabel('times',t)+(hasConflict(t,meal.duration)?' · ⚠ Calendar block overlaps':''))}</fieldset>` : ''}
      ${!meal.restaurant && meal.restaurants.length ? `<fieldset><legend>Restaurants you’d visit</legend>${choices(meal.restaurants,'restaurants',vote.restaurants,r=>escape(r)+votesLabel('restaurants',r))}</fieldset>` : ''}<button class="primary">Save response</button></form>` : ''}
    ${meal.organizer ? `<form class="stack card" data-form="manage"><h3>Organizer controls</h3>
      <label>Chosen date and time <select name="selectedTime"><option value="">Keep polling</option>${options}</select></label>
      <label>Add another time option <input type="datetime-local" name="newTime"></label>
      <label>Chosen restaurant <select name="restaurant"><option value="">Decide later</option>${restaurants}</select></label>
      ${meal.selectedTime && !meal.restaurant ? restaurantPicker() : ''}
      <label>Reservation status <select name="status">${statuses.map(s=>`<option ${s===meal.status?'selected':''}>${s}</option>`).join('')}</select></label>
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

panel.addEventListener('close',()=>{ restaurantReturn=null; panel.classList.remove('restaurant-browser'); });
panel.addEventListener('cancel',event=>{ if(restaurantReturn){ event.preventDefault(); closeRestaurantBrowser(); } });
panel.addEventListener('input',event=>{
  const search = panel.querySelector('[data-restaurant-search]');
  if (event.target === search) {
    suggestCuisines(search);
    updateRestaurantResults(search);
  } else if (event.target.matches('[data-restaurant-city]')) {
    updateRestaurantResults(search);
  }
});
panel.addEventListener('change',event=>{
  if(event.target.matches('[data-restaurant-sort]')) updateRestaurantResults(panel.querySelector('[data-restaurant-search]'));
  if(!event.target.matches('[name=dateMode]')) return;
  const options = panel.querySelector('#time-options');
  const poll = event.target.value==='poll';
  panel.querySelector('[data-action=add-time]').hidden = !poll;
  while(options.children.length>(poll?5:1)) options.lastElementChild.remove();
  while(poll && options.children.length<3) options.insertAdjacentHTML('beforeend',timeInput());
});
document.addEventListener('click', event=>{
  const button = event.target.closest('button');
  if (!button) return;
  const { action, id, view: tab } = button.dataset;
  if (tab) { view=tab; render(); window.scrollTo(0,0); return; }
  switch(action) {
    case 'close': if (restaurantReturn) closeRestaurantBrowser(); else panel.close(); break;
    case 'new': if (credential) chooseFlow(); else startSignIn(); break;
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
      if (guest) { suggestRestaurant(button.dataset.name); break; }
      const names = input.value.split('\n').map(name=>name.trim()).filter(Boolean);
      const limit = input.form.dataset.flow === 'restaurant' ? 1 : 5;
      if (names.length >= limit) { message(limit===1?'One restaurant is already selected.':'You can add up to five restaurants.'); break; }
      input.value = [...names,button.dataset.name].join('\n');
      button.textContent = 'Added to poll';
      button.setAttribute('aria-label','Added to poll: '+button.dataset.name);
      button.disabled = true;
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
      if(options.children.length>=5) { message('Add up to five times.'); break; }
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
      const flow = form.dataset.flow;
      const pollTime = flow==='undecided' || value('dateMode')==='poll';
      const times=[...new Set(data.getAll('time').filter(Boolean).map(t=>new Date(t).toISOString()))].sort();
      const restaurants=[...new Set(value('restaurants').split('\n').map(name=>name.trim()).filter(Boolean))];
      if(!value('title')) { message('Enter a meal name.'); return; }
      if(pollTime ? times.length<3 || times.length>5 : times.length!==1) {
        message(pollTime?'Add three to five different times.':'Choose one date and time.'); return;
      }
      if(flow==='restaurant' && restaurants.length!==1) { message('Choose one restaurant.'); return; }
      if(flow==='date' && (restaurants.length===2 || restaurants.length>5)) { message('Choose one restaurant or add three to five for a poll.'); return; }
      const details={title:value('title'),location:value('location'),duration:Number(value('duration')),
        times,restaurants,guests:[...new Set([...data.getAll('contacts'),...split(value('guests'))])],
        status:statuses[0],selectedTime:pollTime?'':times[0],restaurant:restaurants.length===1?restaurants[0]:'',attending:[]};
      const newContacts = data.has('saveContacts') ? split(value('guests')) : [];
      syncMeal('create', { details }, newContacts); return;
    }
    case 'restaurant-search': searchGooglePlaces(form); return;
    case 'suggest': suggestRestaurant(value('suggestion')); return;
    case 'vote': {
      syncMeal('vote', { id: activeMeal.id, vote: { times: data.getAll('times'), restaurants: data.getAll('restaurants') } }); return;
    }
    case 'manage': {
      const newTime=value('newTime');
      const time=newTime?new Date(newTime).toISOString():'';
      const times=[...new Set([...activeMeal.times,...(time?[time]:[])])].sort();
      if(times.length>Math.max(5,activeMeal.times.length)) { message('Add up to five times.'); return; }
      const additions=value('restaurants').split('\n').map(name=>name.trim()).filter(Boolean);
      const restaurants=[...new Set([...activeMeal.restaurants,...additions])];
      if(additions.length && !value('selectedTime')) { message('Choose the date before opening a restaurant poll.'); return; }
      if(additions.length && (restaurants.length===2 || restaurants.length>5)) { message('Choose one restaurant or add three to five for a poll.'); return; }
      const details={...activeMeal,times,restaurants,selectedTime:value('selectedTime'),restaurant:value('restaurant') || (additions.length && restaurants.length===1 ? restaurants[0] : ''),
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

async function syncMeal(action, payload, newContacts = []) {
  if (requestInFlight) return;
  requestInFlight = true;
  const buttons = panel.querySelectorAll('[type=submit], form button:not([type])');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const { id } = await api(action, payload);
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
    message(action === 'vote' ? 'Response saved for the organizer.' : 'Meal saved.');
  } catch (error) { message(error.message); }
  finally { requestInFlight = false; buttons.forEach(button => { button.disabled = false; }); }
}

function inviteUrl(meal) {
  const hex = meal.invite.replaceAll('-', '');
  const bytes = hex.match(/../g).map(pair => String.fromCharCode(parseInt(pair, 16))).join('');
  const code = btoa(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = new URL('i.html', location.href);
  url.search = code;
  return url.href;
}
async function copyInvite(url) {
  try { await navigator.clipboard.writeText(url); message('Invite link copied.'); }
  catch { show('Share invite', `<label>Copy this link<input readonly value="${escape(url)}"></label>`); }
}
render();
if (sessionStorage.getItem(microsoftFlowKey)) resumeMicrosoft().catch(error=>message(error.message));
else restoreSession().then(() => { if (openSignIn && !credential) chooseSignIn(); });

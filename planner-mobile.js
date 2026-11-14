'use strict';

const planDraftKey = 'enkai-plan-draft';
const responseDraftKey = 'enkai-response-draft';
let wizardStep = 0;
let responseReceipt = '';
function syncGuideSaves() {
  const favourites={};
  for(const key of ['mesa-favorites','nocturne-beyond-saved','nocturne-ontario-saved']) {
    try {favourites[key]=new Set(JSON.parse(localStorage.getItem(key)||'[]'));} catch {favourites[key]=new Set();}
  }
  state.wishes=state.wishes.filter(w=>!w.guideKey||favourites[w.guideKey]?.has(w.guideId));
  for(const v of window.ENKAI_VENUES||[]) {
    if(!favourites[v.savedKey]?.has(v.id))continue;
    if(state.wishes.some(w=>w.name===v.name&&EnkaiTime.guessZone(w.location)===EnkaiTime.guessZone(v.location)))continue;
    state.wishes.push({id:'guide-'+v.id,name:v.name,location:v.location,interested:[],guideKey:v.savedKey,guideId:v.id});
  }
}
function updateSelectedRestaurants() {
  const input=panel.querySelector('[name=restaurants]'),target=panel.querySelector('[data-selected-restaurants]');
  if(!input||!target)return;
  target.innerHTML=input.value.split('\n').map(n=>n.trim()).filter(Boolean).map(name=>'<button type="button" data-action="remove-restaurant" data-name="'+escape(name)+'" aria-label="Remove '+escape(name)+'">'+escape(name)+' ×</button>').join('');
}
function placePhotoMarkup(place) {
  return '<img class="search-photo" src="'+escape(place.loadedPhoto.url)+'" alt="'+escape(place.name)+'"><p class="photo-credit">'+
    (place.photo.authorAttributions||[]).map(a=>'<span>Photo: '+escape(a.displayName||'Google Maps contributor')+'</span>').join(' · ')+'</p>';
}
async function showPlacePhoto(button) {
  const search=restaurantReturn,index=Number(button.dataset.photoIndex),place=search?.places[index];
  if(!place?.photo)return;
  button.disabled=true;button.textContent='Loading photo…';
  try {
    const data=place.loadedPhoto||await api('photo',{photo:place.photo.name});
    place.loadedPhoto=data;
    if(search!==restaurantReturn)return;
    button.parentElement.innerHTML=placePhotoMarkup(place);
  }catch {button.textContent='View photos on Google Maps';button.disabled=false;button.dataset.action='photo-fallback';button.dataset.name=place.name;button.dataset.city=place.address;}
}
function guideVenue(name, city) {
  const region=EnkaiTime.guessZone(city)==='America/Sao_Paulo'?'Brazil':EnkaiTime.guessZone(city)==='America/Toronto'?'Ontario':'';
  return (window.ENKAI_VENUES||[]).find(v=>region===v.region && v.name.toLocaleLowerCase()===String(name).toLocaleLowerCase());
}
function venueImage(name,city) {
  const v=guideVenue(name,city);
  return v?.image?'<figure class="dinner-photo"><img src="'+escape(v.image)+'" alt="'+escape(name)+'" loading="lazy"><figcaption><a href="'+escape(v.source)+'" target="_blank" rel="noopener">Photo source ↗</a></figcaption></figure>':'';
}
function dinnerPhotoMarkup(meal) {
  if (!meal.restaurant || meal.cancelled) return '';
  const guide = venueImage(meal.restaurant,meal.location);
  if (guide) return guide;
  const live = meal.hasPhoto || meal.venues?.some(v=>v.name===meal.restaurant && v.placeId);
  return live ? '<div class="live-dinner-photo" data-live-dinner-photo data-restaurant="'+escape(meal.restaurant)+'"><p class="photo-loading" role="status">Opening restaurant photo…</p><a href="'+escape(venueMaps(meal.restaurant,meal))+'" target="_blank" rel="noopener noreferrer">View photos on Google Maps ↗</a></div>' : '';
}
async function loadDinnerPhoto(container, payload) {
  const slot = container.querySelector('[data-live-dinner-photo]');
  if (!slot || slot.dataset.loading) return;
  slot.dataset.loading='true';
  const fallback=slot.querySelector('a')?.outerHTML || '';
  try {
    const {photo} = await api(payload.invite?'preview-photo':'dinner-photo',payload);
    if (!slot.isConnected) return;
    if (!photo || !/^https:\/\//.test(photo.url) || (photo.kind!=='website' && !/^https:\/\/([\w-]+\.)*googleusercontent\.com\//.test(photo.url))) throw Error('Photo unavailable');
    slot.innerHTML='<figure><img src="'+escape(photo.url)+'" alt="'+escape(slot.dataset.restaurant || 'Restaurant')+'" decoding="async" referrerpolicy="no-referrer"><figcaption>'+(photo.kind==='website'?'':'<span class="google-maps-credit" translate="no">Google Maps</span>')+ (photo.authors||[]).map(author=>'<span>Photo: '+(author.uri?'<a href="'+escape(author.uri)+'" target="_blank" rel="noopener noreferrer">'+escape(author.name)+'</a>':escape(author.name))+'</span>').join('')+(photo.source?'<a href="'+escape(photo.source)+'" target="_blank" rel="noopener noreferrer">'+(photo.kind==='website'?'Photo: restaurant website':'View original photo')+' ↗</a>':'')+'</figcaption></figure>';
    const image=slot.querySelector('img');
    image.addEventListener('error',()=>{slot.innerHTML=fallback;},{once:true});
  } catch {
    // A missing image or exhausted quota must never interrupt sign-in or RSVP.
    if (slot.isConnected) slot.querySelector('.photo-loading')?.remove();
  }
}
function venueMaps(name,meal) {
  const venue=(meal.venues||[]).find(v=>v.name===name);
  const url=new URL(maps(name,meal.location));
  if(venue?.placeId) url.searchParams.set('query_place_id',venue.placeId);
  return url.href;
}

function setMealAddress(id, replace = false) {
  const url = new URL(location.href);
  url.hash = id ? 'meal=' + encodeURIComponent(id) : '';
  pendingMealId = id || null;
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
function zoneName(zone) { return (zone || '').split('/').pop().replaceAll('_', ' '); }
function destinationLabel(meal) { return zoneName(mealZone(meal)) + ' time'; }
function localTimeNote(meal) {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return meal.selectedTime && meal.timeZone && local !== meal.timeZone
    ? '<small>' + escape(EnkaiTime.format(meal.selectedTime, local)) + ' in your current time zone</small>' : '';
}
function navigatePlanner(next) {
  persistOpenDraft();
  if (panel.open) panel.close();
  activeMeal = null;
  setMealAddress('', true);
  view = next;
  render();
  window.scrollTo(0, 0);
  refreshCalendars();
}
function readPlanDraft() {
  try { return JSON.parse(sessionStorage.getItem(planDraftKey)); } catch { return null; }
}
function persistOpenDraft() {
  let form = panel.querySelector('[data-form=new]');
  if (!form && restaurantReturn?.input) form = restaurantReturn.input.form;
  if (form) {
    try { sessionStorage.setItem(planDraftKey, JSON.stringify({flow:form.dataset.flow, step:wizardStep,
      values:Array.from(new FormData(form).entries()), times:form.querySelectorAll('[name=time]').length})); } catch {}
  }
  const response = panel.querySelector('[data-form=respond]');
  if (response && activeMeal) {
    try { sessionStorage.setItem(responseDraftKey, JSON.stringify({id:activeMeal.id, values:Array.from(new FormData(response).entries())})); } catch {}
  }
}
function restoreResponseDraft(meal) {
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem(responseDraftKey)); } catch {}
  if (draft?.id !== meal.id) return;
  const form = panel.querySelector('[data-form=respond]');
  if (!form) return;
  for (const input of form.querySelectorAll('input')) {
    input.checked = draft.values.some(([name,value]) => name === input.name && value === input.value);
  }
}
function invitationLanding() {
  const info = invitationPreview;
  if (inviteError) return '<section class="card stack"><h2>Invitation unavailable</h2><p>' + escape(inviteError) +
    '</p><button data-action="retry-invite">Try again</button></section>';
  if (!info) return '<section class="card" role="status">Opening your invitation…</section>';
  return '<section class="invite-summary card stack"><p class="eyebrow">An invitation from ' + escape(info.hostName) +
    '</p><h2>' + escape(info.title) + '</h2>' + dinnerPhotoMarkup(info) + '<p>' + escape(info.restaurant || 'Let’s choose a restaurant together') +
    '</p><p>' + escape(info.location) + '</p><p>' +
    escape(info.selectedTime && info.timeZone ? mealDateTime(info.selectedTime, info) + ' · ' + destinationLabel(info) : 'Help choose a time that works for you') +
    '</p><button class="primary" data-action="choose-signin">Sign in to respond</button><small>Anyone with this invitation can join. Your host can see your response.</small></section>';
}
async function loadInvitation() {
  inviteError = '';
  render();
  try { invitationPreview = await api('preview', {invite}); }
  catch (error) { inviteError = error.message; }
  if (!credential) {render();if(!inviteError)loadDinnerPhoto(root,{invite});}
}
function discoverView() {
  return '<div class="discover-intro"><p>Find somewhere worth getting together.</p></div><div class="discovery-grid">' +
    '<button class="discovery-card" data-guide="michelin"><img src="assets/tuju-course.jpg" alt="" loading="lazy"><span><strong>Michelin</strong><small>Exceptional tables in São Paulo and Ontario</small></span></button>' +
    '<button class="discovery-card" data-guide="good"><img src="assets/evvai-room.jpeg" alt="" loading="lazy"><span><strong>Good Eats</strong><small>Local favourites, views and memorable evenings</small></span></button></div>';
}
function responseForm(meal) {
  if(meal.cancelled)return '<p>This dinner was cancelled by the organizer.</p>';
  const vote = meal.myVote || {times:[],restaurants:[]};
  const timesOpen = !meal.selectedTime && meal.times.length;
  const restaurantsOpen = !meal.restaurant && meal.restaurants.length;
  if(!finalPlan(meal)&&!timesOpen&&!restaurantsOpen)return '<p>Your host is choosing the restaurant. You’ll be able to RSVP once the date and restaurant are final.</p>';
  return (finalPlan(meal)&&!meal.organizer?'<section class="calendar-before-rsvp" aria-label="Check before confirming"><strong>Before you confirm</strong><div data-calendar-time="'+escape(meal.selectedTime)+'" class="calendar-check" aria-live="polite"><small>Checking calendar…</small></div><small>Calendar connection is optional. You can RSVP without it.</small></section>':'') + '<form class="stack response-form '+(!meal.organizer?'guest-response':'')+'" data-form="respond">' +
    (!meal.organizer && finalPlan(meal) ? '<fieldset class="rsvp-options"><legend>' + 'Will you be joining?' +
    '</legend>' + Object.entries(attendanceLabels).map(([value,label])=>'<label class="option"><input type="radio" name="attendance" value="' + value +
      '" ' + (vote.attendance === value ? 'checked' : '') + ' required><span>' + label + '</span></label>').join('') + '</fieldset>' : '') +
    (!finalPlan(meal) ? '<p class="muted">Select all the options that work for you. Voting expresses availability; you’ll confirm attendance once the date is final.</p>' : '') +
    (finalPlan(meal)&&meal.myVote?.needsReconfirmation?'<p class="calendar-warning">The plan changed. Please confirm your attendance again.</p>':'')+
    (timesOpen&&!connectedCalendars().length?'<button type="button" data-action="calendar-settings">Connect calendar to check these times</button>':'')+
    (timesOpen ? '<fieldset class="poll-options"><legend>When works? · ' + escape(destinationLabel(meal)) + '</legend>' +
      calendarPollChoices(meal,vote) + '</fieldset>' : '') +
    (restaurantsOpen ? '<fieldset class="poll-options"><legend>Where would you go?</legend>' + meal.restaurants.map(r=>'<div class="venue-option"><label class="option"><input type="checkbox" name="restaurants" value="' +
      escape(r) + '" ' + (vote.restaurants.includes(r) ? 'checked' : '') + '><span>' + escape(r) + '</span></label><a href="' +
      escape(venueMaps(r,meal)) + '" target="_blank" rel="noopener">Reviews & location ↗</a></div>').join('') +
      (!meal.organizer && !meal.suggested ? '<button type="button" data-action="suggest-restaurant">Suggest one restaurant</button>' : '') + '</fieldset>' : '') +
    (finalPlan(meal)&&!meal.organizer?'<small>Confirming Going accepts this dinner’s invitation in your connected calendar. Maybe or Can’t make it updates your calendar response too. Without a connection, accept the email invitation yourself.</small>':'')+
    '<div class="sticky-actions"><button class="primary" type="submit">'+(finalPlan(meal)&&!meal.organizer?'Confirm RSVP':'Save availability')+'</button></div></form>';
}
function receiptView(meal) {
  const vote = meal.myVote || {times:[],restaurants:[]};
  return '<section class="response-receipt card stack" role="status"><h3>'+(finalPlan(meal)?'RSVP saved':'Availability saved')+'</h3>' +
    (finalPlan(meal)&&vote.attendance ? '<p>' + escape(attendanceLabels[vote.attendance]) + '</p>' : '') +
    (!meal.selectedTime && meal.times.length ? '<p><strong>Your times</strong><br>' + escape(vote.times.map(t=>mealDateTime(t,meal)).join(' · ') || 'None of these times work') + '</p>' : '') +
    (!meal.restaurant && meal.restaurants.length ? '<p><strong>Your restaurants</strong><br>' + escape(vote.restaurants.join(' · ') || 'None of these restaurants work') + '</p>' : '') +
    '<p>Your host can see this response. You can change it later.</p><button data-action="edit-response">Change my response</button><button data-view="dashboard">Back to home</button>'+
    (!meal.organizer?'<div class="invite-next-evening stack"><p>Have another get-together in mind?</p><button type="button" data-action="new">Plan your own evening</button><small>Your response above is saved. Start a separate plan and invite your people.</small></div>':'')+'</section>';
}

function wizardGuests(wish) {
  return '<label>Name your plan<input name="title" maxlength="100" required value="' + escape(wish ? ('Dinner at ' + wish.name).slice(0,100) : 'Dinner with friends') + '"></label>' +
    '<fieldset class="stack"><legend>Who are you planning to invite?</legend><small>Optional planning list only. No messages are sent and names are not linked to accounts. Share the invitation link after creating the plan.</small>' +
    (state.people.length ? choices(state.people,'contacts',wish?.interested || [],escape) : '') +
    '<label>More guests<input name="guests" maxlength="500" placeholder="Names separated by commas" value="'+escape(wish?.interested?.filter(p=>!state.people.includes(p)).join(', '))+'"></label><label class="option"><input type="checkbox" name="saveContacts"><span>Save these names on this device</span></label></fieldset>';
}
function openPlan(wish, flow = 'restaurant', resume = false) {
  activeWish = wish || null;
  activeMeal = null;
  const draft = resume ? readPlanDraft() : null;
  if (draft) flow = draft.flow;
  wizardStep = draft ? draft.step : 0;
  const destination = '<label>Where are you getting together?<input name="location" maxlength="120" required placeholder="City or neighbourhood" value="' + escape(wish?.location) + '"></label>' +
    timeZoneSelector(EnkaiTime.guessZone(wish?.location));
  const times = '<div class="stack">' + (flow === 'restaurant' ? '<label>Choose a time<select name="dateMode"><option value="fixed">I’ll set the time</option><option value="poll">Let guests choose</option></select></label>' : '') +
    '<div class="stack" id="time-options">' + timeInput().repeat(draft?.times || (flow === 'undecided' ? 2 : 1)) + '</div>' +
    '<button type="button" data-action="add-time" ' + (flow === 'undecided' ? '' : 'hidden') + '>Add another time</button>' +
    '<label>How long?<select name="duration">' + durations.map(m=>'<option value="' + m + '" ' + (m===90?'selected':'') + '>' + durationLabel(m) + '</option>').join('') + '</select></label></div>';
  const steps = flow === 'restaurant'
    ? [{name:'The place',html:destination + restaurantPicker(wish?.name,true)}, {name:'The time',html:times}, {name:'The people',html:wizardGuests(wish)}]
    : [{name:'The time',html:destination + times}, ...(flow === 'date' ? [{name:'The place',html:restaurantPicker(wish?.name) + '<p class="muted">You can leave the restaurant open and choose it later.</p>'}] : []),
      {name:'The people',html:wizardGuests(wish)}];
  steps.push({name:'Review & invite',html:'<div data-plan-summary class="stack"></div><p class="muted">This creates a plan and invitation link. Restaurant reservations are a separate step.</p><label class="option"><input type="checkbox" name="calendarEnabled" checked><span>Send calendar invitations when the date and restaurant are final</span></label><small>Invitations go to signed-in guests from your connected calendar. Connect it in Settings if you haven’t already.</small>'});
  show('Plan an evening', '<form class="stack wizard" data-form="new" data-flow="' + flow + '" novalidate><p class="eyebrow" data-step-progress></p>' +
    steps.map((step,i)=>'<section class="stack wizard-step" data-step="' + i + '" data-step-name="' + step.name + '"><h3>' + step.name + '</h3>' + step.html + '</section>').join('') +
    '<div class="sticky-actions"><button type="button" data-action="plan-back">Back</button><button type="button" class="primary" data-action="plan-next">Continue</button><button type="submit" class="primary" data-create-plan hidden>Create invitation</button></div></form>');
  const form = panel.querySelector('[data-form=new]');
  if (draft) {
    const seen = {};
    for (const field of form.querySelectorAll('input,select,textarea')) {
      const entries = draft.values.filter(([name])=>name===field.name).map(([,value])=>value);
      if (['checkbox','radio'].includes(field.type)) field.checked = entries.includes(field.value);
      else if (entries.length) {const i=seen[field.name] || 0; field.value=entries[i] ?? ''; seen[field.name]=i+1;}
    }
    form.querySelector('[data-action=add-time]').hidden = flow !== 'undecided' && form.elements.dateMode?.value !== 'poll';
  }
  updateTimeInputs(form);
  updateSelectedRestaurants();
  renderWizard();
}
function renderWizard() {
  const form = panel.querySelector('.wizard');
  if (!form) return;
  const steps = Array.from(form.querySelectorAll('[data-step]'));
  wizardStep = Math.min(wizardStep, steps.length-1);
  steps.forEach((step,i)=>{step.hidden=i!==wizardStep;});
  const last = wizardStep === steps.length-1;
  form.querySelector('[data-step-progress]').textContent='Step ' + (wizardStep+1) + ' of ' + steps.length;
  form.querySelector('[data-action=plan-next]').hidden=last;
  form.querySelector('[data-create-plan]').hidden=!last;
  if (last) {
    const data=new FormData(form), zone=data.get('timeZone');
    const dates=Array.from(form.querySelectorAll('[name=time]')).filter(i=>i.value).map(i=>EnkaiTime.format(readDestinationTime(i,zone),zone));
    form.querySelector('[data-plan-summary]').innerHTML='<h3>'+escape(data.get('title'))+'</h3><p>'+escape(data.get('location'))+'</p><p>'+escape(data.get('restaurants') || 'Choose the restaurant together later')+
      '</p><p>'+escape(dates.join(' · '))+'</p><small>'+escape(zoneName(zone))+' time · '+durationLabel(Number(data.get('duration')))+'</small><p>Planned guests: '+escape([...data.getAll('contacts'),data.get('guests')].filter(Boolean).join(', ') || 'Share your link with anyone you’d like to invite')+'</p>';
  }
  panel.scrollTop=0;
  persistOpenDraft();
}
function validatePlanStep() {
  const form=panel.querySelector('.wizard'), section=form.querySelector('[data-step]:not([hidden])');
  for(const field of section.querySelectorAll('input[required],select[required]')) {
    if(!field.checkValidity()) { const details=field.closest('details');if(details)details.open=true;field.reportValidity(); return false; }
  }
  const data=new FormData(form), flow=form.dataset.flow;
  try {
    if(section.querySelector('[name=time]')) {
      if(!EnkaiTime.validZone(data.get('timeZone'))) throw Error('Choose the destination city and time zone first.');
      const times=Array.from(form.querySelectorAll('[name=time]')).filter(i=>i.value).map(i=>readDestinationTime(i,data.get('timeZone')));
      const poll=flow==='undecided'||data.get('dateMode')==='poll';
      if(poll ? new Set(times).size<2 || times.length>5 : times.length!==1) throw Error(poll?'Choose two to five different times.':'Choose a date and time.');
      if(times.some(t=>Date.parse(t)<=Date.now())) throw Error('Choose a future date and time.');
    }
    if(section.querySelector('[name=restaurants]')) {
      const choices=String(data.get('restaurants')||'').split('\n').map(s=>s.trim()).filter(Boolean);
      if(flow==='restaurant' && choices.length!==1) throw Error('Choose one restaurant to continue.');
      if(choices.length>5) throw Error('Choose up to five restaurants.');
    }
    return true;
  } catch(error) {message(error.message);return false;}
}

'use strict';

let calendarAccount = null;
let calendarStatusAt = 0;
let calendarRefreshing = false;
let calendarQueueAt = 0;
const calendarChecks = new Map();
const calendarNames = {google:'Google',microsoft:'Outlook'};
const calendarNotice = new URLSearchParams(location.search).get('calendar');
function connectedCalendars() { return calendarAccount?.connections?.filter(c=>c.status==='connected') || []; }
async function loadCalendarStatus(force=false) {
  if(!credential)return;
  if(!force&&Date.now()-calendarStatusAt<60000)return;
  try {calendarAccount=await api('calendar-status');calendarStatusAt=Date.now();}
  catch {calendarAccount=null;}
}
function calendarSettingsMarkup() {
  return '<section class="card stack calendar-settings"><h2>Your calendars</h2><p>Check your Google primary calendar and Outlook default calendar for conflicts. Confirmed dinners can send and accept calendar invitations.</p>'+
    '<small>Only you see your conflict details. Connecting is optional; you can still vote and RSVP without it.</small>'+
    ['google','microsoft'].map(p=>{
      const c=calendarAccount?.connections?.find(c=>c.provider===p),primary=calendarAccount?.preferredProvider===p;
      return '<div class="calendar-provider stack"><strong>'+calendarNames[p]+'</strong>'+(c?'<small>'+escape(c.email)+' · '+(c.status==='connected'?'Connected':'Reconnect needed')+'</small>':'')+
        '<div class="row">'+(!c||c.status!=='connected'?'<button data-action="calendar-connect" data-provider="'+p+'">'+(c?'Reconnect ':'Connect ')+calendarNames[p]+'</button>':'<button data-action="calendar-prefer" data-provider="'+p+'" '+(primary?'disabled':'')+'>'+(primary?'Used for invitations':'Use for invitations')+'</button>')+
        (c?'<button data-action="calendar-disconnect" data-provider="'+p+'">Disconnect</button>':'')+'</div></div>';
    }).join('')+'<small>Enkai requests calendar access to read event titles and times and manage your dinner invitations. You can disconnect here at any time. Existing calendar events stay in your calendar.</small></section>';
}
function showCalendarSettings() {
  persistOpenDraft();
  show('Connect your calendar','<div class="stack">'+calendarSettingsMarkup()+(activeMeal?'<button data-action="calendar-back">Back to dinner</button>':'')+'</div>');
}
async function connectCalendar(providerName) {
  persistOpenDraft();
  const button=panel.querySelector('[data-action="calendar-connect"][data-provider="'+providerName+'"]');
  if(button)button.disabled=true;
  try {
    const {url}=await api('calendar-connect',{provider:providerName,theme:document.body.dataset.plannerTheme,id:activeMeal?.id});
    const target=new URL(url);
    if(!['accounts.google.com','login.microsoftonline.com'].includes(target.hostname)||target.protocol!=='https:')throw Error('Calendar connection is unavailable.');
    location.assign(target.href);
  }catch(error) {message(error.message);if(button)button.disabled=false;}
}
function calendarPollChoices(meal,vote) {
  return meal.times.map(t=>'<div class="calendar-time-option"><label class="option"><input type="checkbox" name="times" value="'+escape(t)+'" '+
    (vote.times.includes(t)?'checked':'')+'><span>'+escape(mealDateTime(t,meal))+'</span></label><div data-calendar-time="'+escape(t)+'" class="calendar-check" aria-live="polite">'+
    (hasConflict(t,meal.duration)?'<small class="calendar-warning">⚠ Overlaps a calendar block you added</small>':'<small>◷ Checking calendar…</small>')+'</div></div>').join('');
}
function calendarDinnerMarkup(meal) {
  const labels={sent:'Calendar invitations sent',pending:'Calendar syncing…',retrying:'Calendar sync delayed — will retry',reconnect_host:'Host needs to reconnect their calendar',cancelled:'Calendar invitation cancelled'};
  const mine={accepted:'Accepted in your calendar',tentative:'Tentative in your calendar',declined:'Declined in your calendar',pending:'Your calendar response is syncing…',reconnect:'Reconnect your calendar to sync',accept_in_email:'Accept the invitation in your email',restore_in_email:'Outlook removed the declined invitation. To change your answer, open the original invitation in Deleted Items and respond, then refresh here.',needs_confirmation:'Confirm your attendance for this date',changed_in_calendar:'Your calendar invitation changed or was removed — review your attendance'};
  const hostConnected=connectedCalendars().length>0;
  let text=meal.cancelled?'This dinner is cancelled.':!meal.selectedTime?'Calendar invitations wait until the date is final.':
    meal.organizer&&!hostConnected?'Connect your calendar to send invitations.':labels[meal.calendarSync?.status]||'Calendar invitations are preparing.';
  if(!meal.calendarEnabled&&!meal.calendarSync?.status)text=meal.organizer?'Turn on invitations under Finalize the plan.':'Your host hasn’t enabled calendar invitations.';
  if(!meal.cancelled&&meal.calendarSync?.status!=='cancelled'&&!meal.organizer&&meal.myCalendar?.status)text=mine[meal.myCalendar.status]||text;
  return '<section class="calendar-dinner stack" data-calendar-dinner><div class="row spread"><strong>Calendar</strong><button type="button" data-action="calendar-refresh">Refresh</button></div><p role="status">'+escape(text)+'</p>'+
    '<small>Checks cover connected primary/default calendars. Reservation status is separate.</small>'+
    (!meal.cancelled&&!connectedCalendars().length?'<button type="button" data-action="calendar-settings">Connect calendar</button>':'')+
    (meal.selectedTime&&!meal.cancelled?'<div data-calendar-time="'+escape(meal.selectedTime)+'" class="calendar-check" aria-live="polite"><small>◷ Checking calendar…</small></div>':'')+'</section>';
}
function paintCalendarChecks(meal,result) {
  if(!panel.open||activeMeal?.id!==meal.id)return;
  for(const target of panel.querySelectorAll('[data-calendar-time]')) {
    const time=target.dataset.calendarTime,option=result.options?.find(o=>o.time===time),overlaps=option?.conflicts||[];
    const manual=hasConflict(time,meal.duration)?'<small class="calendar-warning">⚠ Overlaps a calendar block you added</small>':'';
    if(overlaps.length) {
      target.innerHTML=manual+'<details class="calendar-conflict"><summary>⚠ '+overlaps.length+' calendar conflict'+(overlaps.length===1?'':'s')+' · View</summary><div class="stack">'+
        overlaps.map(c=>'<p><strong>'+escape(c.title)+'</strong><br><small>'+escape(EnkaiTime.format(c.start,mealZone(meal)))+' – '+escape(EnkaiTime.format(c.end,mealZone(meal)))+
          ' · '+calendarNames[c.provider]+(c.tentative?' · Tentative':'')+'</small></p>').join('')+'<small>Only you can see this. You can still choose this time.</small></div></details>'+
        (result.status!=='checked'?'<small>Some calendars could not be checked.</small>':'');
    }else if(result.status==='checked')target.innerHTML=manual+'<small class="calendar-clear">✓ No conflicts found in connected calendars</small>';
    else target.innerHTML=manual+'<small>— '+(result.status==='not_connected'?'Calendar not connected':'Calendar not fully checked — refresh or reconnect')+'</small>';
  }
}
async function checkDinnerCalendar(meal,force=false) {
  if(!credential||meal.cancelled)return;
  const key=meal.id+':'+meal.version;
  const cached=calendarChecks.get(key);
  if(!force&&cached&&Date.now()-cached.at<60000){paintCalendarChecks(meal,cached.data);return;}
  const session=credential;
  try {
    const data=await api('calendar-conflicts',{id:meal.id});
    if(session!==credential)return;
    calendarChecks.set(key,{at:Date.now(),data});paintCalendarChecks(meal,data);
  }catch {if(session===credential)paintCalendarChecks(meal,{status:'unavailable'});}
}
async function refreshCalendars(force=false) {
  if(!credential||calendarRefreshing||requestInFlight)return;
  calendarRefreshing=true;
  const id=panel.open?activeMeal?.id:null;
  // Preserve votes before updating dinner data; never rebuild an open planning form.
  persistOpenDraft();
  try {
    await loadCalendarStatus(force);
    if(force||Date.now()-calendarQueueAt>60000) {await api('calendar-refresh');calendarQueueAt=Date.now();}
    await refresh(true);
    if(id&&panel.open&&panel.querySelector('.dinner-detail')) {
      const meal=state.meals.find(m=>m.id===id);if(meal){mealDetails(meal);if(force)await checkDinnerCalendar(meal,true);}
    }
  }catch {if(force)message('Could not refresh. Your selections are still here.');}
  finally {calendarRefreshing=false;}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-action]');if(!button)return;
  const action=button.dataset.action,p=button.dataset.provider;
  if(action==='calendar-settings') {await loadCalendarStatus();showCalendarSettings();}
  if(action==='calendar-connect')connectCalendar(p);
  if(action==='calendar-back'&&activeMeal)mealDetails(state.meals.find(m=>m.id===activeMeal.id)||activeMeal);
  if(action==='calendar-refresh')refreshCalendars(true);
  if(action==='calendar-prefer') {
    try {calendarAccount=await api(action,{provider:p});calendarStatusAt=Date.now();if(panel.open)showCalendarSettings();else render();}catch(error){message(error.message);}
  }
  if(action==='calendar-disconnect')show('Disconnect '+calendarNames[p]+'?', '<div class="stack"><p>Enkai will stop checking this calendar and syncing its dinner invitations. Existing calendar events remain.</p><button data-action="calendar-confirm-disconnect" data-provider="'+p+'">Disconnect calendar</button><button data-action="calendar-settings">Keep connected</button></div>');
  if(action==='calendar-confirm-disconnect') {
    try {calendarAccount=await api('calendar-disconnect',{provider:p});calendarChecks.clear();showCalendarSettings();}catch(error){message(error.message);}
  }
  if(action==='cancel-dinner'&&activeMeal?.organizer)show('Cancel this dinner?', '<div class="stack"><p>Guests will see that the dinner is cancelled. Any calendar invitation sent through Enkai will be cancelled too.</p><button data-action="confirm-cancel-dinner">Cancel dinner & notify guests</button><button data-action="calendar-back">Keep dinner</button></div>');
  if(action==='confirm-cancel-dinner'&&activeMeal?.organizer)syncMeal('manage',{id:activeMeal.id,version:activeMeal.version,details:{...activeMeal,cancelled:true}});
});
// Native browser reload remains available; pull-to-refresh is an additional action.
let calendarTouchStart=null;
document.addEventListener('touchstart',event=>{
  const scrolling=panel.open?panel:document.scrollingElement;
  calendarTouchStart=event.touches.length===1&&scrolling.scrollTop<=0&&!event.target.closest('input,textarea,select,button')?event.touches[0].clientY:null;
},{passive:true});
document.addEventListener('touchend',event=>{
  if(calendarTouchStart!==null&&event.changedTouches[0]?.clientY-calendarTouchStart>100)refreshCalendars(true);
  calendarTouchStart=null;
},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCalendars();});
window.addEventListener('pageshow',event=>{if(event.persisted)refreshCalendars();});

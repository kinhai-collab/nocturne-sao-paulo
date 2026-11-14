'use strict';
// Message previews contain restaurant information only. Dinner details stay in
// the text the host chooses to share, and the invitation remains an opaque code.
window.EnkaiInvites = (() => {
  function title(meal) {
    const host = String(meal.hostName || '').trim().split(/\s+/)[0];
    const start = host && host !== 'Your' ? host + ' invited you' : 'You’re invited';
    return meal.restaurant ? start + ' to dinner at ' + meal.restaurant : start + ' to choose where to eat';
  }
  function text(meal) {
    let date = meal.times?.length ? 'Help choose from ' + meal.times.length + ' date options' : 'Date to be decided';
    if (meal.selectedTime) {
      date = 'Time to be confirmed';
      if (meal.timeZone) try {
        date = new Intl.DateTimeFormat('en', {timeZone:meal.timeZone, weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'}).format(new Date(meal.selectedTime));
      } catch {}
    }
    const options = !meal.restaurant && meal.restaurants?.length ? 'Options: ' + meal.restaurants.slice(0,3).join(', ') + (meal.restaurants.length > 3 ? ' and more' : '') : '';
    return [title(meal), [meal.location,date].filter(Boolean).join(' · '), options,
      meal.selectedTime && meal.restaurant ? 'Open Enkai to RSVP.' : !meal.restaurant && !meal.restaurants?.length && meal.selectedTime ? 'Open Enkai to join the plan.' : 'Open Enkai to vote on the options that work for you.'].filter(Boolean).join('\n');
  }
  function url(meal, {base,theme,venue,previewBase}) {
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(meal.invite || '')) throw Error('This invitation is unavailable.');
    const bytes = meal.invite.replaceAll('-','').match(/../g).map(pair=>String.fromCharCode(parseInt(pair,16))).join('');
    const code = btoa(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    const path = meal.restaurant && venue && /^[a-z0-9-]+$/.test(venue.id) ? 'invite/' + venue.id + '.html' : 'i.html';
    const target = new URL(path,base);
    const livePlace=meal.restaurant && meal.venues?.find(v=>v.name===meal.restaurant && /^[\w-]{1,255}$/.test(v.placeId));
    let preview;
    if(livePlace && !venue && previewBase) {
      try {const candidate=new URL(previewBase);if(candidate.protocol==='https:' && !candidate.username && !candidate.password)preview=candidate;} catch {}
    }
    const destination=preview || target;
    destination.searchParams.set('code',code);
    if (['supper-club','after-hours'].includes(theme)) destination.searchParams.set('theme',theme);
    if(preview && Number.isSafeInteger(meal.version) && meal.version>0)destination.searchParams.set('v',String(meal.version));
    if(preview)destination.searchParams.set('image','food1');
    return destination.href;
  }
  return Object.freeze({title,text,url,message:(meal,url)=>text(meal)+'\n'+url});
})();

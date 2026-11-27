'use strict';
// Shared messages contain generic invitation and restaurant information only.
window.EnkaiInvites = (() => {
  function title(meal) {
    const host = String(meal.hostName || '').trim().split(/\s+/)[0];
    const start = host && host !== 'Your' ? host + ' invited you' : 'You’re invited';
    return meal.restaurant ? start + ' to dinner at ' + meal.restaurant : start + ' to choose where to eat';
  }
  function text(meal) {
    const options = !meal.restaurant && meal.restaurants?.length ? 'Options: ' + meal.restaurants.slice(0,3).join(', ') + (meal.restaurants.length > 3 ? ' and more' : '') : '';
    return [title(meal), meal.location, options, 'Open Enkai to view your invitation.'].filter(Boolean).join('\n');
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

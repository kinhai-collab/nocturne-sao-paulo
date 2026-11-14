// A credential-free server endpoint. Deploy separately from the GitHub Pages app.
const appBase='https://kinhai-collab.github.io/nocturne-sao-paulo/';
const endpoint='https://mxmqqqzxopjinlkjtcnb.supabase.co/functions/v1/meal-planner';
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Vary':'User-Agent'};

export function invitationTarget(params) {
  const code=params.get('code');
  if(!/^[A-Za-z0-9_-]{22}$/.test(code||''))return null;
  const bytes=Buffer.from(code,'base64url');
  if(bytes.length!==16 || bytes.toString('base64url')!==code)return null;
  const hex=bytes.toString('hex');
  const invite=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  const destination=new URL('planner.html',appBase);
  const theme=params.get('theme');
  if(['supper-club','after-hours'].includes(theme))destination.searchParams.set('theme',theme);
  destination.hash='invite='+invite;
  return {invite,destination:destination.href};
}

export async function invitationResponse(url,userAgent='',request=fetch) {
  const target=invitationTarget(new URL(url).searchParams);
  if(!target)return new Response('This invitation is incomplete. Ask your host for the full Enkai link.',{status:400,headers});
  // People open the real app immediately; chat crawlers read server-rendered metadata.
  if(!/WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|SkypeUriPreview|Googlebot|bingbot/i.test(userAgent))
    return new Response(null,{status:302,headers:{...headers,Location:target.destination}});
  const call=async action=>{
    const response=await request(endpoint,{method:'POST',headers:{Origin:'https://kinhai-collab.github.io','Content-Type':'application/json'},
      body:JSON.stringify({action,invite:target.invite}),cache:'no-store',signal:AbortSignal.timeout(14000)});
    return response.ok?response.json():null;
  };
  const [info,media]=await Promise.all([call('preview').catch(()=>null),call('preview-photo').catch(()=>null)]);
  if(!info?.title)return new Response('This invitation is unavailable. Ask your host to check the link.',{status:404,headers});
  const photo=media?.photo;
  const livePhoto=photo && /^https:\/\//.test(photo.url) && (photo.kind==='website' || /^https:\/\/([\w-]+\.)*googleusercontent\.com\//.test(photo.url));
  const image=livePhoto?photo.url:appBase+'assets/tuju-course.jpg';
  const host=String(info.hostName||'Your host').trim().split(/\s+/)[0];
  const title=(host==='Your'?'You’re invited':host+' invited you')+(info.restaurant?' to '+info.restaurant:' to choose where to eat');
  let when='Help choose a time that works for you';
  if(info.selectedTime&&info.timeZone)try{when=new Intl.DateTimeFormat('en',{timeZone:info.timeZone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(info.selectedTime));}catch{}
  const description=[info.location,when,'Open Enkai to vote or RSVP.'].filter(Boolean).join(' · ');
  const credit=livePhoto?(photo.kind==='website'?'Photo: restaurant website':'Google Maps · '+(photo.authors||[]).map(a=>a.name).join(', ')):'Enkai dining inspiration; restaurant photo unavailable';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${escape(title)} · Enkai</title><meta property="og:type" content="website"><meta property="og:site_name" content="Enkai"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:alt" content="${escape(credit)}"><meta name="twitter:card" content="summary_large_image"></head><body><main><h1>${escape(title)}</h1><p>${escape(description)}</p><figure><img src="${escape(image)}" alt="${escape(info.restaurant||'Dining inspiration')}"><figcaption>${escape(credit)}</figcaption></figure><p><a href="${escape(target.destination)}">Open your invitation in Enkai</a></p></main></body></html>`;
  return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src https:; base-uri 'none'; frame-ancestors 'none'"}});
}

import {officialWebsitePhoto} from './website-photo.ts';
// Store only the Place ID. Photo resource names and URLs are resolved on demand.
export function selectedPlaceId(details: any): string | null {
  if (!details || details.cancelled || !details.restaurant) return null;
  const venue = details.venues?.find((item: any) => item.name === details.restaurant);
  return typeof venue?.placeId === 'string' && /^[\w-]{1,255}$/.test(venue.placeId) ? venue.placeId : null;
}

function googleLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value.startsWith('//') ? 'https:' + value : value);
    if (url.protocol === 'https:' && (url.hostname === 'google.com' || url.hostname.endsWith('.google.com'))) return url.href;
  } catch { /* Ignore untrusted links in provider data. */ }
}

export async function freshPlacePhoto(placeId: string, key: string, request: typeof fetch = fetch, website=officialWebsitePhoto) {
  if (!/^[\w-]{1,255}$/.test(placeId)) throw Error('Invalid place.');
  const details = await request('https://places.googleapis.com/v1/places/' + placeId, {
    headers: {'X-Goog-Api-Key':key, 'X-Goog-FieldMask':'photos,websiteUri'},
    signal:AbortSignal.timeout(6000), cache:'no-store',
  });
  if (!details.ok) throw Error('Photo unavailable.');
  const place = await details.json();
  const photo = (Array.isArray(place.photos)?place.photos:[])
    .filter((p:any)=>!(p.widthPx>0&&p.widthPx<400)&&!(p.heightPx>0&&p.heightPx<240)&&
      !(p.widthPx&&p.heightPx&&(p.widthPx/p.heightPx>3.5||p.widthPx/p.heightPx<0.4)))
    .sort((a:any,b:any)=>{
      const score=(p:any)=>p.widthPx&&p.heightPx?(p.widthPx/p.heightPx>=1.2&&p.widthPx/p.heightPx<=2.3?2:1):0;
      return score(b)-score(a);
    })[0];
  if (!photo) {
    if(typeof place.websiteUri==='string')try{return await website(place.websiteUri);}catch{}
    return {photo:null};
  }
  if (typeof photo.name !== 'string' || photo.name.length > 2000 ||
      !photo.name.startsWith('places/' + placeId + '/photos/') ||
      !/^places\/[\w-]+\/photos\/[\w-]+$/.test(photo.name)) throw Error('Photo unavailable.');
  const media = new URL('https://places.googleapis.com/v1/' + photo.name + '/media');
  media.searchParams.set('maxWidthPx','800');
  media.searchParams.set('skipHttpRedirect','true');
  const response = await request(media, {headers:{'X-Goog-Api-Key':key}, signal:AbortSignal.timeout(6000), cache:'no-store'});
  if (!response.ok) throw Error('Photo unavailable.');
  const url = new URL((await response.json()).photoUri);
  if (url.protocol !== 'https:' || !(url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) throw Error('Photo unavailable.');
  return {photo:{kind:'google',url:url.href, source:googleLink(photo.googleMapsUri) || googleLink(place.googleMapsUri),
    authors:(photo.authorAttributions || []).slice(0,10).map((author:any) => ({
      name:typeof author.displayName === 'string' ? author.displayName.slice(0,200) : 'Google Maps contributor',
      uri:googleLink(author.uri),
    }))}};
}

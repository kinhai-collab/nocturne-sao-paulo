import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.12';
import {calendarAction,canonicalAccount,saveCalendarEmail,runCalendarJobs} from '../_shared/calendar.ts';
import {selectedPlaceId,freshPlacePhoto} from '../_shared/place-photo.ts';
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

const origin = 'https://kinhai-collab.github.io';
const audience = '701098268942-l2sf5ldelqt3b4q1jro8cppv18bcvdlq.apps.googleusercontent.com';
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const microsoftAudience = 'f3b49437-bb05-4ea3-a4cb-9925ea767320';
const microsoftTenant = '9188040d-6c67-4c5b-b112-36a304b66dad';
const microsoftIssuer = 'https://login.microsoftonline.com/' + microsoftTenant + '/v2.0';
const microsoftKeys = createRemoteJWKSet(new URL('https://login.microsoftonline.com/consumers/discovery/v2.0/keys'));
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Authorization-Provider',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const list = (value: unknown, max: number, valid: (item: string) => boolean) =>
  Array.isArray(value) && value.length <= max && new Set(value).size === value.length &&
  value.every(item => typeof item === 'string' && valid(item));
const time = (item: string) => item.length === 24 && item.endsWith('Z') &&
  Number.isFinite(Date.parse(item)) && new Date(item).toISOString() === item;
const label = (item: string) => item.trim().length > 0 && item.length <= 450;
const validTimeZone = (zone: unknown) => {
  if (typeof zone !== 'string' || !zone || zone.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; }
  catch { return false; }
};


const displayName = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : fallback;

async function verifyGoogle(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    audience, issuer: ['accounts.google.com', 'https://accounts.google.com'], algorithms: ['RS256'],
    requiredClaims: ['sub', 'exp', 'iat'],
  });
  if (!payload.sub || !/^\d{1,255}$/.test(payload.sub) || payload.email_verified !== true ||
      (payload.azp && payload.azp !== audience)) throw Error('Invalid identity');
  return payload;
}

const sessions = 'meal_remembered_sessions';
const sessionHash = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

async function dinnerPhoto(plan: any) {
  const placeId = selectedPlaceId(plan.details);
  if (!placeId) return reply({photo:null});
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return reply({error:'Restaurant photo unavailable.'},503);
  const {data:reserved,error} = await db.rpc('meal_reserve_invitation_photo',{plan_id:plan.id});
  if (error || !reserved) return reply({error:'View restaurant photos on Google Maps.'},429);
  try { return reply(await freshPlacePhoto(placeId,key)); }
  catch { return reply({error:'View restaurant photos on Google Maps.'},502); }
}

Deno.serve(async req => {
  if (req.headers.get('origin') !== origin) return reply({ error: 'Origin not allowed.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  let input;
  try {
    const raw = await req.text();
    if (raw.length > 24000) return reply({ error: 'Request is too large.' }, 413);
    input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({error:'Invalid planner request.'},400);
  } catch { return reply({ error: 'Could not read the planner request.' }, 400); }
  // An unguessable invitation link reveals only the dinner summary, never membership or responses.
  if (input.action === 'preview' || input.action === 'preview-photo') {
    if (typeof input.invite !== 'string' || !uuid.test(input.invite)) return reply({ error: 'This invitation is unavailable.' }, 404);
    const { data, error } = await db.from('meal_plans').select('id,details').eq('invite', input.invite).maybeSingle();
    if (error) return reply({ error: 'Could not load this invitation. Please retry.' }, 503);
    if (!data) return reply({ error: 'This invitation is unavailable. Ask the host for a new link.' }, 404);
    if (input.action === 'preview-photo') return dinnerPhoto(data);
    const d = data.details;
    return reply({ title: d.title, location: d.location, restaurant: d.restaurant, selectedTime: d.selectedTime,
      timeZone: d.timeZone, duration: d.duration, hasPhoto:Boolean(selectedPlaceId(d)), hostName: d.hostName?.split(/\s+/)[0] || 'Your host' });
  }
  const credential = req.headers.get('authorization')?.match(/^Bearer ([\w.-]+)$/)?.[1];
  if (!credential || credential.length > 10000) return reply({ error: 'Sign in with Google or Microsoft to continue.' }, 401);
  const remembered = /^nocturne_[a-f0-9]{64}$/.test(credential);
  let microsoft = req.headers.get('authorization-provider') === 'microsoft';
  let tokenHash = '';
  let actor: string;
  let name: string;
  let verifiedEmail: unknown;
  try {
    if (remembered) {
      tokenHash = await sessionHash(credential);
      const { data, error } = await db.from(sessions).select('account, display_name, microsoft')
        .eq('token_hash', tokenHash).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (error) return reply({ error: 'Could not check your saved sign-in. Try again.' }, 503);
      if (!data) return reply({ error: 'Your saved sign-in expired. Sign in again.' }, 401);
      actor = data.account;
      name = data.display_name;
      microsoft = data.microsoft;
    } else if (microsoft) {
      const { payload } = await jwtVerify(credential, microsoftKeys, {
        audience: microsoftAudience, issuer: microsoftIssuer, algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'tid'],
      });
      if (payload.tid !== microsoftTenant || !payload.sub || payload.sub.length > 255) throw Error('Invalid identity');
      actor = payload.sub;
      name = displayName(payload.name, 'Microsoft guest');
      verifiedEmail = payload.email;
    } else {
      const google = await verifyGoogle(credential);
      actor = google.sub!;
      name = displayName(google.name, 'Google guest');
      verifiedEmail = google.email;
    }
  } catch {
    return reply({ error: 'Sign-in expired or could not be verified. Sign in again.' }, 401);
  }

  try {
    const canonical = await canonicalAccount(db,actor,microsoft);
    if (input.action === 'dinner-photo') {
      if (typeof input.id !== 'string' || !uuid.test(input.id)) return reply({error:'Dinner unavailable.'},404);
      const {data:plan,error} = await db.from('meal_plans').select('id,owner,details').eq('id',input.id).maybeSingle();
      if (error) return reply({error:'Restaurant photo unavailable.'},503);
      if (!plan) return reply({error:'Dinner unavailable.'},404);
      if (plan.owner !== canonical) {
        const {data:member,error:memberError} = await db.from('meal_plan_members').select('meal_id').eq('meal_id',plan.id).eq('account',canonical).maybeSingle();
        if (memberError) return reply({error:'Restaurant photo unavailable.'},503);
        if (!member) return reply({error:'Open the invitation to join this dinner first.'},403);
      }
      return dinnerPhoto(plan);
    }
    if (!remembered && verifiedEmail) await saveCalendarEmail(db,canonical,verifiedEmail);
    if (typeof input.action === 'string' && input.action.startsWith('calendar-')) {
      try {
        const result=await calendarAction(db,canonical,input);
        if(input.action==='calendar-refresh')EdgeRuntime.waitUntil(runCalendarJobs(db).catch(()=>{}));
        return reply(result);
      } catch(error) {return reply({error:error instanceof Error?error.message:'Calendar request failed.'},400);}
    }
    const { action, id, invite, version, details, vote, attendance, restaurant, googleCredential, city, food, persistent, photo, placeId } = input;
    if (action === 'photo') {
      if (typeof photo !== 'string' || photo.length > 2000 || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(photo)) return reply({error:'Photo unavailable.'},400);
      const key=Deno.env.get('GOOGLE_PLACES_API_KEY');
      const {data:reserved,error}=await db.rpc('meal_reserve_photo');
      if(!key||error||!reserved) return reply({error:'Photo preview unavailable. You can view photos on Google Maps.'},429);
      try {
        const target=new URL('https://places.googleapis.com/v1/'+photo+'/media');
        target.searchParams.set('maxWidthPx','480');target.searchParams.set('skipHttpRedirect','true');
        const response=await fetch(target,{headers:{'X-Goog-Api-Key':key},signal:AbortSignal.timeout(8000)});
        if(!response.ok) return reply({error:'Photo unavailable.'},502);
        const data=await response.json();
        const uri=new URL(data.photoUri);
        if(uri.protocol!=='https:' || !(uri.hostname==='googleusercontent.com'||uri.hostname.endsWith('.googleusercontent.com'))) return reply({error:'Photo unavailable.'},502);
        return reply({url:uri.href});
      } catch {return reply({error:'Photo unavailable.'},502);}
    }
    if (action === 'places') {
      if (typeof city !== 'string' || !city.trim() || city.length > 120 ||
          typeof food !== 'string' || food.length > 100) {
        return reply({ error: 'Enter a city and a food type of up to 100 characters.' }, 400);
      }
      const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
      if (!key) return reply({ error: 'Live Google Maps search is unavailable.' }, 503);
      const { data: reserved, error: quotaError } = await db.rpc('meal_reserve_places_search');
      if (quotaError) return reply({ error: 'Restaurant search is temporarily unavailable.' }, 503);
      if (!reserved) return reply({ error: 'Enkai reached its monthly Google Maps search limit. You can still search in Google Maps.' }, 429);
      try {
        const result = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.primaryTypeDisplayName,places.attributions,places.photos,places.regularOpeningHours,places.googleMapsUri',
          },
          body: JSON.stringify({
            textQuery: `${food.trim() || 'Restaurants'} in ${city.trim()}`,
            includedType: 'restaurant',
            pageSize: 20,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!result.ok) return reply({ error: 'Google Maps search is temporarily unavailable.' }, 502);
        const { places = [] } = await result.json();
        return reply(places);
      } catch {
        return reply({ error: 'Google Maps search did not respond. Try again.' }, 502);
      }
    }
    if (action === 'remember' && !remembered) {
      const token = 'nocturne_' + (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
      const { error } = await db.from(sessions).insert({
        token_hash: await sessionHash(token), account: actor, display_name: name, microsoft,
        expires_at: new Date(Date.now() + (persistent === false ? 1 : 30) * 86400000).toISOString(),
      });
      if (error) return reply({ error: 'Could not save your sign-in on this browser.' }, 503);
      await db.from(sessions).delete().lt('expires_at', new Date().toISOString());
      return reply({ token });
    }
    if (action === 'signout' && remembered) {
      const { error } = await db.from(sessions).delete().eq('token_hash', tokenHash);
      return error ? reply({ error: 'Could not revoke the saved sign-in.' }, 503) : reply({ ok: true });
    }
    let payload;
    let linkedGoogle = null;
    if (action === 'link' && microsoft && !remembered && typeof googleCredential === 'string' && googleCredential.length <= 10000) {
      try { linkedGoogle = (await verifyGoogle(googleCredential)).sub; }
      catch { return reply({ error: 'Google account could not be verified. Try signing in again.' }, 400); }
      payload = {};
    } else if (action === 'list') payload = {};
    else if (action === 'join' && typeof invite === 'string' && uuid.test(invite)) payload = { invite };
    else if (action === 'suggest' && typeof id === 'string' && uuid.test(id) && typeof restaurant === 'string' && label(restaurant) && restaurant.length <= 120 &&
      (placeId === undefined || (typeof placeId === 'string' && /^[\w-]{1,255}$/.test(placeId)))) payload = { id, restaurant, ...(placeId?{placeId}:{}) };
    else if (action === 'rsvp' && typeof id === 'string' && uuid.test(id) &&
             ['going', 'maybe', 'declined'].includes(attendance)) {
      payload = { id, attendance, calendarAccept: input.calendarAccept === true };
    }
    else if (action === 'respond' && typeof id === 'string' && uuid.test(id) &&
             Number.isSafeInteger(version) && list(vote?.times, 10, time) && list(vote?.restaurants, 30, label) &&
             (attendance === undefined || ['going', 'maybe', 'declined'].includes(attendance))) {
      payload = { id, version, vote, calendarAccept: input.calendarAccept === true, ...(attendance ? { attendance } : {}) };
    }
    else if (action === 'vote' && typeof id === 'string' && uuid.test(id) &&
             list(vote?.times, 10, time) && list(vote?.restaurants, 30, label)) {
      payload = { id, vote: { times: vote.times, restaurants: vote.restaurants } };
    } else if (action === 'create' || action === 'manage') {
      if (!details || (details.timeZone !== undefined && !validTimeZone(details.timeZone)) || !text(details.title, 100) || !details.title.trim() || !text(details.location, 120) ||
          ![60, 90, 120, 150, 180, 240].includes(details.duration) ||
          !list(details.times, 10, time) || !list(details.restaurants, 30, label) ||
          (!details.times.length && !details.restaurants.length) ||
          !list(details.guests, 50, label) || !list(details.attending, 50, label) ||
          !['Unbooked', 'Booked', 'Confirmed', 'In-person booking only'].includes(details.status) ||
          (details.selectedTime !== '' && !details.times.includes(details.selectedTime)) ||
          (details.restaurant !== '' && !details.restaurants.includes(details.restaurant)) ||
          (action === 'manage' && (typeof id !== 'string' || !uuid.test(id) || !Number.isSafeInteger(version)))) {
        return reply({ error: 'Check the meal details and poll options.' }, 400);
      }
      const { title, location, duration, times, restaurants, guests, attending, status, selectedTime, restaurant } = details;
      let timeZone = details.timeZone;
      let hostName = name;
      let venues=details.venues;
      if (venues !== undefined && (!Array.isArray(venues)||venues.length>30||venues.some(v=>
        !details.restaurants.includes(v.name)||typeof v.placeId!=='string'||! /^[\w-]{1,255}$/.test(v.placeId)))) return reply({error:'Check the restaurant choices.'},400);
      if (action === 'manage') {
        const { data: existing, error: lookupError } = await db.from('meal_plans').select('details').eq('id', id).maybeSingle();
        if (lookupError) return reply({ error: 'Could not check the dinner time zone. Please retry.' }, 503);
        timeZone ??= existing?.details?.timeZone;
        hostName = existing?.details?.hostName || 'Your host';
        venues ??= existing?.details?.venues || [];
      }
      payload = { id, version, details: {
        title, location, duration, times, restaurants, guests, attending, status, selectedTime, restaurant,
        hostName,
        calendarEnabled: details.calendarEnabled === true,
        cancelled: details.cancelled === true,
        venues:(venues||[]).map((v:{name:string;placeId:string})=>({name:v.name,placeId:v.placeId})),
        ...(timeZone ? { timeZone } : {}),
      } };
    } else return reply({ error: 'Invalid planner request.' }, 400);

    const { data, error } = microsoft
      ? await db.rpc('meal_microsoft_action', { ms_sub: actor, actor_name: name, operation: action, payload, verified_google_sub: linkedGoogle })
      : await db.rpc('meal_planner_action', { actor, actor_name: name, operation: action, payload });
    if (error) {
      console.error('Planner database operation failed', action, error.code);
      return reply({ error: 'The meal planner could not save or load this request. Please retry.' }, 503);
    }
    if(!data?.error&&['create','manage','respond','rsvp','join'].includes(action)) {
      EdgeRuntime.waitUntil(runCalendarJobs(db,data.id,1).catch(()=>{}));
    }
    return reply(data, data?.error ? 409 : 200);
  } catch {
    return reply({ error: 'Could not read the planner request.' }, 400);
  }
});

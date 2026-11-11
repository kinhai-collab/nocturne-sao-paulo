import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.12';

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

Deno.serve(async req => {
  if (req.headers.get('origin') !== origin) return reply({ error: 'Origin not allowed.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const credential = req.headers.get('authorization')?.match(/^Bearer ([\w.-]+)$/)?.[1];
  if (!credential || credential.length > 10000) return reply({ error: 'Sign in with Google to continue.' }, 401);
  const remembered = /^nocturne_[a-f0-9]{64}$/.test(credential);
  let microsoft = req.headers.get('authorization-provider') === 'microsoft';
  let tokenHash = '';
  let actor: string;
  let name: string;
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
    } else {
      const google = await verifyGoogle(credential);
      actor = google.sub!;
      name = displayName(google.name, 'Google guest');
    }
  } catch {
    return reply({ error: 'Sign-in expired or could not be verified. Sign in again.' }, 401);
  }

  try {
    const raw = await req.text();
    if (raw.length > 24000) return reply({ error: 'Request is too large.' }, 413);
    const { action, id, invite, version, details, vote, attendance, restaurant, googleCredential, city, food } = JSON.parse(raw);
    if (action === 'places') {
      if (typeof city !== 'string' || !city.trim() || city.length > 120 ||
          typeof food !== 'string' || food.length > 100) {
        return reply({ error: 'Enter a city and a food type of up to 100 characters.' }, 400);
      }
      const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
      if (!key) return reply({ error: 'Live Google Maps search is unavailable.' }, 503);
      const { data: reserved, error: quotaError } = await db.rpc('meal_reserve_places_search');
      if (quotaError) return reply({ error: 'Restaurant search is temporarily unavailable.' }, 503);
      if (!reserved) return reply({ error: 'Nocturne reached its monthly Google Maps search limit. You can still search in Google Maps.' }, 429);
      try {
        const result = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.primaryTypeDisplayName,places.attributions',
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
    else if (action === 'suggest' && typeof id === 'string' && uuid.test(id) && typeof restaurant === 'string' && label(restaurant) && restaurant.length <= 120) payload = { id, restaurant };
    else if (action === 'rsvp' && typeof id === 'string' && uuid.test(id) &&
             ['going', 'maybe', 'declined'].includes(attendance)) {
      payload = { id, attendance };
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
      if (action === 'manage' && timeZone === undefined) {
        const { data: existing, error: lookupError } = await db.from('meal_plans').select('details').eq('id', id).maybeSingle();
        if (lookupError) return reply({ error: 'Could not check the dinner time zone. Please retry.' }, 503);
        timeZone = existing?.details?.timeZone;
      }
      payload = { id, version, details: {
        title, location, duration, times, restaurants, guests, attending, status, selectedTime, restaurant,
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
    return reply(data, data?.error ? 409 : 200);
  } catch {
    return reply({ error: 'Could not read the planner request.' }, 400);
  }
});

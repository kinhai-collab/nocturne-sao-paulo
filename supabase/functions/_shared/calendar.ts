import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.2.12';
import {APP,EMAIL,GOOGLE_SCOPE,MICROSOFT_SCOPE,Provider,CalendarItem,conflicts,normalizeGoogle,normalizeMicrosoft,eventPayload,eventEnd,isConfirmed,scheduleKey,sameSchedule} from './calendar-core.ts';
type DB=any;
const gBase='https://www.googleapis.com/calendar/v3/calendars/primary/events';
const mBase='https://graph.microsoft.com/v1.0/me/events';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const microsoftKeys=createRemoteJWKSet(new URL('https://login.microsoftonline.com/consumers/discovery/v2.0/keys'));
const bytes=(s:string)=>new TextEncoder().encode(s);
const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export const digest=async(s:string)=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(s))));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
function config(provider:Provider) {
  const prefix=provider==='google'?'CALENDAR_GOOGLE':'CALENDAR_MICROSOFT';
  return {client:Deno.env.get(prefix+'_CLIENT_ID'),secret:Deno.env.get(prefix+'_CLIENT_SECRET'),
    redirect:Deno.env.get('SUPABASE_URL')+'/functions/v1/calendar-callback',
    token:provider==='google'?'https://oauth2.googleapis.com/token':'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    authorize:provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    scope:provider==='google'?GOOGLE_SCOPE:MICROSOFT_SCOPE};
}
async function cryptKey() {
  const raw=Deno.env.get('CALENDAR_ENCRYPTION_KEY');
  if(!raw)throw Error('Calendar connections are not configured yet.');
  return crypto.subtle.importKey('raw',unb64(raw),'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(value:string,context:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(context)},await cryptKey(),bytes(value));
  return b64(iv)+'.'+b64(new Uint8Array(cipher));
}
async function open(value:string,context:string) {
  const [iv,cipher]=value.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:bytes(context)},await cryptKey(),unb64(cipher)));
}
export async function checked(query:any) {const {data,error}=await query;if(error)throw Error('Calendar storage is temporarily unavailable.');return data;}
export async function canonicalAccount(db:DB,actor:string,microsoft:boolean) {
  if(!microsoft)return actor;
  const link=await checked(db.from('meal_microsoft_links').select('google_sub').eq('microsoft_sub',actor).maybeSingle());
  return link?.google_sub||'microsoft:'+actor;
}
export async function saveCalendarEmail(db:DB,actor:string,email:unknown) {
  if(typeof email==='string'&&EMAIL.test(email))await checked(db.from('meal_calendar_profiles').upsert({account:actor,email:email.toLowerCase()},{onConflict:'account'}));
}
export async function calendarStatus(db:DB,actor:string) {
  const rows=await checked(db.from('meal_calendar_connections').select('provider,email,status').eq('account',actor));
  const profile=await checked(db.from('meal_calendar_profiles').select('preferred_provider,email').eq('account',actor).maybeSingle());
  return {connections:rows,preferredProvider:profile?.preferred_provider||rows[0]?.provider||null,
    email:profile?.email||null,available:Object.fromEntries((['google','microsoft'] as Provider[]).map(p=>[p,Boolean(config(p).client&&config(p).secret&&Deno.env.get('CALENDAR_ENCRYPTION_KEY'))]))};
}
export async function startConnection(db:DB,actor:string,input:any) {
  const provider=input.provider as Provider;
  if(!['google','microsoft'].includes(provider))throw Error('Choose Google or Outlook.');
  const c=config(provider);
  if(!c.client||!c.secret)throw Error('This calendar connection is not configured yet.');
  const state=random(),verifier=random(),nonce=random();
  const hash=await digest(state);
  await checked(db.from('meal_calendar_oauth_states').insert({state_hash:hash,account:actor,provider,
    verifier_cipher:await seal(verifier,'oauth:'+hash),nonce,theme:input.theme==='after-hours'?'after-hours':'supper-club',
    meal_id:typeof input.id==='string'&&/^[\da-f-]{36}$/.test(input.id)?input.id:null,expires_at:new Date(Date.now()+600000).toISOString()}));
  await db.from('meal_calendar_oauth_states').delete().lt('expires_at',new Date().toISOString());
  const url=new URL(c.authorize);
  Object.entries({client_id:c.client,redirect_uri:c.redirect,response_type:'code',scope:c.scope,state,nonce,
    code_challenge:await digest(verifier),code_challenge_method:'S256',prompt:provider==='google'?'consent select_account':'select_account',
    ...(provider==='google'?{access_type:'offline'}:{})}).forEach(([k,v])=>url.searchParams.set(k,v));
  return {url:url.href};
}
export async function finishConnection(db:DB,url:URL) {
  const raw=url.searchParams.get('state');
  const fallback=new URL('planner.html?view=settings&calendar=failed',APP);
  if(!raw||raw.length>200)return fallback.href;
  const hash=await digest(raw);
  const rows=await checked(db.from('meal_calendar_oauth_states').delete().eq('state_hash',hash).gt('expires_at',new Date().toISOString()).select());
  const state=rows[0];if(!state)return fallback.href;
  const dest=new URL('planner.html',APP);dest.searchParams.set('theme',state.theme);
  if(state.meal_id)dest.hash='meal='+state.meal_id;else dest.searchParams.set('view','settings');
  dest.searchParams.set('calendar','failed');
  if(url.searchParams.has('error')) {dest.searchParams.set('calendar','cancelled');return dest.href;}
  let stage='token_exchange';
  try {
    const c=config(state.provider);
    const res=await fetch(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:c.client!,client_secret:c.secret!,redirect_uri:c.redirect,grant_type:'authorization_code',
        code:url.searchParams.get('code')||'',code_verifier:await open(state.verifier_cipher,'oauth:'+hash)}),signal:AbortSignal.timeout(15000)});
    const tokens=await res.json();if(!res.ok||!tokens.id_token||!tokens.refresh_token)throw Error('Calendar authorization incomplete');
    stage='identity_verification';
    const google=state.provider==='google';
    const {payload}=await jwtVerify(tokens.id_token,google?googleKeys:microsoftKeys,{
      audience:c.client,issuer:google?['https://accounts.google.com','accounts.google.com']:'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',algorithms:['RS256'],requiredClaims:['sub','exp','iat']});
    if(payload.nonce!==state.nonce)throw Error('Invalid authorization');
    stage='permission_verification';
    const scopes=String(tokens.scope||'');
    if(google?!scopes.split(' ').includes('https://www.googleapis.com/auth/calendar.events'):!scopes.toLowerCase().includes('calendars.readwrite'))throw Error('Calendar permission was not granted');
    let email=payload.email,subject=String(payload.sub);
    if(google&&payload.email_verified!==true)throw Error('Email not verified');
    if(!google) {
      stage='calendar_owner';
      const profile=await fetch('https://graph.microsoft.com/v1.0/me/calendar?$select=id,owner',{headers:{Authorization:'Bearer '+tokens.access_token,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
      if(!profile.ok){
        stage='calendar_owner_http_'+profile.status;
        const detail=await profile.json().catch(()=>null);
        const code=detail?.error?.code;
        if(typeof code==='string'&&/^[A-Za-z_]{2,64}$/.test(code))stage+='_'+code;
        const requestId=profile.headers.get('request-id');
        if(requestId&&/^[a-f\d-]{36}$/i.test(requestId))console.warn('Calendar provider request',requestId);
        throw Error('Cannot read calendar account');
      }
      stage='mailbox_address';
      // The default calendar supplies the address actually used for invitations.
      // The verified ID token supplies stable identity; aliases are not user IDs.
      const calendar=await profile.json();email=calendar.owner?.address;subject=String(payload.oid||payload.sub);
    }
    if(typeof email!=='string'||!EMAIL.test(email))throw Error('Calendar account has no email');
    stage='connection_storage';
    const existing=await checked(db.from('meal_calendar_connections').select('subject').eq('account',state.account).eq('provider',state.provider).maybeSingle());
    if(existing&&existing.subject!==subject)throw Error('Disconnect the previous calendar before switching accounts');
    // The subject is authenticated by the provider. Uniqueness prevents linking
    // one mailbox to two separate Enkai accounts.
    await checked(db.from('meal_calendar_connections').upsert({account:state.account,provider:state.provider,subject,email:email.toLowerCase(),
      refresh_cipher:await seal(tokens.refresh_token,state.provider+':'+subject),scopes,status:'connected'},{onConflict:'account,provider'}));
    await saveCalendarEmail(db,state.account,email);
    stage='queue_sync';
    await enqueueAccount(db,state.account);
    dest.searchParams.set('calendar','connected');
  }catch(error) {
    // Fixed stage labels aid deployment diagnosis without exposing tokens,
    // authorization codes, account identifiers, or provider error payloads.
    const kind=error instanceof Error&&['AbortError','TimeoutError','TypeError'].includes(error.name)?error.name:'Error';
    console.warn('Calendar connection failed',state.provider,stage,kind);
    if(/_http_5\d\d/.test(stage)||['AbortError','TimeoutError'].includes(kind))dest.searchParams.set('calendar','unavailable');
  }
  return dest.href;
}
async function accessToken(db:DB,c:any) {
  if(c.status!=='connected')throw Error('Reconnect your calendar.');
  const cfg=config(c.provider);
  const res=await fetch(cfg.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',client_id:cfg.client!,client_secret:cfg.secret!,refresh_token:await open(c.refresh_cipher,c.provider+':'+c.subject)}),signal:AbortSignal.timeout(12000)});
  const data=await res.json();
  if(!res.ok||!data.access_token) {
    if(data.error==='invalid_grant')await checked(db.from('meal_calendar_connections').update({status:'reconnect'}).eq('account',c.account).eq('provider',c.provider));
    throw Error('Calendar could not be reached. Reconnect if this continues.');
  }
  if(data.refresh_token)await checked(db.from('meal_calendar_connections').update({refresh_cipher:await seal(data.refresh_token,c.provider+':'+c.subject)}).eq('account',c.account).eq('provider',c.provider));
  return data.access_token;
}
export class ProviderError extends Error { constructor(public status:number) {super('Calendar provider request failed');} }
export async function providerFetch(token:string,url:string,method='GET',body?:any) {
  const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'outlook.timezone="UTC", IdType="ImmutableId"'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new ProviderError(response.status);
  return response.status===204||response.status===202?{}:await response.json();
}
async function eventsInRange(c:any,token:string,start:string,end:string):Promise<CalendarItem[]> {
  let url=new URL(c.provider==='google'?gBase:'https://graph.microsoft.com/v1.0/me/calendarView');
  if(c.provider==='google') {url.search=new URLSearchParams({timeMin:start,timeMax:end,singleEvents:'true',maxResults:'2500'}).toString();}
  else url.search=new URLSearchParams({startDateTime:start,endDateTime:end,'$top':'1000','$select':'id,iCalUId,subject,start,end,isCancelled,showAs,responseStatus'}).toString();
  const all:CalendarItem[]=[];
  for(let page=0;page<20;page++) {
    const data=await providerFetch(token,url.href);
    for(const item of data.items||data.value||[]) {
      const event=c.provider==='google'?normalizeGoogle(item,data.timeZone||'UTC'):normalizeMicrosoft(item);
      if(event)all.push(event);
    }
    if(c.provider==='google'&&data.nextPageToken)url.searchParams.set('pageToken',data.nextPageToken);
    else if(c.provider==='microsoft'&&data['@odata.nextLink']) {
      const next=new URL(data['@odata.nextLink']);if(next.origin!=='https://graph.microsoft.com')throw Error('Invalid calendar page');url=next;
    }else return all;
  }
  throw Error('Calendar range contains too many events to check completely.');
}
export async function checkConflicts(db:DB,actor:string,meal:any) {
  const connections=await checked(db.from('meal_calendar_connections').select('*').eq('account',actor));
  const times=meal.details.selectedTime?[meal.details.selectedTime]:meal.details.times;
  const own=await checked(db.from('meal_calendar_events').select('ical_uid').eq('meal_id',meal.id).maybeSingle());
  if(!connections.length)return {status:'not_connected',options:[]};
  const results=times.map((time:string)=>({time,conflicts:[] as any[],checked:0}));
  let failed=0;
  for(const c of connections) {
    try {
      const token=await accessToken(db,c);
      // Query only the proposed days, not every day between distant poll options.
      const ranges=new Map<string,CalendarItem[]>();
      for(const result of results) {
        const key=result.time.slice(0,10);
        if(!ranges.has(key))ranges.set(key,await eventsInRange(c,token,key+'T00:00:00.000Z',new Date(Date.parse(key+'T00:00:00Z')+2*86400000).toISOString()));
        result.conflicts.push(...conflicts(ranges.get(key)!,result.time,meal.details.duration,own?.ical_uid).map(e=>({title:e.title,start:e.start,end:e.end,tentative:e.tentative,provider:c.provider})));
        result.checked++;
      }
    }catch {failed++;}
  }
  return {status:failed?'incomplete':'checked',checkedAt:new Date().toISOString(),options:results};
}
export async function enqueueAccount(db:DB,actor:string) {
  const owned=await checked(db.from('meal_plans').select('id').eq('owner',actor));
  const joined=await checked(db.from('meal_plan_members').select('meal_id').eq('account',actor));
  for(const id of new Set([...owned.map((p:any)=>p.id),...joined.map((m:any)=>m.meal_id)]))await checked(db.rpc('meal_calendar_enqueue',{target:id}));
}

export async function syncDinner(db:DB,id:string,deadline=Date.now()+90000) {
  const plan=await checked(db.from('meal_plans').select('*').eq('id',id).maybeSingle());if(!plan)return true;
  const d=plan.details;
  let record=await checked(db.from('meal_calendar_events').select('*').eq('meal_id',id).maybeSingle());
  if(!d.calendarEnabled&&!record)return true;
  if((!d.selectedTime||!d.restaurant)&&!record?.event_id)return true;
  const ownerConnections=await checked(db.from('meal_calendar_connections').select('*').eq('account',plan.owner));
  const profile=await checked(db.from('meal_calendar_profiles').select('*').eq('account',plan.owner).maybeSingle());
  const owner=record?ownerConnections.find((c:any)=>c.provider===record.provider&&c.email===record.email):
    ownerConnections.find((c:any)=>c.provider===profile?.preferred_provider)||ownerConnections[0];
  if(!owner||owner.status!=='connected') {
    if(record)await checked(db.from('meal_calendar_events').update({status:'reconnect_host'}).eq('meal_id',id));
    // Connecting/reconnecting explicitly requeues the account's dinners.
    return true;
  }
  if(!record)record=await checked(db.from('meal_calendar_events').insert({meal_id:id,account:plan.owner,provider:owner.provider,email:owner.email}).select().single());
  const token=await accessToken(db,owner);
  if(d.cancelled||!d.calendarEnabled||!d.selectedTime||!d.restaurant) {
    if(record.event_id&&record.status!=='cancelled') {
      try {await providerFetch(token,(owner.provider==='google'?gBase:mBase)+'/'+encodeURIComponent(record.event_id)+(owner.provider==='google'?'?sendUpdates=all':''),'DELETE');}
      catch(e) {if(!(e instanceof ProviderError&&[404,410].includes(e.status)))throw e;}
      await checked(db.from('meal_calendar_events').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('meal_id',id));
    }
    return true;
  }
  if(!d.timeZone||!Number.isFinite(Date.parse(d.selectedTime)))return false;
  if(record.status==='cancelled') {
    record=await checked(db.from('meal_calendar_events').update({event_key:crypto.randomUUID(),event_id:null,ical_uid:null,payload_hash:null,status:'pending'}).eq('meal_id',id).select().single());
  }
  const members=await checked(db.from('meal_plan_members').select('account,response').eq('meal_id',id).neq('account',plan.owner));
  const accounts=members.map((m:any)=>m.account);
  const connections=accounts.length?await checked(db.from('meal_calendar_connections').select('*').in('account',accounts)):[];
  const profiles=accounts.length?await checked(db.from('meal_calendar_profiles').select('*').in('account',accounts)):[];
  const guests=members.map((member:any)=>{
    const p=profiles.find((p:any)=>p.account===member.account);
    const cs=connections.filter((c:any)=>c.account===member.account);
    const c=cs.find((c:any)=>c.provider===p?.preferred_provider)||cs[0];
    return {...member,connection:c,email:c?.email||p?.email};
  }).filter((m:any)=>m.email&&EMAIL.test(m.email)&&m.email.toLowerCase()!==owner.email.toLowerCase());
  // Keep declined invitees on the same event so a later change can update their RSVP.
  const body=eventPayload(owner.provider,id,d,guests.map((g:any)=>g.email));
  const hash=await digest(JSON.stringify(body));
  let event:any;
  if(!record.event_id) {
    let recovered=false;
    if(owner.provider==='google') {
      const key='e'+record.event_key.replaceAll('-','');
      try {event=await providerFetch(token,gBase+'?sendUpdates=all','POST',{...body,id:key});}
      catch(e) {if(e instanceof ProviderError&&e.status===409){event=await providerFetch(token,gBase+'/'+key);recovered=true;}else throw e;}
    }else {
      // transactionId plus an explicit lookup protects retries after an interrupted create.
      const prop="String {d944b9ef-1f61-4c05-a4ed-32de2129cbe4} Name EnkaiMeal";
      const lookup=new URL(mBase);lookup.searchParams.set('$filter',`singleValueExtendedProperties/Any(ep: ep/id eq '${prop}' and ep/value eq '${id}')`);
      const found=await providerFetch(token,lookup.href);
      recovered=Boolean(found.value?.[0]);
      event=found.value?.[0]||await providerFetch(token,mBase,'POST',{...body,transactionId:record.event_key});
    }
    // A recovered create may predate edits made while its response was lost.
    // Save its identity first, then reconcile the current plan before accepting.
    record=await checked(db.from('meal_calendar_events').update({event_id:event.id,ical_uid:event.iCalUID||event.iCalUId,payload_hash:recovered?null:hash,schedule:recovered?null:scheduleKey(d),status:'sent',updated_at:new Date().toISOString()}).eq('meal_id',id).select().single());
  }
  if(record.payload_hash!==hash) {
    // Never overwrite existing guest acceptance during an ordinary title/location edit.
    const target=(owner.provider==='google'?gBase:mBase)+'/'+encodeURIComponent(record.event_id);
    event=await providerFetch(token,target);
    if(owner.provider==='google')for(const a of (body as any).attendees) {
      const previous=event.attendees?.find((x:any)=>x.email?.toLowerCase()===a.email);
      if(!sameSchedule(record.schedule,scheduleKey(d)))a.responseStatus='needsAction';
      else if(previous?.responseStatus)a.responseStatus=previous.responseStatus;
    }
    event=await providerFetch(token,target+(owner.provider==='google'?'?sendUpdates=all':''),'PATCH',body);
    await checked(db.from('meal_calendar_events').update({payload_hash:hash,schedule:scheduleKey(d),status:'sent',updated_at:new Date().toISOString()}).eq('meal_id',id));
  }
  let complete=true;
  const replies=await checked(db.from('meal_calendar_replies').select('account,status').eq('meal_id',id));
  guests.sort((a:any,b:any)=>Number(['accepted','tentative','declined','changed_in_calendar'].includes(replies.find((r:any)=>r.account===a.account)?.status))-
    Number(['accepted','tentative','declined','changed_in_calendar'].includes(replies.find((r:any)=>r.account===b.account)?.status)));
  for(const guest of guests) {
    if(Date.now()>deadline)return false;
    const vote=guest.response,c=guest.connection;
    const confirmed=isConfirmed(d,vote);
    const desired=confirmed?({going:'accepted',maybe:'tentative',declined:'declined'} as any)[vote.attendance]:null;
    if(!c||!desired) {
      await checked(db.from('meal_calendar_replies').upsert({meal_id:id,account:guest.account,provider:c?.provider||'email',
        status:!c?'accept_in_email':'needs_confirmation'},{onConflict:'meal_id,account'}));continue;
    }
    const desiredHash=await digest(JSON.stringify([record.ical_uid,scheduleKey(d),desired,c.provider,c.email]));
    const previous=await checked(db.from('meal_calendar_replies').select('*').eq('meal_id',id).eq('account',guest.account).maybeSingle());
    try {
      const guestToken=await accessToken(db,c);
      const prior=(e:any)=>c.provider==='google'?e.attendees?.find((a:any)=>a.self||a.email?.toLowerCase()===c.email.toLowerCase())?.responseStatus:
        ({accepted:'accepted',tentativelyAccepted:'tentative',declined:'declined'} as any)[e.responseStatus?.response];
      const matchesTime=(e:any)=>{
        const item=c.provider==='google'?normalizeGoogle(e,'UTC'):normalizeMicrosoft(e);
        return Boolean(item&&Date.parse(item.start)===Date.parse(d.selectedTime)&&Date.parse(item.end)===Date.parse(eventEnd(d)));
      };
      const hostReply=async()=>{
        const hosted=await providerFetch(token,(owner.provider==='google'?gBase:mBase)+'/'+encodeURIComponent(record.event_id));
        const item=owner.provider==='google'?normalizeGoogle(hosted,'UTC'):normalizeMicrosoft(hosted);
        if(!item||Date.parse(item.start)!==Date.parse(d.selectedTime)||Date.parse(item.end)!==Date.parse(eventEnd(d)))return null;
        return owner.provider==='google'?hosted.attendees?.find((a:any)=>a.email?.toLowerCase()===c.email.toLowerCase())?.responseStatus:
          hosted.attendees?.find((a:any)=>a.emailAddress?.address?.toLowerCase()===c.email.toLowerCase())?.status?.response;
      };
      if(previous?.desired_hash===desiredHash&&previous.event_id) {
        let current:any;
        try {current=await providerFetch(guestToken,(c.provider==='google'?gBase:mBase)+'/'+encodeURIComponent(previous.event_id));}
        catch(error) {
          if(!(error instanceof ProviderError&&[404,410].includes(error.status)))throw error;
          // A previously verified invitation was removed outside Enkai. Do not
          // silently recreate it or retry indefinitely as though it were new.
        }
        const verified=current?matchesTime(current)&&prior(current)===desired:desired==='declined'&&await hostReply()==='declined';
        await checked(db.from('meal_calendar_replies').update({status:verified?desired:'changed_in_calendar',updated_at:new Date().toISOString()}).eq('meal_id',id).eq('account',guest.account));
        continue;
      }
      let match:any;
      if(c.provider==='google') {
        const url=new URL(gBase);url.searchParams.set('iCalUID',record.ical_uid);
        const data=await providerFetch(guestToken,url.href);match=data.items?.find((e:any)=>e.status!=='cancelled');
      } else {
        const url=new URL(mBase);url.searchParams.set('$filter',"iCalUId eq '"+record.ical_uid.replaceAll("'","''")+"'");
        const data=await providerFetch(guestToken,url.href);match=data.value?.find((e:any)=>!e.isCancelled);
      }
      if(!match) {
        // Outlook can remove declined invitations. Absence alone is never proof
        // of a response: verify the organizer's received reply for this slot.
        const reply=await hostReply();
        if(desired==='declined'&&reply==='declined') {
          await checked(db.from('meal_calendar_replies').upsert({meal_id:id,account:guest.account,provider:c.provider,event_id:previous?.event_id||null,desired_hash:desiredHash,status:'declined',updated_at:new Date().toISOString()},{onConflict:'meal_id,account'}));continue;
        }
        if(c.provider==='microsoft'&&desired!=='declined'&&reply==='declined') {
          await checked(db.from('meal_calendar_replies').upsert({meal_id:id,account:guest.account,provider:c.provider,status:'restore_in_email',updated_at:new Date().toISOString()},{onConflict:'meal_id,account'}));continue;
        }
        throw Error('Invitation is still arriving');
      }
      // Cross-provider updates can arrive after the host's change. Consent is
      // for the new slot only; never accept the old invitation while waiting.
      if(!matchesTime(match))throw Error('Updated invitation is still arriving');
      const latest=await checked(db.from('meal_plans').select('details').eq('id',id).single());
      const latestMember=await checked(db.from('meal_plan_members').select('response').eq('meal_id',id).eq('account',guest.account).single());
      if(latest.details.cancelled||!latest.details.calendarEnabled||!sameSchedule(scheduleKey(latest.details),scheduleKey(d))||!sameSchedule(latestMember.response,vote))return false;
      if(c.provider==='google') {
        const self=match.attendees?.find((a:any)=>a.self||a.email?.toLowerCase()===c.email.toLowerCase());
        if(!self)throw Error('Attendee not found');
        await providerFetch(guestToken,gBase+'/'+encodeURIComponent(match.id)+'?sendUpdates=all','PATCH',
          {attendeesOmitted:true,attendees:[{email:self.email,responseStatus:desired}]});
      } else {
        const action=({accepted:'accept',tentative:'tentativelyAccept',declined:'decline'} as any)[desired];
        await providerFetch(guestToken,mBase+'/'+encodeURIComponent(match.id)+'/'+action,'POST',{sendResponse:true,comment:'Response confirmed in Enkai.'});
      }
      // A 202 is only acknowledgement. Read back before showing Synced.
      let verify:any;
      try {verify=await providerFetch(guestToken,(c.provider==='google'?gBase:mBase)+'/'+encodeURIComponent(match.id));}
      catch(error) {
        if(!(desired==='declined'&&error instanceof ProviderError&&[404,410].includes(error.status)&&await hostReply()==='declined'))throw error;
      }
      if(!verify) {
        await checked(db.from('meal_calendar_replies').upsert({meal_id:id,account:guest.account,provider:c.provider,event_id:match.id,desired_hash:desiredHash,status:'declined',updated_at:new Date().toISOString()},{onConflict:'meal_id,account'}));continue;
      }
      const actual=c.provider==='google'?verify.attendees?.find((a:any)=>a.self||a.email?.toLowerCase()===c.email.toLowerCase())?.responseStatus:
        ({accepted:'accepted',tentativelyAccepted:'tentative',declined:'declined'} as any)[verify.responseStatus?.response];
      if(actual!==desired||!matchesTime(verify))throw Error('Calendar response is still syncing');
      await checked(db.from('meal_calendar_replies').upsert({meal_id:id,account:guest.account,provider:c.provider,event_id:match.id,desired_hash:desiredHash,status:desired,updated_at:new Date().toISOString()},{onConflict:'meal_id,account'}));
    }catch {
      complete=false;
      await checked(db.from('meal_calendar_replies').upsert({meal_id:id,account:guest.account,provider:c.provider,status:c.status==='connected'?'pending':'reconnect',updated_at:new Date().toISOString()},{onConflict:'meal_id,account'}));
    }
  }
  return complete;
}
export async function runCalendarJobs(db:DB,target?:string,limit=3) {
  const started=Date.now();
  for(let i=0;i<limit;i++) {
    if(Date.now()-started>90000)return;
    const jobs=await checked(db.rpc('meal_calendar_claim',{target:target||null}));const job=jobs[0];if(!job)return;
    let success=false;
    try {success=await syncDinner(db,job.meal_id,started+90000);}catch {
      await db.from('meal_calendar_events').update({status:'retrying'}).eq('meal_id',job.meal_id);
    }
    const finished=await db.rpc('meal_calendar_finish',{target:job.meal_id,claim:job.lease,claimed_generation:job.generation,success});
    if(finished.error) {
      const code=String(finished.error.code||'unknown');
      console.warn('Calendar job completion failed',/^[A-Za-z0-9_]{3,32}$/.test(code)?code:'unknown');
      throw Error('Calendar job completion will retry.');
    }
    if(target)return;
  }
}
export async function calendarAction(db:DB,actor:string,input:any) {
  if(input.action==='calendar-status')return calendarStatus(db,actor);
  if(input.action==='calendar-connect')return startConnection(db,actor,input);
  if(input.action==='calendar-prefer') {
    const c=await checked(db.from('meal_calendar_connections').select('provider').eq('account',actor).eq('provider',input.provider).maybeSingle());
    if(!c)throw Error('Connect this calendar first.');
    await checked(db.from('meal_calendar_profiles').upsert({account:actor,preferred_provider:c.provider},{onConflict:'account'}));
    return calendarStatus(db,actor);
  }
  if(input.action==='calendar-disconnect') {
    await checked(db.from('meal_calendar_connections').delete().eq('account',actor).eq('provider',input.provider));
    await checked(db.from('meal_calendar_oauth_states').delete().eq('account',actor).eq('provider',input.provider));
    return calendarStatus(db,actor);
  }
  if(input.action==='calendar-refresh') {await enqueueAccount(db,actor);return {queued:true};}
  const p=await checked(db.from('meal_plans').select('*').eq('id',input.id).maybeSingle());
  const m=p?await checked(db.from('meal_plan_members').select('account').eq('meal_id',p.id).eq('account',actor).maybeSingle()):null;
  if(!p||(p.owner!==actor&&!m))throw Error('Open the dinner invitation first.');
  if(input.action==='calendar-conflicts')return checkConflicts(db,actor,p);
  throw Error('Unknown calendar request.');
}

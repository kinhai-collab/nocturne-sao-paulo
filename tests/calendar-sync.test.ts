import {strict as assert} from 'node:assert';
import {syncDinner,checkConflicts,calendarAction} from '../supabase/functions/_shared/calendar.ts';
import {scheduleKey} from '../supabase/functions/_shared/calendar-core.ts';
const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const encoder=new TextEncoder();
const testKey=new Uint8Array(32).fill(7);
Deno.env.set('CALENDAR_ENCRYPTION_KEY',b64(testKey));
for(const p of ['GOOGLE','MICROSOFT']) {Deno.env.set('CALENDAR_'+p+'_CLIENT_ID','test');Deno.env.set('CALENDAR_'+p+'_CLIENT_SECRET','test');}
async function cipher(role:string,provider:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await crypto.subtle.importKey('raw',testKey,'AES-GCM',false,['encrypt']);
  return b64(iv)+'.'+b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(provider+':'+role)},key,encoder.encode(role))));
}
function memoryDB(tables:Record<string,any[]>) {
  return {from(table:string){
    tables[table]??=[];
    let filters:((r:any)=>boolean)[]=[],op='select',value:any,options:any={},one=false;
    const q:any={select(){return q;},eq(k:string,v:any){filters.push(r=>r[k]===v);return q;},neq(k:string,v:any){filters.push(r=>r[k]!==v);return q;},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q;},
      insert(v:any){op='insert';value=v;return q;},update(v:any){op='update';value=v;return q;},upsert(v:any,o:any){op='upsert';value=v;options=o;return q;},
      maybeSingle(){one=true;return q;},single(){one=true;return q;},then(resolve:any){
        let rows=tables[table].filter(r=>filters.every(f=>f(r)));
        if(op==='insert'){const r={event_key:crypto.randomUUID(),...structuredClone(value)};tables[table].push(r);rows=[r];}
        if(op==='upsert'){const keys=options.onConflict.split(',');let r=tables[table].find(r=>keys.every((k:string)=>r[k]===value[k]));if(r)Object.assign(r,structuredClone(value));else{r=structuredClone(value);tables[table].push(r);}rows=[r];}
        if(op==='update')rows.forEach(r=>Object.assign(r,structuredClone(value)));
        return Promise.resolve({data:structuredClone(one?rows[0]||null:rows),error:null}).then(resolve);
      }};return q;
  }};
}
for(const hostProvider of ['google','microsoft'])for(const guestProvider of ['google','microsoft']) {
  Deno.test(`${hostProvider} organizer → ${guestProvider} guest: create, accept, repeat, change, cancel`,async()=>{
    const d={title:'Test dinner',selectedTime:'2026-12-24T17:00:00.000Z',duration:90,timeZone:'America/Toronto',restaurant:'Test',location:'Toronto',calendarEnabled:true,status:'Unbooked',times:['2026-12-24T17:00:00.000Z']};
    const connections=await Promise.all([['host',hostProvider],['guest',guestProvider]].map(async([role,provider])=>({account:role,provider,subject:role,email:role+'@example.com',refresh_cipher:await cipher(role,provider),status:'connected'})));
    const tables:any={meal_plans:[{id:'meal',owner:'host',details:d}],meal_plan_members:[{meal_id:'meal',account:'guest',response:{attendance:'going',calendarAccept:true,confirmedSchedule:scheduleKey(d)}}],
      meal_calendar_connections:connections,meal_calendar_profiles:[],meal_calendar_events:[],meal_calendar_replies:[]};
    const db=memoryDB(tables);let hostEvent:any=null,guestResponse='needsAction',created=0,accepted=0,deleted=0,guestDelay=3600000,guestMissing=false,guestUnavailable=false,delayDeclineReceipt=false;
    const original=globalThis.fetch;
    globalThis.fetch=(async(input:any,init:any={})=>{
      const url=new URL(String(input)),method=init.method||'GET';
      if(url.pathname.endsWith('/token'))return Response.json({access_token:new URLSearchParams(init.body).get('refresh_token')});
      const role=init.headers.Authorization.split(' ')[1],google=url.hostname==='www.googleapis.com';
      const start=new Date(Date.parse(d.selectedTime)+(role==='guest'?guestDelay:0)).toISOString();
      const end=new Date(Date.parse(start)+d.duration*60000).toISOString();
      const observed=role==='host'&&delayDeclineReceipt?'needsAction':guestResponse;
      const convert=()=>google?{id:role==='host'?hostEvent.id:'incoming',iCalUID:'uid',start:{dateTime:start},end:{dateTime:end},attendees:[{email:'guest@example.com',self:role==='guest',responseStatus:observed}]}:
        {id:role==='host'?hostEvent.id:'incoming',iCalUId:'uid',start:{dateTime:start},end:{dateTime:end},responseStatus:{response:observed==='tentative'?'tentativelyAccepted':observed},attendees:[{emailAddress:{address:'guest@example.com'},status:{response:observed}}]};
      if(role==='host') {
        if(method==='GET')return Response.json(url.searchParams.has('$filter')?{value:hostEvent?[convert()]:[]}:convert());
        if(method==='POST'){
          if(hostEvent&&google)return Response.json({error:'Duplicate'},{status:409});
          created++;hostEvent={...JSON.parse(init.body),id:google?JSON.parse(init.body).id:'outgoing'};
          throw Error('Connection lost after provider created the event');
        }
        if(method==='PATCH'){Object.assign(hostEvent,JSON.parse(init.body));return Response.json(convert());}
        if(method==='DELETE'){deleted++;return new Response(null,{status:204});}
      } else {
        if(guestUnavailable)return Response.json({error:'Temporarily unavailable'},{status:503});
        if(guestMissing)return url.searchParams.has('$filter')?Response.json({value:[]}):url.searchParams.has('iCalUID')?Response.json({items:[]}):Response.json({error:'Not found'},{status:404});
        if(method==='GET')return Response.json(url.searchParams.has('iCalUID')?{items:[convert()]}:url.searchParams.has('$filter')?{value:[convert()]}:convert());
        if(method==='PATCH'){accepted++;guestResponse=JSON.parse(init.body).attendees[0].responseStatus;return Response.json(convert());}
        if(method==='POST'){accepted++;guestResponse=url.pathname.endsWith('/accept')?'accepted':url.pathname.endsWith('/tentativelyAccept')?'tentative':'declined';if(guestResponse==='declined')guestMissing=true;return new Response(null,{status:202});}
      }
      throw Error('Unexpected provider request');
    }) as typeof fetch;
    try {
      await assert.rejects(()=>syncDinner(db,'meal'),/Connection lost/);
      d.title='Edited while the create response was lost';
      assert.equal(await syncDinner(db,'meal'),false);assert.equal(accepted,0,'Do not accept an invitation for the wrong slot');
      assert.equal(tables.meal_calendar_replies[0].status,'pending');
      guestDelay=0;
      assert.equal(await syncDinner(db,'meal'),true);assert.equal(created,1);assert.equal(accepted,1);
      assert.equal(hostProvider==='google'?hostEvent.summary:hostEvent.subject,d.title,'Recovered events must reconcile edits before confirming guests');
      assert.equal(tables.meal_calendar_replies[0].status,'accepted');
      assert.equal(await syncDinner(db,'meal'),true);assert.equal(created,1);assert.equal(accepted,1,'Refresh must not send another acceptance');
      guestDelay=3600000;await syncDinner(db,'meal');assert.equal(tables.meal_calendar_replies[0].status,'changed_in_calendar');assert.equal(accepted,1,'Do not overwrite an externally changed time');guestDelay=0;
      guestUnavailable=true;assert.equal(await syncDinner(db,'meal'),false);assert.equal(tables.meal_calendar_replies[0].status,'pending','An outage is not deletion');guestUnavailable=false;
      guestMissing=true;assert.equal(await syncDinner(db,'meal'),true);assert.equal(tables.meal_calendar_replies[0].status,'changed_in_calendar');assert.equal(accepted,1,'Do not recreate a deleted invitation');guestMissing=false;
      guestResponse='declined';await syncDinner(db,'meal');assert.equal(tables.meal_calendar_replies[0].status,'changed_in_calendar');assert.equal(accepted,1,'Do not override an external RSVP');
      tables.meal_plan_members[0].response={attendance:'maybe',calendarAccept:true,confirmedSchedule:scheduleKey(d)};
      tables.meal_calendar_replies[0].desired_hash=null;
      await syncDinner(db,'meal');assert.equal(tables.meal_calendar_replies[0].status,'tentative');
      if(guestProvider==='microsoft') {
        tables.meal_plan_members[0].response={attendance:'declined',calendarAccept:true,confirmedSchedule:scheduleKey(d)};
        tables.meal_calendar_replies[0].desired_hash=null;delayDeclineReceipt=true;
        assert.equal(await syncDinner(db,'meal'),false);assert.equal(tables.meal_calendar_replies[0].status,'pending','202 plus a removed event does not prove a decline');
        delayDeclineReceipt=false;
        assert.equal(await syncDinner(db,'meal'),true);assert.equal(tables.meal_calendar_replies[0].status,'declined','The organizer must receive the decline');
        const responses=accepted;
        assert.equal(await syncDinner(db,'meal'),true);assert.equal(accepted,responses,'Do not send the same decline twice');
        tables.meal_plan_members[0].response={attendance:'going',calendarAccept:true,confirmedSchedule:scheduleKey(d)};tables.meal_calendar_replies[0].desired_hash=null;
        assert.equal(await syncDinner(db,'meal'),true);assert.equal(tables.meal_calendar_replies[0].status,'restore_in_email');assert.equal(accepted,responses,'Do not fabricate acceptance after Outlook removes the invitation');
        guestMissing=false;guestResponse='accepted';
        assert.equal(await syncDinner(db,'meal'),true);assert.equal(tables.meal_calendar_replies[0].status,'accepted');
      }
      d.selectedTime='2026-12-25T17:00:00.000Z';tables.meal_plan_members[0].response={attendance:'maybe',needsReconfirmation:true};
      await syncDinner(db,'meal');assert.equal(created,1);assert.equal(tables.meal_calendar_replies[0].status,'needs_confirmation');
      (d as any).cancelled=true;await syncDinner(db,'meal');assert.equal(deleted,1);assert.equal(tables.meal_calendar_events[0].status,'cancelled');
      await syncDinner(db,'meal');assert.equal(deleted,1,'Cancellation retries must be harmless');
    }finally{globalThis.fetch=original;}
  });
}
Deno.test('An unavailable calendar is unknown, never falsely conflict-free; outsiders cannot query conflicts',async()=>{
  const db=memoryDB({meal_calendar_connections:[{account:'a',provider:'google',status:'reconnect'}],meal_calendar_events:[],
    meal_plans:[{id:'meal',owner:'a',details:{times:['2026-12-24T17:00:00Z'],duration:90}}],meal_plan_members:[]});
  const result=await checkConflicts(db,'a',{id:'meal',details:{times:['2026-12-24T17:00:00Z'],duration:90}});
  assert.equal(result.status,'incomplete');assert.equal(result.options[0].checked,0);
  await assert.rejects(()=>calendarAction(db,'outsider',{action:'calendar-conflicts',id:'meal'}),/Open the dinner/);
});

Deno.test('A dated plan without a final restaurant cannot create a calendar invitation',async()=>{
  const tables:any={meal_plans:[{id:'undecided-place',owner:'host',details:{calendarEnabled:true,selectedTime:'2026-12-24T17:00:00Z',restaurant:''}}],meal_calendar_events:[]};
  assert.equal(await syncDinner(memoryDB(tables),'undecided-place'),true);
  assert.equal(tables.meal_calendar_events.length,0);
});

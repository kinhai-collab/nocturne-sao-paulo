import {strict as assert} from 'node:assert';
import {conflicts,normalizeGoogle,normalizeMicrosoft,eventPayload,isConfirmed,wallInstant} from '../supabase/functions/_shared/calendar-core.ts';

const dinner={title:'Dinner',selectedTime:'2026-12-24T17:00:00.000Z',timeZone:'America/Toronto',duration:90,status:'Unbooked',restaurant:'Test table',location:'Toronto'};
Deno.test('A time vote never confirms attendance; acceptance is bound to the exact schedule',()=>{
  assert.equal(isConfirmed(dinner,{attendance:'going',times:[dinner.selectedTime]}),false);
  const vote={calendarAccept:true,confirmedSchedule:[dinner.selectedTime,90,dinner.timeZone]};
  assert.equal(isConfirmed(dinner,vote),true);
  assert.equal(isConfirmed({...dinner,duration:120},vote),false);
  assert.equal(isConfirmed({...dinner,selectedTime:'2026-12-25T17:00:00.000Z'},vote),false);
  assert.equal(isConfirmed({...dinner,selectedTime:''},vote),false);
});
Deno.test('Conflicts cover the full dinner, exclude its own invite, and allow adjacent events',()=>{
  const items=[['before','16:00','17:00'],['inside','17:30','18:00'],['after','18:30','19:00'],['own','17:00','18:30']].map(([id,s,e])=>
    ({id,uid:id,title:id,start:'2026-12-24T'+s+':00Z',end:'2026-12-24T'+e+':00Z',busy:true,tentative:false}));
  assert.deepEqual(conflicts(items,dinner.selectedTime,90,'own').map(e=>e.id),['inside']);
});
Deno.test('Google all-day and daylight-saving boundaries use the calendar zone',()=>{
  assert.equal(wallInstant('2026-12-24','America/Toronto'),'2026-12-24T05:00:00.000Z');
  assert.equal(wallInstant('2026-07-24','America/Toronto'),'2026-07-24T04:00:00.000Z');
  const allDay=normalizeGoogle({id:'a',start:{date:'2026-11-01'},end:{date:'2026-11-02'}},'America/Toronto')!;
  assert.equal(Date.parse(allDay.end)-Date.parse(allDay.start),25*3600000);
  assert.equal(conflicts([allDay],'2026-11-02T04:00:00Z',60).length,1);
});
Deno.test('Free, cancelled, declined, and working-location events do not block time',()=>{
  const g={id:'g',start:{dateTime:dinner.selectedTime},end:{dateTime:'2026-12-24T19:00:00Z'}};
  assert.equal(normalizeGoogle({...g,status:'cancelled'},'UTC'),null);
  assert.equal(normalizeGoogle({...g,transparency:'transparent'},'UTC')?.busy,false);
  assert.equal(normalizeGoogle({...g,attendees:[{self:true,responseStatus:'declined'}]},'UTC')?.busy,false);
  assert.equal(normalizeGoogle({...g,eventType:'workingLocation'},'UTC')?.busy,false);
  const m={id:'m',start:{dateTime:'2026-12-24T17:00:00.0000000'},end:{dateTime:'2026-12-24T19:00:00.0000000'},showAs:'busy'};
  assert.equal(normalizeMicrosoft({...m,showAs:'free'})?.busy,false);
  assert.equal(normalizeMicrosoft({...m,responseStatus:{response:'declined'}})?.busy,false);
  assert.equal(normalizeMicrosoft({...m,isCancelled:true}),null);
  assert.equal(normalizeMicrosoft({...m,showAs:'tentative'})?.tentative,true);
  assert.equal(normalizeMicrosoft(m)?.start,dinner.selectedTime);
});
Deno.test('Google and Outlook invitations preserve the same destination instant and deduplicate emails',()=>{
  const g=eventPayload('google','id',dinner,['GUEST@example.com','guest@example.com']) as any;
  const m=eventPayload('microsoft','id',dinner,['GUEST@example.com','guest@example.com']) as any;
  assert.equal(g.start.timeZone,'America/Toronto');assert.equal(g.end.dateTime,'2026-12-24T18:30:00.000Z');
  assert.equal(m.start.timeZone,'UTC');assert.equal(m.start.dateTime+'Z',g.start.dateTime);
  assert.equal(g.attendees.length,1);assert.equal(m.attendees.length,1);
  assert(!g.attendees[0].responseStatus,'Organizer must not forge guest acceptance');
});

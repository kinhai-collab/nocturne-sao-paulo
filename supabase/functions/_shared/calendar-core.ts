export type Provider = 'google' | 'microsoft';
export type CalendarItem = { id: string; uid: string; title: string; start: string; end: string; tentative: boolean; busy: boolean; response?: string };
export const APP = 'https://kinhai-collab.github.io/nocturne-sao-paulo/';
export const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;
export const GOOGLE_SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events';
export const MICROSOFT_SCOPE = 'openid email profile offline_access User.Read Calendars.ReadWrite';
export const scheduleKey = (d: any) => [d.selectedTime, d.duration, d.timeZone];
export const sameSchedule = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
export const isConfirmed = (d: any, vote: any) => Boolean(d.selectedTime && d.restaurant && vote?.calendarAccept && sameSchedule(vote.confirmedSchedule,scheduleKey(d)));
export const eventEnd = (d: any) => new Date(Date.parse(d.selectedTime) + d.duration * 60000).toISOString();
export const overlaps = (start: string, end: string, otherStart: string, otherEnd: string) =>
  Date.parse(start) < Date.parse(otherEnd) && Date.parse(end) > Date.parse(otherStart);
export function conflicts(items: CalendarItem[], start: string, duration: number, ownUid?: string) {
  const end = new Date(Date.parse(start)+duration*60000).toISOString();
  return items.filter(i=>i.busy && (!ownUid || i.uid!==ownUid) && overlaps(start,end,i.start,i.end));
}
// All-day events use the calendar's zone, not the server's or visitor's zone.
export function wallInstant(value: string, zone = 'UTC') {
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value).toISOString();
  const wall=value.length===10?value+'T00:00:00':value.slice(0,19);
  const target=Date.parse(wall+'Z');
  if (!Number.isFinite(target)) throw Error('Invalid calendar time');
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let epoch=target;
  for(let n=0;n<4;n++) {
    const p=Object.fromEntries(fmt.formatToParts(epoch).map(x=>[x.type,x.value]));
    const asUTC=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    const next=epoch+target-asUTC;if(next===epoch)break;epoch=next;
  }
  return new Date(epoch).toISOString();
}
export function normalizeGoogle(e: any, zone: string): CalendarItem | null {
  if(!e.start || !e.end || e.status==='cancelled')return null;
  const self=e.attendees?.find((a:any)=>a.self);
  return {id:e.id,uid:e.iCalUID||'',title:String(e.summary||'Busy').slice(0,200),
    start:wallInstant(e.start.dateTime||e.start.date,e.start.timeZone||zone),
    end:wallInstant(e.end.dateTime||e.end.date,e.end.timeZone||zone),
    response:self?.responseStatus,tentative:self?.responseStatus==='tentative'||e.status==='tentative',
    busy:e.transparency!=='transparent'&&self?.responseStatus!=='declined'&&e.eventType!=='workingLocation'};
}
export function normalizeMicrosoft(e: any): CalendarItem | null {
  if(e.isCancelled||!e.start||!e.end)return null;
  // Every Graph request uses Prefer: outlook.timezone="UTC".
  return {id:e.id,uid:e.iCalUId||'',title:String(e.subject||'Busy').slice(0,200),
    start:wallInstant(e.start.dateTime,'UTC'),end:wallInstant(e.end.dateTime,'UTC'),
    response:e.responseStatus?.response,tentative:e.showAs==='tentative',
    busy:!['free','workingElsewhere'].includes(e.showAs)&&e.responseStatus?.response!=='declined'};
}
export function eventPayload(provider: Provider, id: string, d: any, emails: string[]) {
  const description=`Planned in Enkai. Destination time zone: ${d.timeZone}. Restaurant reservation: ${d.status}.\n${APP}planner.html#meal=${id}`;
  const location=[d.restaurant||'Restaurant to be decided',d.location].filter(Boolean).join(', ');
  const attendees=[...new Set(emails.map(e=>e.toLowerCase()))].sort();
  return provider==='google' ? {summary:d.title,description,location,
    start:{dateTime:d.selectedTime,timeZone:d.timeZone},end:{dateTime:eventEnd(d),timeZone:d.timeZone},
    attendees:attendees.map(email=>({email})),guestsCanModify:false,guestsCanInviteOthers:false,
    extendedProperties:{private:{enkaiMeal:id}}} : {
    subject:d.title,body:{contentType:'text',content:description},location:{displayName:location},
    start:{dateTime:d.selectedTime.replace('Z',''),timeZone:'UTC'},end:{dateTime:eventEnd(d).replace('Z',''),timeZone:'UTC'},
    attendees:attendees.map(address=>({emailAddress:{address},type:'required'})),allowNewTimeProposals:false,
    singleValueExtendedProperties:[{id:'String {d944b9ef-1f61-4c05-a4ed-32de2129cbe4} Name EnkaiMeal',value:id}]
  };
}

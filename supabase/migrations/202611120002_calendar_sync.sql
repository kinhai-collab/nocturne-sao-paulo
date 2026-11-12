-- Provider credentials are never exposed to browser roles. Calendar event details
-- used for conflict checks are fetched on demand and are not stored here.
create table public.meal_calendar_profiles (
  account text primary key,
  email text,
  preferred_provider text check (preferred_provider in ('google','microsoft'))
);
create table public.meal_calendar_connections (
  account text not null,
  provider text not null check (provider in ('google','microsoft')),
  subject text not null,
  email text not null,
  refresh_cipher text not null,
  scopes text not null,
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  primary key (account,provider),
  unique (provider,subject)
);
create table public.meal_calendar_oauth_states (
  state_hash text primary key,
  account text not null,
  provider text not null,
  verifier_cipher text not null,
  nonce text not null,
  theme text not null,
  meal_id uuid,
  expires_at timestamptz not null
);
create table public.meal_calendar_events (
  meal_id uuid primary key references public.meal_plans(id) on delete cascade,
  event_key uuid not null default gen_random_uuid(),
  account text not null,
  provider text not null,
  email text not null,
  event_id text,
  ical_uid text,
  payload_hash text,
  schedule jsonb,
  status text not null default 'pending',
  updated_at timestamptz not null default now()
);
create table public.meal_calendar_replies (
  meal_id uuid references public.meal_plans(id) on delete cascade,
  account text not null,
  provider text not null,
  event_id text,
  desired_hash text,
  status text not null default 'pending',
  updated_at timestamptz not null default now(),
  primary key (meal_id,account)
);
create table public.meal_calendar_jobs (
  meal_id uuid primary key references public.meal_plans(id) on delete cascade,
  generation bigint not null default 1,
  lease uuid,
  leased_until timestamptz,
  attempts integer not null default 0,
  run_after timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['meal_calendar_profiles','meal_calendar_connections','meal_calendar_oauth_states','meal_calendar_events','meal_calendar_replies','meal_calendar_jobs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

create function public.meal_calendar_enqueue(target uuid) returns void language sql set search_path='' as $$
  insert into public.meal_calendar_jobs(meal_id) select id from public.meal_plans where id=target
  on conflict(meal_id) do update set generation=public.meal_calendar_jobs.generation+1,run_after=now(),attempts=0;
$$;
create function public.meal_calendar_claim(target uuid default null) returns setof public.meal_calendar_jobs
language sql set search_path='' as $$
  update public.meal_calendar_jobs j set lease=gen_random_uuid(),leased_until=now()+interval '4 minutes'
  where j.meal_id in (select meal_id from public.meal_calendar_jobs
    where (target is null or meal_id=target) and run_after<=now()
      and (leased_until is null or leased_until<now())
    order by run_after limit 1 for update skip locked) returning j.*;
$$;
create function public.meal_calendar_finish(target uuid, claim uuid, claimed_generation bigint, success boolean)
returns void language plpgsql set search_path='' as $$
begin
  if success then
    delete from public.meal_calendar_jobs where meal_id=target and lease=claim and generation=claimed_generation;
  end if;
  update public.meal_calendar_jobs set lease=null,leased_until=null,
    attempts=case when generation=claimed_generation then attempts+1 else 0 end,
    run_after=case when generation<>claimed_generation then now()
      else now()+least(interval '30 minutes',interval '20 seconds'*power(2,least(attempts,6))) end
    where meal_id=target and lease=claim;
end $$;

alter function public.meal_planner_action(text,text,text,jsonb) rename to meal_planner_before_calendar;
create function public.meal_planner_action(actor text, actor_name text, operation text, payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; p public.meal_plans; schedule jsonb;
begin
  if operation='list' then
    result:=public.meal_planner_before_calendar(actor,actor_name,operation,payload);
    return coalesce((select jsonb_agg(m || jsonb_build_object(
      'calendarSync',coalesce((select jsonb_build_object('status',e.status,'updatedAt',e.updated_at)
         from public.meal_calendar_events e where e.meal_id=(m->>'id')::uuid),'{}'::jsonb),
      'myCalendar',coalesce((select jsonb_build_object('status',r.status,'updatedAt',r.updated_at)
         from public.meal_calendar_replies r where r.meal_id=(m->>'id')::uuid and r.account=actor),'{}'::jsonb)
      ) order by n) from jsonb_array_elements(result) with ordinality a(m,n)),'[]'::jsonb);
  end if;
  -- Keep plan and confirmation updates in the same transaction and row lock.
  if operation in ('respond','rsvp','manage') then
    select * into p from public.meal_plans where id=(payload->>'id')::uuid for update;
    if p.details->>'cancelled'='true' then return jsonb_build_object('error','This dinner was cancelled.'); end if;
  end if;
  result:=public.meal_planner_before_calendar(actor,actor_name,operation,payload);
  if result ? 'error' then return result; end if;
  if operation in ('respond','rsvp') then
    schedule:=jsonb_build_array(p.details->>'selectedTime',p.details->'duration',p.details->>'timeZone');
    update public.meal_plan_members set response=response || jsonb_build_object(
      'confirmedSchedule',case when coalesce(p.details->>'selectedTime','')<>'' then schedule else null end,
      'calendarAccept',coalesce((payload->>'calendarAccept')::boolean,false)
    ) where meal_id=p.id and account=actor;
  end if;
  if operation='manage' and jsonb_build_array(p.details->>'selectedTime',p.details->'duration',p.details->>'timeZone')
    is distinct from jsonb_build_array(payload->'details'->>'selectedTime',payload->'details'->'duration',payload->'details'->>'timeZone') then
    update public.meal_plan_members set response=(response-'confirmedSchedule'-'calendarAccept') ||
      jsonb_build_object('attendance',case when response->>'attendance'='declined' then 'declined' else 'maybe' end,
      'needsReconfirmation',true) where meal_id=p.id and response is not null;
    update public.meal_calendar_replies set status='needs_confirmation',desired_hash=null where meal_id=p.id;
  elsif operation in ('respond','rsvp') then
    update public.meal_plan_members set response=response-'needsReconfirmation' where meal_id=p.id and account=actor;
    update public.meal_calendar_replies set desired_hash=null,status='pending' where meal_id=p.id and account=actor;
  end if;
  if operation in ('create','manage','join','respond','rsvp') then
    perform public.meal_calendar_enqueue((result->>'id')::uuid);
  end if;
  return result;
end $$;

-- Existing Google/Microsoft linking continues to merge the same account records.
create function public.meal_calendar_link_records() returns trigger language plpgsql set search_path='' as $$
declare old_actor text:='microsoft:'||new.microsoft_sub;
begin
  insert into public.meal_calendar_profiles(account,email,preferred_provider)
    select new.google_sub,email,preferred_provider from public.meal_calendar_profiles where account=old_actor
    on conflict(account) do nothing;
  delete from public.meal_calendar_profiles where account=old_actor;
  -- Prefer an already-connected destination provider if both accounts connected it.
  delete from public.meal_calendar_connections a where a.account=old_actor and exists
    (select 1 from public.meal_calendar_connections b where b.account=new.google_sub and b.provider=a.provider);
  update public.meal_calendar_connections set account=new.google_sub where account=old_actor;
  update public.meal_calendar_events set account=new.google_sub where account=old_actor;
  delete from public.meal_calendar_replies a where a.account=old_actor and exists
    (select 1 from public.meal_calendar_replies b where b.account=new.google_sub and b.meal_id=a.meal_id);
  update public.meal_calendar_replies set account=new.google_sub where account=old_actor;
  update public.meal_calendar_oauth_states set account=new.google_sub where account=old_actor;
  return new;
end $$;
create trigger meal_calendar_link after insert on public.meal_microsoft_links for each row execute function public.meal_calendar_link_records();

revoke all on function public.meal_calendar_enqueue(uuid),public.meal_calendar_claim(uuid),
  public.meal_calendar_finish(uuid,uuid,bigint,boolean),public.meal_calendar_link_records(),
  public.meal_planner_action(text,text,text,jsonb),public.meal_planner_before_calendar(text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.meal_calendar_enqueue(uuid),public.meal_calendar_claim(uuid),
  public.meal_calendar_finish(uuid,uuid,bigint,boolean),public.meal_planner_action(text,text,text,jsonb),
  public.meal_planner_before_calendar(text,text,text,jsonb) to service_role;

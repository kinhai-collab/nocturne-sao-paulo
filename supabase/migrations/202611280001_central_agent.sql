-- Interim central scheduling. Written for review; no per-person computed answers persist.
create table public.meal_agent_results (
  meal_id uuid primary key references public.meal_plans(id) on delete cascade,
  status text check (status in ('works','none')),
  proposed_time timestamptz,
  options_hash text,
  computed_at timestamptz,
  input_rev bigint not null default 0,
  runs_on date,
  runs_count int not null default 0,
  check (status is not distinct from 'works' or proposed_time is null)
);
alter table public.meal_agent_results enable row level security;
revoke all on public.meal_agent_results from public,anon,authenticated;
grant all on public.meal_agent_results to service_role;

create function public.meal_scheduling_ended(details jsonb, at_time timestamptz default now())
returns boolean language sql stable set search_path='' as $$
  select coalesce(details->>'cancelled','false')='true' or
    (coalesce(details->>'selectedTime','')<>'' and coalesce(details->>'restaurant','')<>''
      and (details->>'selectedTime')::timestamptz + make_interval(mins=>(details->>'duration')::int)<=at_time)
$$;
-- Match JSON.stringify's fixed CandidatePlan key order, without jsonb whitespace/key reordering.
create function public.meal_agent_options_hash(details jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to('['||coalesce(string_agg(
    '{"start":'||to_json(t)::text||',"durationMinutes":'||(details->>'duration')||',"timeZone":'||to_json(details->>'timeZone')::text||'}',
    ',' order by n),'')||']','UTF8')),'hex')
  from jsonb_array_elements_text(details->'times') with ordinality options(t,n)
$$;
create function public.meal_agent_invalidate(target uuid) returns void
language plpgsql set search_path='' as $$
declare d jsonb;
begin
  -- All input writers and begin/save serialize on the dinner before its result.
  select details into d from public.meal_plans where id=target for update;
  if not found then return; end if;
  if d->>'cancelled'='true' or (public.meal_scheduling_ended(d) and
    (d->>'selectedTime')::timestamptz+make_interval(mins=>(d->>'duration')::int)+interval '30 days'<=now()) then
    delete from public.meal_agent_results where meal_id=target;
    return;
  end if;
  insert into public.meal_agent_results as r(meal_id,input_rev) values(target,1)
    on conflict(meal_id) do update set input_rev=r.input_rev+1,status=null,proposed_time=null,computed_at=null;
end $$;
create function public.meal_agent_plan_changed() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.owner is distinct from old.owner or
    (new.details->'times',new.details->'duration',new.details->'timeZone',new.details->'cancelled',new.details->'selectedTime',new.details->'restaurant')
    is distinct from (old.details->'times',old.details->'duration',old.details->'timeZone',old.details->'cancelled',old.details->'selectedTime',old.details->'restaurant') then
    perform public.meal_agent_invalidate(new.id);
  end if;
  return new;
end $$;
create trigger meal_agent_plan_changed after update on public.meal_plans for each row execute function public.meal_agent_plan_changed();
create function public.meal_agent_member_changed() returns trigger
language plpgsql set search_path='' as $$
declare target uuid; d jsonb;
begin
  if tg_op='DELETE' then target:=old.meal_id; else target:=new.meal_id; end if;
  select details into d from public.meal_plans where id=target for update;
  -- Defense in depth for every legacy ballot writer, including RSVP defaults.
  if tg_op<>'DELETE' and public.meal_scheduling_ended(d) then new.response:=new.response-'times'; end if;
  if tg_op='UPDATE' then
    if (old.meal_id,old.account,old.response) is not distinct from (new.meal_id,new.account,new.response) then return new; end if;
    if old.meal_id<>new.meal_id then perform public.meal_agent_invalidate(old.meal_id); end if;
  end if;
  perform public.meal_agent_invalidate(target);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger meal_agent_member_changed before insert or update or delete on public.meal_plan_members for each row execute function public.meal_agent_member_changed();
create function public.meal_agent_connection_changed() returns trigger
language plpgsql set search_path='' as $$
declare accounts text[]; target uuid;
begin
  if tg_op='UPDATE' then
    -- Token rotation does not change scheduling inputs; reconnect/identity changes do.
    if (to_jsonb(old)-'refresh_cipher') is not distinct from (to_jsonb(new)-'refresh_cipher') then return new; end if;
    accounts:=array[old.account,new.account];
  elsif tg_op='DELETE' then accounts:=array[old.account]; else accounts:=array[new.account]; end if;
  for target in select p.id from public.meal_plans p where p.owner=any(accounts)
    or exists(select 1 from public.meal_plan_members m where m.meal_id=p.id and m.account=any(accounts)) order by p.id loop
    perform public.meal_agent_invalidate(target);
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger meal_agent_connection_changed before insert or update or delete on public.meal_calendar_connections for each row execute function public.meal_agent_connection_changed();

create function public.meal_agent_begin(meal uuid, actor text) returns jsonb
language plpgsql set search_path='' as $$
declare p public.meal_plans; r public.meal_agent_results; today date; participants jsonb;
begin
  select * into p from public.meal_plans where id=meal for update;
  if not found or p.owner<>actor then return jsonb_build_object('error','forbidden'); end if;
  if public.meal_scheduling_ended(p.details) then return jsonb_build_object('error','unavailable'); end if;
  select jsonb_agg(jsonb_build_object('memberRef',account,'times',coalesce(response->'times','[]'::jsonb)) order by account)
    into participants from (
      select distinct on (account) account,response from (
        select p.owner account, m.response,0 priority from (select 1) seed
          left join public.meal_plan_members m on m.meal_id=meal and m.account=p.owner
        union all
        select coalesce(l.google_sub,m.account),m.response,case when l.google_sub is null then 1 else 2 end
          from public.meal_plan_members m left join public.meal_microsoft_links l on 'microsoft:'||l.microsoft_sub=m.account
          where m.meal_id=meal
      ) roster order by account,priority
    ) roster;
  -- Waiting is not a run. Use the same canonical roster as the matcher.
  if jsonb_array_length(participants)<3 then return jsonb_build_object('status','waiting'); end if;
  today:=(clock_timestamp() at time zone 'UTC')::date;
  insert into public.meal_agent_results(meal_id) values(meal) on conflict do nothing;
  update public.meal_agent_results set runs_on=today,
    runs_count=case when runs_on=today then runs_count+1 else 1 end
    where meal_id=meal and (runs_on is distinct from today or runs_count<6) returning * into r;
  if not found then return jsonb_build_object('error','agent_limit'); end if;
  return jsonb_build_object('input_rev',r.input_rev,'times',p.details->'times','duration',p.details->'duration',
    'timeZone',p.details->'timeZone','owner',p.owner,'participants',participants);
end $$;
create function public.meal_agent_save(meal uuid, actor text, rev bigint, status text, proposed_time timestamptz, options_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare p public.meal_plans; r public.meal_agent_results;
begin
  select * into p from public.meal_plans where id=meal for update;
  if not found or p.owner<>actor then return jsonb_build_object('error','forbidden'); end if;
  select * into r from public.meal_agent_results where meal_id=meal for update;
  if not found or r.input_rev<>rev or public.meal_scheduling_ended(p.details) then return jsonb_build_object('error','stale'); end if;
  if status is null or status not in ('works','none') or options_hash is distinct from public.meal_agent_options_hash(p.details)
    or (status='works' and (proposed_time is null or not exists(select 1 from jsonb_array_elements_text(p.details->'times') t where t::timestamptz=proposed_time)))
    or (status='none' and proposed_time is not null) then return jsonb_build_object('error','invalid_result'); end if;
  update public.meal_agent_results set status=meal_agent_save.status,proposed_time=meal_agent_save.proposed_time,
    options_hash=meal_agent_save.options_hash,computed_at=clock_timestamp() where meal_id=meal returning * into r;
  return jsonb_build_object('agentResult',jsonb_build_object('status',r.status,'computedAt',r.computed_at,'optionsVersion',r.options_hash)
    ||case when r.status='works' then jsonb_build_object('proposedTime',to_char(r.proposed_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) else '{}'::jsonb end);
end $$;

-- Strip historical nested ballot copies while keeping restaurant votes/attendance.
-- The root details.times proposal list is public plan data, not a ballot.
create function public.meal_agent_strip_times(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(value)='object' then
    return coalesce((select jsonb_object_agg(key,public.meal_agent_strip_times(v)) from jsonb_each(value) e(key,v) where key<>'times'),'{}'::jsonb);
  elsif jsonb_typeof(value)='array' then
    return coalesce((select jsonb_agg(public.meal_agent_strip_times(v) order by n) from jsonb_array_elements(value) with ordinality e(v,n)),'[]'::jsonb);
  end if;
  return value;
end $$;
create function public.purge_meal_scheduling_data(at_time timestamptz default now(), target uuid default null) returns void
language plpgsql set search_path='' as $$
declare p public.meal_plans;
begin
  for p in select * from public.meal_plans where (target is null or id=target)
    and public.meal_scheduling_ended(details,at_time) order by id for update skip locked loop
    update public.meal_plan_members set response=response-'times' where meal_id=p.id and response ? 'times';
    -- Historical owner-response copies are not authoritative inputs. Strip them too.
    update public.meal_plans set details=public.meal_agent_strip_times(details-'times'-'timeTallies')
      ||case when details ? 'times' then jsonb_build_object('times',details->'times') else '{}'::jsonb end
      where id=p.id and details is distinct from (public.meal_agent_strip_times(details-'times'-'timeTallies')
        ||case when details ? 'times' then jsonb_build_object('times',details->'times') else '{}'::jsonb end);
    if p.details->>'cancelled'='true' or
      (p.details->>'selectedTime')::timestamptz+make_interval(mins=>(p.details->>'duration')::int)+interval '30 days'<=at_time then
      delete from public.meal_agent_results where meal_id=p.id;
    end if;
  end loop;
end $$;

-- No public/browser entry points, including helpers and trigger functions.
revoke all on function public.meal_scheduling_ended(jsonb,timestamptz),public.meal_agent_options_hash(jsonb),public.meal_agent_strip_times(jsonb),
  public.meal_agent_invalidate(uuid),public.meal_agent_plan_changed(),public.meal_agent_member_changed(),public.meal_agent_connection_changed(),
  public.meal_agent_begin(uuid,text),public.meal_agent_save(uuid,text,bigint,text,timestamptz,text),public.purge_meal_scheduling_data(timestamptz,uuid)
  from public,anon,authenticated;
grant execute on function public.meal_scheduling_ended(jsonb,timestamptz),public.meal_agent_options_hash(jsonb),public.meal_agent_strip_times(jsonb),
  public.meal_agent_invalidate(uuid),public.meal_agent_plan_changed(),public.meal_agent_member_changed(),public.meal_agent_connection_changed(),
  public.meal_agent_begin(uuid,text),public.meal_agent_save(uuid,text,bigint,text,timestamptz,text),public.purge_meal_scheduling_data(timestamptz,uuid)
  to service_role;

-- Retain the 202611270001 projection and mutation chain; add only agent/lifecycle boundaries.
create or replace function public.meal_planner_action(actor text, actor_name text, operation text, payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; p public.meal_plans; schedule jsonb;
begin
  if operation='list' then
    -- Build the public read model directly. Never merge arbitrary details or
    -- the legacy wrappers' named responses into a browser result.
    -- Microsoft list calls delegate here after resolving the linked identity.
    return coalesce((select jsonb_agg(
      coalesce((select jsonb_object_agg(key,value) from jsonb_each(plan_row.details)
        where key in ('title','location','duration','timeZone','times','restaurants',
          'selectedTime','restaurant','status','hostName','calendarEnabled','cancelled')), '{}'::jsonb)
      || jsonb_build_object(
        'id',plan_row.id,'version',plan_row.version,'organizer',plan_row.owner=actor,
        'invite',case when plan_row.owner=actor then plan_row.invite end,
        'guests',case when plan_row.owner=actor then coalesce(plan_row.details->'guests','[]'::jsonb) else '[]'::jsonb end,
        'attending',case when plan_row.owner=actor then coalesce(plan_row.details->'attending','[]'::jsonb) else '[]'::jsonb end,
        'venues',coalesce((select jsonb_agg(jsonb_build_object('name',v->>'name','placeId',v->>'placeId'))
          from jsonb_array_elements(coalesce(plan_row.details->'venues','[]'::jsonb)) v),'[]'::jsonb),
        'myVote',case when public.meal_scheduling_ended(plan_row.details) then m.response-'times' else m.response end,
        -- Cached old clients read responses.length and joinedCount. Keep these
        -- compatibility fields empty/zero for every caller; never disclose peers.
        'responses','[]'::jsonb,'joinedCount',0,
        'hasOtherResponses',plan_row.owner=actor and exists(select 1 from public.meal_plan_members v
          where v.meal_id=plan_row.id and v.account<>actor and v.account<>plan_row.owner and v.response is not null),
        'restaurantTallies',case when plan_row.owner=actor and coalesce(plan_row.details->>'restaurant','')='' and coalesce(plan_row.details->>'cancelled','false')<>'true'
          then coalesce((select jsonb_agg(jsonb_build_object('value',option,'count',(
            select count(*) from public.meal_plan_members v where v.meal_id=plan_row.id
              and v.response->'restaurants' @> jsonb_build_array(option))) order by n)
            from jsonb_array_elements_text(plan_row.details->'restaurants') with ordinality options(option,n)), '[]'::jsonb)
          else '[]'::jsonb end,
        -- An explicit going RSVP consents to affirmative attendance disclosure.
        -- Never publish tentative/negative replies or reconfirmation history.
        'attendanceResponses',coalesce((select jsonb_agg(jsonb_build_object('name',v.display_name,'attendance','going')
          order by v.display_name,v.account) from public.meal_plan_members v
          where v.meal_id=plan_row.id and v.account<>plan_row.owner and v.response->>'attendance'='going'
            and coalesce((v.response->>'needsReconfirmation')::boolean,false)=false
            and coalesce(plan_row.details->>'selectedTime','')<>'' and coalesce(plan_row.details->>'restaurant','')<>''),'[]'::jsonb),
        'suggested',exists(select 1 from public.meal_restaurant_suggestions s where s.meal_id=plan_row.id
          and (s.account=actor or s.account in (select 'microsoft:'||l.microsoft_sub
            from public.meal_microsoft_links l where l.google_sub=actor))),
        'calendarSync',coalesce((select jsonb_build_object('status',e.status,'updatedAt',e.updated_at)
          from public.meal_calendar_events e where e.meal_id=plan_row.id),'{}'::jsonb),
        'myCalendar',coalesce((select jsonb_build_object('status',r.status,'updatedAt',r.updated_at)
          from public.meal_calendar_replies r where r.meal_id=plan_row.id and r.account=actor),'{}'::jsonb)
      ) || case when plan_row.owner=actor and not public.meal_scheduling_ended(plan_row.details)
        then coalesce((select jsonb_build_object('agentResult',jsonb_build_object(
          'status',ar.status,'computedAt',ar.computed_at,'optionsVersion',ar.options_hash)
          ||case when ar.status='works' then jsonb_build_object('proposedTime',to_char(ar.proposed_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) else '{}'::jsonb end)
          -- Every input_rev bump atomically clears status, so a nonnull status
          -- is bound to the current revision; the ordered-plan hash is checked too.
          from public.meal_agent_results ar where ar.meal_id=plan_row.id and ar.status is not null
            and ar.options_hash=public.meal_agent_options_hash(plan_row.details)), '{}'::jsonb)
        else '{}'::jsonb end order by plan_row.created_at desc)
      from public.meal_plans plan_row left join public.meal_plan_members m on m.meal_id=plan_row.id and m.account=actor
      where plan_row.owner=actor or m.account is not null),'[]'::jsonb);
  end if;
  -- Keep plan and confirmation updates in the same transaction and row lock.
  if operation in ('respond','rsvp','manage','vote','suggest') then
    select * into p from public.meal_plans where id=(payload->>'id')::uuid for update;
    if p.details->>'cancelled'='true' then return jsonb_build_object('error','This dinner was cancelled.'); end if;
  end if;
  if operation in ('respond','rsvp') and (coalesce(p.details->>'selectedTime','')='' or coalesce(p.details->>'restaurant','')='') then
    if operation='rsvp' then return jsonb_build_object('error','Save availability now; RSVP when the date and restaurant are final.'); end if;
    payload:=(payload-'attendance')||jsonb_build_object('calendarAccept',false);
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
  if operation='manage' and (p.details->>'restaurant' is distinct from payload->'details'->>'restaurant' or jsonb_build_array(p.details->>'selectedTime',p.details->'duration',p.details->>'timeZone')
    is distinct from jsonb_build_array(payload->'details'->>'selectedTime',payload->'details'->'duration',payload->'details'->>'timeZone')) then
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
  if operation='manage' then perform public.purge_meal_scheduling_data(now(),p.id); end if;
  return result;
end $$;

revoke all on function public.meal_planner_action(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.meal_planner_action(text,text,text,jsonb) to service_role;

-- Deployment/startup overdue sweep, and an hourly job only where pg_cron exists.
select public.purge_meal_scheduling_data();
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('meal-scheduling-purge','0 * * * *','select public.purge_meal_scheduling_data()');
  else
    raise notice 'pg_cron is missing; the hourly meal scheduling purge must be scheduled.';
  end if;
end $$;

-- Availability is independent of final attendance. Existing votes are preserved.
create or replace function public.meal_planner_before_calendar(actor text, actor_name text, operation text, payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  plan public.meal_plans;
  response jsonb;
  result jsonb;
begin
  if operation = 'suggest' then
    result := public.meal_planner_rsvp_action(actor,actor_name,operation,payload);
    if not (result ? 'error') and payload ? 'placeId' then
      update public.meal_plans set details=jsonb_set(details,'{venues}',
        coalesce(details->'venues','[]'::jsonb)||jsonb_build_array(jsonb_build_object('name',payload->>'restaurant','placeId',payload->>'placeId')))
        where id=(result->>'id')::uuid;
    end if;
    return result;
  end if;
  if operation <> 'respond' then
    return public.meal_planner_rsvp_action(actor, actor_name, operation, payload);
  end if;
  select * into plan from public.meal_plans where id = (payload->>'id')::uuid for update;
  if not found or (plan.owner <> actor and not exists (
    select 1 from public.meal_plan_members where meal_id = plan.id and account = actor
  )) then return jsonb_build_object('error', 'Open the invitation to join this dinner first.'); end if;
  if payload ? 'version' and (payload->>'version')::integer <> plan.version then
    return jsonb_build_object('error', 'The plan has changed. Refresh the dinner before saving your response.');
  end if;
  if plan.owner <> actor and coalesce(plan.details->>'selectedTime','')<>'' and coalesce(plan.details->>'restaurant','')<>'' and coalesce(payload->>'attendance','') not in ('going','maybe','declined') then
    return jsonb_build_object('error', 'Choose Going, Maybe, or Can’t make it.');
  end if;
  if payload ? 'attendance' and payload->>'attendance' not in ('going','maybe','declined') then
    return jsonb_build_object('error', 'Choose a valid RSVP.');
  end if;
  if jsonb_typeof(payload->'vote'->'times') is distinct from 'array'
    or jsonb_typeof(payload->'vote'->'restaurants') is distinct from 'array'
    or not ((plan.details->'times') @> (payload->'vote'->'times'))
    or not ((plan.details->'restaurants') @> (payload->'vote'->'restaurants')) then
    return jsonb_build_object('error', 'One of those options is unavailable. Refresh the dinner.');
  end if;
  select coalesce(m.response,'{"times":[],"restaurants":[]}'::jsonb) into response
    from public.meal_plan_members m where m.meal_id = plan.id and m.account = actor;
  response := coalesce(response,'{"times":[],"restaurants":[]}'::jsonb);
  if coalesce(plan.details->>'selectedTime','') = '' then
    response := response || jsonb_build_object('times',payload->'vote'->'times');
  end if;
  if coalesce(plan.details->>'restaurant','') = '' then
    response := response || jsonb_build_object('restaurants',payload->'vote'->'restaurants');
  end if;
  if coalesce(plan.details->>'selectedTime','')='' or coalesce(plan.details->>'restaurant','')='' then
    response := response-'attendance'-'calendarAccept'-'confirmedSchedule';
  end if;
  if payload ? 'attendance' and coalesce(plan.details->>'selectedTime','')<>'' and coalesce(plan.details->>'restaurant','')<>'' then response := response || jsonb_build_object('attendance',payload->>'attendance'); end if;
  insert into public.meal_plan_members as member(meal_id,account,display_name,response)
    values(plan.id,actor,actor_name,response)
    on conflict(meal_id,account) do update set display_name=excluded.display_name,response=excluded.response;
  return jsonb_build_object('id',plan.id);
end;
$$;

create or replace function public.meal_planner_action(actor text, actor_name text, operation text, payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; p public.meal_plans; schedule jsonb;
begin
  if operation='list' then
  result:=public.meal_planner_before_calendar(actor,actor_name,operation,payload);
    return coalesce((select jsonb_agg(m || jsonb_build_object(
      'attendanceResponses',coalesce((select jsonb_agg(jsonb_build_object('name',v.display_name,'attendance',v.response->>'attendance')) from public.meal_plan_members v join public.meal_plans plan on plan.id=v.meal_id where v.meal_id=(m->>'id')::uuid and v.account<>plan.owner and v.response->>'attendance' in ('going','maybe','declined') and coalesce((v.response->>'needsReconfirmation')::boolean,false)=false and coalesce(plan.details->>'selectedTime','')<>'' and coalesce(plan.details->>'restaurant','')<>''),'[]'::jsonb),
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
  return result;
end $$;


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
  return result;
end $$;


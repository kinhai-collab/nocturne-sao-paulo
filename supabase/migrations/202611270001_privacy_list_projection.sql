-- Phase 1 read-side closure; mutation guards and calendar behavior stay unchanged.
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
        'myVote',m.response,
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
      ) order by plan_row.created_at desc)
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
  return result;
end $$;

revoke all on function public.meal_planner_action(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.meal_planner_action(text,text,text,jsonb) to service_role;

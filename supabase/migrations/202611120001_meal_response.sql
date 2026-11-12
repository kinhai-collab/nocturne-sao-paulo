-- RSVP and poll choices are one atomic response, for either identity provider.
alter function public.meal_planner_action(text,text,text,jsonb) rename to meal_planner_rsvp_action;

create function public.meal_planner_action(actor text, actor_name text, operation text, payload jsonb)
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
  if plan.owner <> actor and coalesce(payload->>'attendance','') not in ('going','maybe','declined') then
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
  if payload ? 'attendance' then response := response || jsonb_build_object('attendance',payload->>'attendance'); end if;
  insert into public.meal_plan_members as member(meal_id,account,display_name,response)
    values(plan.id,actor,actor_name,response)
    on conflict(meal_id,account) do update set display_name=excluded.display_name,response=excluded.response;
  return jsonb_build_object('id',plan.id);
end;
$$;
revoke all on function public.meal_planner_action(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.meal_planner_action(text,text,text,jsonb) to service_role;

-- Photos have their own conservative cap; the existing 900-search cap is unchanged.
create table public.meal_photo_monthly_usage (
  month_start date primary key,
  requests integer not null check(requests between 1 and 900)
);
alter table public.meal_photo_monthly_usage enable row level security;
revoke all on public.meal_photo_monthly_usage from public, anon, authenticated;
grant select,insert,update on public.meal_photo_monthly_usage to service_role;
create function public.meal_reserve_photo() returns boolean language sql set search_path='' as $$
  with reserved as (
    insert into public.meal_photo_monthly_usage as usage(month_start,requests)
    values(date_trunc('month',now() at time zone 'UTC')::date,1)
    on conflict(month_start) do update set requests=usage.requests+1 where usage.requests<900 returning requests
  ) select exists(select 1 from reserved);
$$;
revoke all on function public.meal_reserve_photo() from public,anon,authenticated;
grant execute on function public.meal_reserve_photo() to service_role;

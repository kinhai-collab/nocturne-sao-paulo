create table public.meal_restaurant_suggestions (
  meal_id uuid references public.meal_plans(id) on delete cascade,
  account text not null,
  primary key(meal_id, account)
);
alter table public.meal_restaurant_suggestions enable row level security;
revoke all on public.meal_restaurant_suggestions from public, anon, authenticated;
grant select, insert on public.meal_restaurant_suggestions to service_role;

alter function public.meal_planner_action(text,text,text,jsonb) rename to meal_planner_base_action;
create function public.meal_planner_action(actor text, actor_name text, operation text, payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  plan public.meal_plans;
  restaurant text := trim(payload->>'restaurant');
  meals jsonb;
begin
  if operation = 'list' then
    meals := public.meal_planner_base_action(actor, actor_name, operation, payload);
    return coalesce((select jsonb_agg(m || jsonb_build_object('suggested', exists (
      select 1 from public.meal_restaurant_suggestions s
      where s.meal_id = (m->>'id')::uuid and (s.account = actor or s.account in (
        select 'microsoft:' || l.microsoft_sub from public.meal_microsoft_links l where l.google_sub = actor
      ))
    )) order by idx) from jsonb_array_elements(meals) with ordinality as entries(m,idx)), '[]'::jsonb);
  end if;
  if operation <> 'suggest' then
    return public.meal_planner_base_action(actor, actor_name, operation, payload);
  end if;
  select * into plan from public.meal_plans where id = (payload->>'id')::uuid for update;
  if not found or plan.owner = actor or not exists (
    select 1 from public.meal_plan_members where meal_id = plan.id and account = actor
  ) then return jsonb_build_object('error','Join the meal as a guest to suggest a restaurant.'); end if;
  if coalesce(plan.details->>'restaurant','') <> '' or jsonb_array_length(plan.details->'restaurants') = 0 then
    return jsonb_build_object('error','Restaurant voting is not open.');
  end if;
  if exists (
    select 1 from public.meal_restaurant_suggestions s where s.meal_id = plan.id and (s.account = actor or s.account in (
      select 'microsoft:' || l.microsoft_sub from public.meal_microsoft_links l where l.google_sub = actor
    ))
  ) then return jsonb_build_object('error','You already added a restaurant to this poll.'); end if;
  if exists (select 1 from jsonb_array_elements_text(plan.details->'restaurants') item where lower(trim(item)) = lower(restaurant)) then
    return jsonb_build_object('error','That restaurant is already in the poll.');
  end if;
  if jsonb_array_length(plan.details->'restaurants') >= 30 then
    return jsonb_build_object('error','This restaurant poll is full.');
  end if;
  insert into public.meal_restaurant_suggestions values(plan.id,actor);
  update public.meal_plans set details = jsonb_set(details,'{restaurants}',(details->'restaurants') || jsonb_build_array(restaurant)),
    version = version + 1 where id = plan.id;
  return jsonb_build_object('id',plan.id);
end;
$$;
revoke all on function public.meal_planner_action(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.meal_planner_action(text,text,text,jsonb) to service_role;

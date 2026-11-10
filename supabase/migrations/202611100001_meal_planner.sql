create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  invite uuid unique not null default gen_random_uuid(),
  owner text not null,
  details jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.meal_plan_members (
  meal_id uuid references public.meal_plans(id) on delete cascade,
  account text not null,
  display_name text not null,
  response jsonb,
  primary key (meal_id, account)
);

create index meal_plans_owner_idx on public.meal_plans(owner);
create index meal_plan_members_account_idx on public.meal_plan_members(account, meal_id);
alter table public.meal_plans enable row level security;
alter table public.meal_plan_members enable row level security;
revoke all on public.meal_plans, public.meal_plan_members from anon, authenticated;
grant select, insert, update on public.meal_plans, public.meal_plan_members to service_role;

create function public.meal_planner_action(
  actor text, actor_name text, operation text, payload jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare
  plan public.meal_plans;
  v_response jsonb;
  owner_view boolean;
begin
  if operation = 'list' then
    return coalesce((
      select jsonb_agg(
        p.details || jsonb_build_object(
          'id', p.id, 'version', p.version, 'organizer', p.owner = actor,
          'invite', case when p.owner = actor then p.invite end,
          'myVote', m.response,
          'joinedCount', (select count(*) from public.meal_plan_members j where j.meal_id = p.id and j.account <> p.owner),
          'responses', case when p.owner = actor then coalesce((
            select jsonb_agg(jsonb_build_object('name', v.display_name, 'vote', v.response) order by v.display_name)
            from public.meal_plan_members v where v.meal_id = p.id and v.response is not null
          ), '[]'::jsonb) else '[]'::jsonb end
        ) order by p.created_at desc
      )
      from public.meal_plans p
      left join public.meal_plan_members m on m.meal_id = p.id and m.account = actor
      where p.owner = actor or m.account is not null
    ), '[]'::jsonb);
  elsif operation = 'create' then
    insert into public.meal_plans(owner, details)
      values (actor, payload->'details') returning * into plan;
    return jsonb_build_object('id', plan.id);
  elsif operation = 'join' then
    select * into plan from public.meal_plans where invite = (payload->>'invite')::uuid;
    if not found then return jsonb_build_object('error', 'This invite is unavailable.'); end if;
    insert into public.meal_plan_members(meal_id, account, display_name)
      values (plan.id, actor, actor_name)
      on conflict (meal_id, account) do update set display_name = excluded.display_name;
    return jsonb_build_object('id', plan.id);
  end if;

  select * into plan from public.meal_plans where id = (payload->>'id')::uuid for update;
  if not found then return jsonb_build_object('error', 'This poll is unavailable.'); end if;
  owner_view := plan.owner = actor;
  if operation = 'manage' then
    if not owner_view then return jsonb_build_object('error', 'Only the organizer can update this meal.'); end if;
    if plan.version <> (payload->>'version')::integer then
      return jsonb_build_object('error', 'This meal has changed. Refresh before making another update.');
    end if;
    -- Existing votes refer to stable option values. Organizers can add options.
    if not ((payload->'details'->'times') @> (plan.details->'times'))
       or not ((payload->'details'->'restaurants') @> (plan.details->'restaurants')) then
      return jsonb_build_object('error', 'Existing poll options must be retained.');
    end if;
    update public.meal_plans set details = payload->'details', version = version + 1 where id = plan.id;
  elsif operation = 'vote' then
    if not owner_view and not exists (
      select 1 from public.meal_plan_members where meal_id = plan.id and account = actor
    ) then return jsonb_build_object('error', 'Open the invitation to join this poll first.'); end if;
    v_response := payload->'vote';
    if not ((plan.details->'times') @> (v_response->'times'))
       or not ((plan.details->'restaurants') @> (v_response->'restaurants')) then
      return jsonb_build_object('error', 'One of those options is unavailable. Refresh the poll.');
    end if;
    if coalesce(plan.details->>'selectedTime','') <> '' or jsonb_array_length(plan.details->'times') = 0 then
      v_response := v_response - 'times';
    end if;
    if coalesce(plan.details->>'restaurant','') <> '' or jsonb_array_length(plan.details->'restaurants') = 0 then
      v_response := v_response - 'restaurants';
    end if;
    if v_response = '{}'::jsonb then return jsonb_build_object('error', 'This poll is closed.'); end if;
    insert into public.meal_plan_members as member(meal_id, account, display_name, response)
      values (plan.id, actor, actor_name, '{"times":[],"restaurants":[]}'::jsonb || v_response)
      on conflict (meal_id, account) do update
      set display_name = excluded.display_name, response = coalesce(member.response,'{"times":[],"restaurants":[]}'::jsonb) || v_response;
  else
    return jsonb_build_object('error','Unknown planner action.');
  end if;
  return jsonb_build_object('id', plan.id);
end;
$$;

revoke all on function public.meal_planner_action(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.meal_planner_action(text,text,text,jsonb) to service_role;

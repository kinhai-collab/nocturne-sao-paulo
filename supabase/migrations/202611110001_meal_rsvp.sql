-- Keep the existing suggestion, voting, and account-linking behavior behind this wrapper.
alter function public.meal_planner_action(text,text,text,jsonb) rename to meal_planner_suggestions_action;

create function public.meal_planner_action(actor text, actor_name text, operation text, payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  plan public.meal_plans;
  meals jsonb;
begin
  if operation = 'list' then
    meals := public.meal_planner_suggestions_action(actor, actor_name, operation, payload);
    return coalesce((
      select jsonb_agg(meal || jsonb_build_object(
        'attendanceResponses', coalesce((
          select jsonb_agg(jsonb_build_object('name', member.display_name, 'attendance', member.response->>'attendance')
            order by member.display_name, member.account)
          from public.meal_plan_members member
          where member.meal_id = (meal->>'id')::uuid
            and member.account <> (select owner from public.meal_plans where id = member.meal_id)
            and member.response->>'attendance' in ('going', 'maybe', 'declined')
        ), '[]'::jsonb)
      ) order by idx)
      from jsonb_array_elements(meals) with ordinality entries(meal, idx)
    ), '[]'::jsonb);
  end if;

  if operation <> 'rsvp' then
    return public.meal_planner_suggestions_action(actor, actor_name, operation, payload);
  end if;
  if payload->>'attendance' is null or payload->>'attendance' not in ('going', 'maybe', 'declined') then
    return jsonb_build_object('error', 'Choose Going, Maybe, or Can’t make it.');
  end if;

  select * into plan from public.meal_plans where id = (payload->>'id')::uuid for update;
  if not found or not exists (
    select 1 from public.meal_plan_members where meal_id = plan.id and account = actor
  ) then return jsonb_build_object('error', 'Open the invitation to join this dinner first.'); end if;

  update public.meal_plan_members member
    set display_name = actor_name,
        response = coalesce(member.response, '{"times":[],"restaurants":[]}'::jsonb) ||
          jsonb_build_object('attendance', payload->>'attendance')
    where meal_id = plan.id and account = actor;
  return jsonb_build_object('id', plan.id);
end;
$$;

revoke all on function public.meal_planner_action(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.meal_planner_action(text,text,text,jsonb) to service_role;

-- Carry attendance along when Google and Microsoft accounts are linked.
create or replace function public.meal_microsoft_action(ms_sub text, actor_name text, operation text, payload jsonb, verified_google_sub text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  linked_google text;
  ms_actor text := 'microsoft:' || ms_sub;
begin
  perform pg_advisory_xact_lock(hashtextextended(ms_actor, 0));
  select google_sub into linked_google from public.meal_microsoft_links where microsoft_sub = ms_sub;
  if operation <> 'link' then
    return public.meal_planner_action(coalesce(linked_google, ms_actor), actor_name, operation, payload);
  end if;
  if verified_google_sub is null then
    return jsonb_build_object('error', 'Verify your Google account to link it.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('google:' || verified_google_sub, 0));
  if linked_google = verified_google_sub then return jsonb_build_object('linked', true); end if;
  if linked_google is not null or exists (
    select 1 from public.meal_microsoft_links where google_sub = verified_google_sub
  ) then
    return jsonb_build_object('error', 'One of these accounts is already linked to another account.');
  end if;

  insert into public.meal_microsoft_links values (ms_sub, verified_google_sub);
  update public.meal_plans set owner = verified_google_sub where owner = ms_actor;
  -- Preserve the existing Google response when both accounts voted on one poll.
  insert into public.meal_plan_members as current_member(meal_id, account, display_name, response)
    select meal_id, verified_google_sub, display_name, response
    from public.meal_plan_members where account = ms_actor
    on conflict (meal_id, account) do update
      set response = case when current_member.response is null then excluded.response
        else coalesce(excluded.response, '{}'::jsonb) || current_member.response end;
  delete from public.meal_plan_members where account = ms_actor;
  return jsonb_build_object('linked', true);
end;
$$;
revoke all on function public.meal_microsoft_action(text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.meal_microsoft_action(text,text,text,jsonb,text) to service_role;

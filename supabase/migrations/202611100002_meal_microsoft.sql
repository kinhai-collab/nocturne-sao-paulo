create table public.meal_microsoft_links (
  microsoft_sub text primary key,
  google_sub text not null unique
);
alter table public.meal_microsoft_links enable row level security;
revoke all on public.meal_microsoft_links from public, anon, authenticated;
grant select, insert on public.meal_microsoft_links to service_role;
grant delete on public.meal_plan_members to service_role;

create function public.meal_microsoft_action(ms_sub text, actor_name text, operation text, payload jsonb, verified_google_sub text default null)
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
      set response = coalesce(current_member.response, excluded.response);
  delete from public.meal_plan_members where account = ms_actor;
  return jsonb_build_object('linked', true);
end;
$$;
revoke all on function public.meal_microsoft_action(text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.meal_microsoft_action(text,text,text,jsonb,text) to service_role;

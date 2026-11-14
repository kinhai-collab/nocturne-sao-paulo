-- Run after the migration in a transaction, and roll back all fixtures/counters.
do $$
declare plan uuid; n integer;
begin
  insert into public.meal_plans(owner,details) values('photo-limit-test','{}') returning id into plan;
  for n in 1..5 loop
    if not public.meal_reserve_invitation_photo(plan) then raise exception 'Expected first five requests'; end if;
  end loop;
  if public.meal_reserve_invitation_photo(plan) then raise exception 'Sixth request must be blocked'; end if;
  for n in 6..30 loop
    update public.meal_invitation_photo_usage set minute_start=now()-interval '2 minutes' where meal_id=plan;
    if not public.meal_reserve_invitation_photo(plan) then raise exception 'New minute should be allowed until daily limit'; end if;
  end loop;
  update public.meal_invitation_photo_usage set minute_start=now()-interval '2 minutes' where meal_id=plan;
  if public.meal_reserve_invitation_photo(plan) then raise exception 'Daily request limit must be enforced'; end if;
  if public.meal_reserve_invitation_photo(gen_random_uuid()) then raise exception 'Missing meal must not reserve'; end if;
  insert into public.meal_photo_monthly_usage(month_start,requests)
    values(date_trunc('month',now() at time zone 'UTC')::date,900)
    on conflict(month_start) do update set requests=900;
  insert into public.meal_plans(owner,details) values('photo-global-limit-test','{}') returning id into plan;
  if public.meal_reserve_invitation_photo(plan) then raise exception 'Global monthly limit must be enforced'; end if;
  if has_function_privilege('anon','public.meal_reserve_invitation_photo(uuid)','EXECUTE') then raise exception 'Anonymous SQL access forbidden'; end if;
end;
$$;

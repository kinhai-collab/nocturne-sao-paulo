-- Rate counters contain no Google photo names, URLs, images or guest data.
create table public.meal_invitation_photo_usage (
  meal_id uuid references public.meal_plans(id) on delete cascade,
  day_start date not null,
  minute_start timestamptz not null,
  minute_requests integer not null,
  day_requests integer not null,
  primary key(meal_id, day_start)
);
alter table public.meal_invitation_photo_usage enable row level security;
revoke all on public.meal_invitation_photo_usage from public, anon, authenticated;
grant select, insert, update, delete on public.meal_invitation_photo_usage to service_role;

create function public.meal_reserve_invitation_photo(plan_id uuid) returns boolean
language plpgsql set search_path='' as $$
declare reserved boolean;
begin
  if not exists(select 1 from public.meal_plans where id=plan_id) then return false; end if;
  with slot as (
    insert into public.meal_invitation_photo_usage as u
      (meal_id,day_start,minute_start,minute_requests,day_requests)
    values(plan_id,(now() at time zone 'UTC')::date,date_trunc('minute',now()),1,1)
    on conflict(meal_id,day_start) do update set
      minute_start=date_trunc('minute',now()),
      minute_requests=case when u.minute_start=date_trunc('minute',now()) then u.minute_requests+1 else 1 end,
      day_requests=u.day_requests+1
    where u.day_requests<30 and (u.minute_start<>date_trunc('minute',now()) or u.minute_requests<5)
    returning 1
  ) select exists(select 1 from slot) into reserved;
  if not reserved then return false; end if;
  -- Reuse the existing global 900-photo/month cap. Search remains capped at 900.
  return public.meal_reserve_photo();
end;
$$;
revoke all on function public.meal_reserve_invitation_photo(uuid) from public, anon, authenticated;
grant execute on function public.meal_reserve_invitation_photo(uuid) to service_role;

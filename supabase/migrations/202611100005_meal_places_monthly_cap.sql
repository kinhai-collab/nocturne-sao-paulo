create table public.meal_places_monthly_usage (
  month_start date primary key,
  searches integer not null check (searches between 1 and 900)
);
alter table public.meal_places_monthly_usage enable row level security;
revoke all on public.meal_places_monthly_usage from public, anon, authenticated;
grant select, insert, update on public.meal_places_monthly_usage to service_role;

create function public.meal_reserve_places_search()
returns boolean
language sql
set search_path = ''
as $$
  with reserved as (
    insert into public.meal_places_monthly_usage as usage (month_start, searches)
    values (date_trunc('month', now() at time zone 'UTC')::date, 1)
    on conflict (month_start) do update set searches = usage.searches + 1
    where usage.searches < 900
    returning searches
  )
  select exists(select 1 from reserved);
$$;
revoke all on function public.meal_reserve_places_search() from public, anon, authenticated;
grant execute on function public.meal_reserve_places_search() to service_role;

create table public.dining_challenges (
  nonce text primary key,
  origin text not null,
  poll_id text not null,
  expires_at timestamptz not null
);
create table public.dining_ballots (
  poll_id text not null,
  google_sub text not null,
  name text not null,
  email text not null,
  choices text[] not null check (cardinality(choices) between 1 and 5),
  submitted_at timestamptz not null default now(),
  primary key (poll_id, google_sub)
);
alter table public.dining_challenges enable row level security;
alter table public.dining_ballots enable row level security;
revoke all on public.dining_challenges, public.dining_ballots from anon, authenticated;
grant all on public.dining_challenges, public.dining_ballots to service_role;

create or replace function public.dining_cast_ballot(
  p_poll text, p_sub text, p_name text, p_email text,
  p_choices text[], p_nonce text, p_origin text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare prior text[];
begin
  if not exists (select 1 from public.dining_challenges
      where nonce=p_nonce and origin=p_origin and poll_id=p_poll and expires_at>now()) then
    raise exception 'Sign-in expired. Please sign in again.';
  end if;
  if p_poll <> 'sao-paulo-2026' or cardinality(p_choices) not between 1 and 5
    or cardinality(p_choices) <> (select count(distinct x) from unnest(p_choices) x)
    or not (p_choices <@ array['evvai','tuju','d-o-m','fame-osteria','jun-sakamoto','kan-suke','kanoe','kazuo','kinoshita','kuro','mani','murakami','oizumi-sushi','picchi','ryo-gastronomia','tangara-jean-georges']) then
    raise exception 'Choose 1–5 distinct restaurants.';
  end if;
  select array_agg(x order by x) into p_choices from unnest(p_choices) x;
  insert into public.dining_ballots(poll_id,google_sub,name,email,choices)
    values(p_poll,p_sub,left(p_name,300),left(p_email,300),p_choices)
    on conflict (poll_id,google_sub) do nothing;
  select choices into prior from public.dining_ballots where poll_id=p_poll and google_sub=p_sub;
  if prior <> p_choices then raise exception 'This Google account has already submitted a different ballot.'; end if;
  return true;
end $$;
revoke all on function public.dining_cast_ballot(text,text,text,text,text[],text,text) from public, anon, authenticated;
grant execute on function public.dining_cast_ballot(text,text,text,text,text[],text,text) to service_role;

create or replace function public.dining_counts(p_poll text)
returns table(restaurant text, votes bigint) language sql security invoker set search_path = '' as $$
  select restaurant, count(*) from public.dining_ballots b,
    lateral unnest(b.choices) restaurant where b.poll_id=p_poll group by restaurant
$$;
revoke all on function public.dining_counts(text) from public, anon, authenticated;
grant execute on function public.dining_counts(text) to service_role;

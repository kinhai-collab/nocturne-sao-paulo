create table public.meal_remembered_sessions (
  token_hash text primary key,
  account text not null,
  display_name text not null,
  microsoft boolean not null,
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.meal_remembered_sessions enable row level security;
revoke all on public.meal_remembered_sessions from public, anon, authenticated;
grant select, insert, delete on public.meal_remembered_sessions to service_role;
create index meal_remembered_sessions_expiry on public.meal_remembered_sessions(expires_at);

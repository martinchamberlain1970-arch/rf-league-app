begin;
-- Deliberately separate from rated fixtures, matches, frames and rating triggers.
create table public.league_friendlies (
  id uuid primary key default gen_random_uuid(),
  host_team_id uuid not null references public.league_teams(id),
  guest_team_id uuid references public.league_teams(id),
  match_date date not null,
  start_time time not null,
  venue text not null check (length(venue) between 1 and 200),
  notes text not null default '' check (length(notes) <= 1000),
  status text not null default 'open' check (status in ('open','booked','played','cancelled')),
  frames jsonb not null default '[]'::jsonb check (jsonb_typeof(frames) = 'array' and jsonb_array_length(frames) <= 30),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (guest_team_id is null or guest_team_id <> host_team_id),
  check ((status = 'open' and guest_team_id is null) or (status in ('booked','played') and guest_team_id is not null) or status = 'cancelled')
);
create unique index league_friendlies_open_date on public.league_friendlies(host_team_id, match_date) where status = 'open';
create index league_friendlies_date on public.league_friendlies(match_date desc);
alter table public.league_friendlies enable row level security;
-- Only the authenticated server API may access this table; no client write policies.
revoke all on public.league_friendlies from anon, authenticated;
grant all on public.league_friendlies to service_role;
notify pgrst, 'reload schema';
commit;

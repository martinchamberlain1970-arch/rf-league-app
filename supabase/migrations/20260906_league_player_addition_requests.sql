-- Captain/vice-captain requests to add a player to a live season roster.
-- Requests remain auditable and must be approved by a league officer.

create extension if not exists pgcrypto;

create table if not exists public.league_player_addition_requests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete cascade,
  requester_user_id uuid not null references public.app_users(id) on delete cascade,
  requested_full_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_player_id uuid references public.players(id) on delete set null,
  reviewed_by_user_id uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists league_player_addition_requests_status_idx
  on public.league_player_addition_requests(status, created_at desc);
create index if not exists league_player_addition_requests_team_idx
  on public.league_player_addition_requests(season_id, team_id, created_at desc);
create unique index if not exists league_player_addition_requests_pending_name_uidx
  on public.league_player_addition_requests(team_id, lower(btrim(requested_full_name)))
  where status = 'pending';

alter table public.league_player_addition_requests enable row level security;

drop policy if exists league_player_addition_requests_manage on public.league_player_addition_requests;
create policy league_player_addition_requests_manage
  on public.league_player_addition_requests
  for all
  to authenticated
  using (public.is_league_manager())
  with check (public.is_league_manager());

comment on table public.league_player_addition_requests is
  'Auditable captain and vice-captain requests to add players to a current league-season roster.';

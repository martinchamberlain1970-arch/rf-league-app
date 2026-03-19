create extension if not exists pgcrypto;

create table if not exists public.league_fixture_change_requests (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.league_fixtures(id) on delete cascade,
  requested_by_user_id uuid not null references public.app_users(id) on delete cascade,
  requester_team_id uuid null references public.league_teams(id) on delete set null,
  request_type text not null check (request_type in ('play_early', 'play_late')),
  original_fixture_date date null,
  proposed_fixture_date date not null,
  opposing_team_agreed boolean not null default false,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_notes text null,
  reviewed_by_user_id uuid null references public.app_users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists league_fixture_change_requests_fixture_idx
  on public.league_fixture_change_requests (fixture_id, created_at desc);

create index if not exists league_fixture_change_requests_status_idx
  on public.league_fixture_change_requests (status, created_at desc);

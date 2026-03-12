-- Captain inbox notifications for match reports and weekly round-ups.

create table if not exists public.league_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('match','weekly')),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  week_no integer,
  fixture_id uuid null references public.league_fixtures(id) on delete cascade,
  target_team_id uuid not null references public.league_teams(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists league_reports_team_created_idx
  on public.league_reports(target_team_id, created_at desc);

create index if not exists league_reports_season_week_idx
  on public.league_reports(season_id, week_no, created_at desc);

alter table public.league_reports enable row level security;

-- Super User (owner) can create and view all reports.
drop policy if exists "league_reports_owner_insert" on public.league_reports;
create policy "league_reports_owner_insert"
  on public.league_reports
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users u
      where u.id = auth.uid()
        and u.role = 'owner'
    )
  );

drop policy if exists "league_reports_owner_select" on public.league_reports;
create policy "league_reports_owner_select"
  on public.league_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users u
      where u.id = auth.uid()
        and u.role = 'owner'
    )
  );

-- Captains/vice-captains can read reports targeted to their team.
drop policy if exists "league_reports_captain_select" on public.league_reports;
create policy "league_reports_captain_select"
  on public.league_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      join public.league_team_members m
        on m.player_id = au.linked_player_id
      where au.id = auth.uid()
        and (m.is_captain = true or m.is_vice_captain = true)
        and m.team_id = league_reports.target_team_id
    )
  );

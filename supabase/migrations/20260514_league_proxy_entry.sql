alter table public.league_fixtures
  add column if not exists proxy_entry_enabled boolean not null default false,
  add column if not exists proxy_entry_confirmed_at timestamptz null,
  add column if not exists proxy_entry_confirmed_by_user_id uuid null references public.app_users(id) on delete set null,
  add column if not exists proxy_entry_by_team_side text null,
  add column if not exists proxy_entry_note text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'league_fixtures_proxy_entry_by_team_side_check'
  ) then
    alter table public.league_fixtures
      add constraint league_fixtures_proxy_entry_by_team_side_check
      check (proxy_entry_by_team_side in ('home', 'away') or proxy_entry_by_team_side is null);
  end if;
end $$;

alter table public.league_result_submissions
  add column if not exists proxy_entry_used boolean not null default false,
  add column if not exists proxy_entry_by_team_side text null,
  add column if not exists proxy_entry_note text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'league_result_submissions_proxy_entry_by_team_side_check'
  ) then
    alter table public.league_result_submissions
      add constraint league_result_submissions_proxy_entry_by_team_side_check
      check (proxy_entry_by_team_side in ('home', 'away') or proxy_entry_by_team_side is null);
  end if;
end $$;

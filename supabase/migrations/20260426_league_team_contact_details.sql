alter table public.league_teams
  add column if not exists captain_email text null,
  add column if not exists captain_phone text null,
  add column if not exists vice_captain_email text null,
  add column if not exists vice_captain_phone text null;

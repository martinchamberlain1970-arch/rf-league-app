-- Southfleet B withdrew from the 2026/2027 Premier League before the season.
-- Preserve every other fixture and date. Removing only Southfleet B's fixtures
-- leaves its scheduled opponent with the BYE for that week.

do $$
declare
  target_season_id uuid;
  target_team_id uuid;
  removed_fixture_count integer := 0;
begin
  select id
  into target_season_id
  from public.league_seasons
  where name = 'Gravesend & District Indoor Games League - Premier League 2026/2027'
  limit 1;

  if target_season_id is null then
    raise exception 'The 2026/2027 Premier League season could not be found';
  end if;

  select id
  into target_team_id
  from public.league_teams
  where season_id = target_season_id
    and lower(btrim(name)) = 'southfleet b'
  limit 1;

  if target_team_id is null then
    raise notice 'Southfleet B is already absent from the 2026/2027 Premier League';
    return;
  end if;

  if exists (
    select 1
    from public.league_fixtures
    where season_id = target_season_id
      and (home_team_id = target_team_id or away_team_id = target_team_id)
      and status <> 'pending'
  ) then
    raise exception 'Southfleet B has a fixture which is already in progress or complete; no changes were made';
  end if;

  delete from public.league_fixtures
  where season_id = target_season_id
    and (home_team_id = target_team_id or away_team_id = target_team_id);

  get diagnostics removed_fixture_count = row_count;

  delete from public.league_team_members
  where season_id = target_season_id
    and team_id = target_team_id;

  update public.league_teams
  set is_active = false,
      captain_email = null,
      captain_phone = null,
      vice_captain_email = null,
      vice_captain_phone = null
  where id = target_team_id;

  raise notice 'Southfleet B withdrawn; % fixtures removed and converted to implicit BYE weeks', removed_fixture_count;
end;
$$;

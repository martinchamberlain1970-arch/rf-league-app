-- Correct the combined winter replacement function for databases where the
-- existing league fixture trigger automatically creates each fixture's frames.

create or replace function public.replace_combined_winter_fixtures(
  p_season_ids uuid[],
  p_fixtures jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_row record;
  inserted_count integer := 0;
begin
  if not public.is_league_manager(auth.uid()) then
    raise exception 'League management access is required to replace winter fixtures';
  end if;

  if coalesce(array_length(p_season_ids, 1), 0) <> 2 then
    raise exception 'Exactly two winter divisions must be supplied';
  end if;

  if jsonb_typeof(p_fixtures) <> 'array' or jsonb_array_length(p_fixtures) = 0 then
    raise exception 'The combined fixture payload is empty';
  end if;

  if exists (
    select 1
    from public.league_fixtures
    where season_id = any(p_season_ids)
      and status <> 'pending'
  ) then
    raise exception 'A winter fixture is already in progress or complete';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_fixtures) as proposed(season_id uuid)
    where not (proposed.season_id = any(p_season_ids))
  ) then
    raise exception 'The fixture payload contains an unexpected league season';
  end if;

  delete from public.league_fixtures
  where season_id = any(p_season_ids);

  for fixture_row in
    select *
    from jsonb_to_recordset(p_fixtures) as proposed(
      season_id uuid,
      location_id uuid,
      week_no integer,
      fixture_date date,
      home_team_id uuid,
      away_team_id uuid
    )
  loop
    if fixture_row.season_id is null
      or fixture_row.week_no is null
      or fixture_row.home_team_id is null
      or fixture_row.away_team_id is null
      or fixture_row.home_team_id = fixture_row.away_team_id then
      raise exception 'The combined fixture payload contains an invalid fixture';
    end if;

    insert into public.league_fixtures (
      season_id,
      location_id,
      week_no,
      fixture_date,
      home_team_id,
      away_team_id
    ) values (
      fixture_row.season_id,
      fixture_row.location_id,
      fixture_row.week_no,
      fixture_row.fixture_date,
      fixture_row.home_team_id,
      fixture_row.away_team_id
    );

    -- league_fixtures already has a trigger which creates the configured
    -- singles and doubles frame slots for the newly inserted fixture.
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.replace_combined_winter_fixtures(uuid[], jsonb) from public;
grant execute on function public.replace_combined_winter_fixtures(uuid[], jsonb) to authenticated;

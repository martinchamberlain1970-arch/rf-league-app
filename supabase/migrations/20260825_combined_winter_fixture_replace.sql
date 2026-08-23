-- Allow repeat home/away pairings in later cycles and replace both winter
-- divisions atomically after the combined fixture preview has been approved.

alter table public.league_fixtures
  drop constraint if exists league_fixtures_season_id_home_team_id_away_team_id_fixture_key;

alter table public.league_fixtures
  drop constraint if exists league_fixtures_season_week_home_away_key;

alter table public.league_fixtures
  add constraint league_fixtures_season_week_home_away_key
  unique (season_id, week_no, home_team_id, away_team_id);

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
  new_fixture_id uuid;
  singles_count integer;
  doubles_count integer;
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
    )
    returning id into new_fixture_id;

    select
      greatest(1, least(10, coalesce(ls.singles_count, 4))),
      greatest(0, least(4, coalesce(ls.doubles_count, 1)))
    into singles_count, doubles_count
    from public.league_seasons ls
    where ls.id = fixture_row.season_id;

    if singles_count is null then
      raise exception 'A fixture refers to an unknown league season';
    end if;

    insert into public.league_fixture_frames (
      fixture_id,
      slot_no,
      slot_type,
      home_player1_id,
      home_player2_id,
      away_player1_id,
      away_player2_id,
      home_nominated,
      away_nominated,
      home_forfeit,
      away_forfeit,
      winner_side,
      home_nominated_name,
      away_nominated_name,
      home_points_scored,
      away_points_scored
    )
    select
      new_fixture_id,
      slot_number,
      case when slot_number <= singles_count then 'singles' else 'doubles' end,
      null,
      null,
      null,
      null,
      false,
      false,
      false,
      false,
      null,
      null,
      null,
      null,
      null
    from generate_series(1, singles_count + doubles_count) as slot_number;

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.replace_combined_winter_fixtures(uuid[], jsonb) from public;
grant execute on function public.replace_combined_winter_fixtures(uuid[], jsonb) to authenticated;


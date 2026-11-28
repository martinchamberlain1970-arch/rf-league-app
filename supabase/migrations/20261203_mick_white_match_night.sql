begin;

alter table public.league_fixtures
  add column cup_competition_id uuid references public.competitions(id) on delete restrict;

create unique index league_fixtures_cup_pair_key on public.league_fixtures
  (cup_competition_id, least(home_team_id, away_team_id), greatest(home_team_id, away_team_id))
  where cup_competition_id is not null;

-- Preserve the live standings view's columns, grants and scoring calculation.
do $$
declare
  definition text := pg_get_viewdef('public.league_table'::regclass);
  fixture_source text := 'from[[:space:]]+(public[.])?league_fixtures[[:space:]]+f([[:space:]]|$)';
  scoped_definition text;
begin
  if regexp_count(definition, fixture_source, 1, 'i') <> 1 then
    raise exception 'Unexpected league_table definition. Review its fixture source.';
  end if;
  scoped_definition := regexp_replace(definition, fixture_source,
    'FROM (SELECT * FROM public.league_fixtures WHERE cup_competition_id IS NULL) f ', 'i');
  execute 'create or replace view public.league_table with (security_invoker = true) as ' || scoped_definition;
end;
$$;

-- Keep cup matches when officers regenerate the ordinary winter schedule.
do $$
declare
  existing_function regprocedure := to_regprocedure('public.replace_combined_winter_fixtures(uuid[],jsonb)');
  definition text;
  condition text := 'where season_id = any(p_season_ids)';
begin
  if existing_function is null then return; end if;
  definition := pg_get_functiondef(existing_function);
  if (length(lower(definition)) - length(replace(lower(definition), condition, ''))) <> 2 * length(condition) then
    raise exception 'Unexpected winter fixture replacement function. Review its season filters.';
  end if;
  execute regexp_replace(definition, 'where season_id = any[(]p_season_ids[)]',
    'where season_id = any(p_season_ids) and cup_competition_id is null', 'gi');
end;
$$;

create function public.schedule_mick_white_fixture(p_competition_id uuid, p_home_team_id uuid, p_away_team_id uuid, p_fixture_date date)
returns uuid
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  cup public.competitions%rowtype;
  home_team public.league_teams%rowtype;
  away_team public.league_teams%rowtype;
  winter public.league_seasons%rowtype;
  existing public.league_fixtures%rowtype;
  new_fixture_id uuid;
begin
  select * into cup from public.competitions where id = p_competition_id for update;
  if not found or cup.name !~* '^Mick White([[:space:]]|$)' or cup.is_archived or cup.is_completed then
    raise exception 'Select the active Mick White Memorial Cup.';
  end if;
  if cup.signup_open and (cup.signup_deadline is null or cup.signup_deadline > now()) then
    raise exception 'Close entries before adding a fixture from the draw.';
  end if;
  if p_fixture_date is null or p_home_team_id is null or p_away_team_id is null or p_home_team_id = p_away_team_id then
    raise exception 'Select two different teams and an agreed date.';
  end if;

  select * into existing from public.league_fixtures f where f.cup_competition_id = cup.id
    and least(f.home_team_id, f.away_team_id) = least(p_home_team_id, p_away_team_id)
    and greatest(f.home_team_id, f.away_team_id) = greatest(p_home_team_id, p_away_team_id);
  if found then
    if existing.home_team_id = p_home_team_id and existing.fixture_date = p_fixture_date then
      return existing.id;
    end if;
    raise exception 'This pair already has a cup fixture.';
  end if;

  select * into home_team from public.league_teams where id = p_home_team_id and is_active;
  select * into away_team from public.league_teams where id = p_away_team_id and is_active;
  select * into winter from public.league_seasons where id = home_team.season_id and is_active and is_published;
  if winter.id is null or away_team.season_id is distinct from winter.id
      or winter.name !~* '(^|[^[:alnum:]])(division[[:space:]]+(1|one)|first[[:space:]]+division)([^[:alnum:]]|$)'
      or substring(cup.name from '[0-9]{4}/[0-9]{4}$') is distinct from substring(winter.name from '[0-9]{4}/[0-9]{4}$')
      or winter.singles_count is distinct from 4 or winter.doubles_count is distinct from 1
      or winter.handicap_enabled is distinct from false then
    raise exception 'Both teams must belong to the same scratch Division One winter league.';
  end if;
  if (select count(distinct league_team_id) from public.competition_entries
      where competition_id = cup.id and status = 'approved' and league_team_id in (home_team.id, away_team.id)) <> 2 then
    raise exception 'Both teams need approved cup entries.';
  end if;
  if exists (
    select 1 from public.league_fixtures f where f.fixture_date = p_fixture_date and f.status <> 'bye'
      and (f.home_team_id in (home_team.id, away_team.id) or f.away_team_id in (home_team.id, away_team.id))
  ) then
    raise exception 'One of these teams already has a fixture on that date.';
  end if;
  if home_team.location_id is null then
    raise exception 'Set the home team’s registered venue before adding the fixture.';
  end if;

  insert into public.league_fixtures (season_id, location_id, fixture_date, home_team_id, away_team_id, cup_competition_id)
  values (winter.id, home_team.location_id, p_fixture_date, home_team.id, away_team.id, cup.id)
  returning id into new_fixture_id;
  -- The league's existing insert trigger seeds the scorecard from this season. Fail atomically if
  -- the underlying configuration ever stops producing the expected five slots.
  if (select array_agg(f.slot_type::text order by f.slot_no) from public.league_fixture_frames f where f.fixture_id = new_fixture_id)
      is distinct from array['singles','singles','singles','singles','doubles']::text[] then
    raise exception 'The standard five-frame scorecard could not be created.';
  end if;
  return new_fixture_id;
end;
$$;

revoke all on function public.schedule_mick_white_fixture(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.schedule_mick_white_fixture(uuid, uuid, uuid, date) to service_role;

commit;

begin;

create table public.mick_white_draw_ties (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_no smallint not null check (round_no > 0),
  match_no smallint not null check (match_no > 0),
  seed_home_team_id uuid references public.league_teams(id),
  seed_away_team_id uuid references public.league_teams(id),
  fixture_id uuid unique references public.league_fixtures(id) on delete restrict,
  unique (competition_id, round_no, match_no),
  check ((round_no = 1 and seed_home_team_id is not null)
      or (round_no > 1 and seed_home_team_id is null and seed_away_team_id is null)),
  check (seed_home_team_id <> seed_away_team_id)
);

alter table public.mick_white_draw_ties enable row level security;
revoke all on public.mick_white_draw_ties from public, anon, authenticated;
grant select on public.mick_white_draw_ties to authenticated;
grant select, insert, update on public.mick_white_draw_ties to service_role;
create policy mick_white_published_draw_read on public.mick_white_draw_ties for select to authenticated
using (exists (select 1 from public.competitions c where c.id = competition_id and not c.is_archived));

create view public.mick_white_draw with (security_invoker = true) as
with ties as (
  select t.*,
    coalesce(f.home_team_id, t.seed_home_team_id) as saved_home,
    coalesce(f.away_team_id, t.seed_away_team_id) as saved_away,
    (t.round_no = 1 and t.seed_away_team_id is null) as is_bye,
    f.fixture_date, f.status as fixture_status, f.home_points, f.away_points,
    case
      when t.round_no = 1 and t.seed_away_team_id is null then t.seed_home_team_id
      when f.status = 'complete' and f.home_points > f.away_points then f.home_team_id
      when f.status = 'complete' and f.away_points > f.home_points then f.away_team_id
    end as winner_team_id
  from public.mick_white_draw_ties t
  left join public.league_fixtures f on f.id = t.fixture_id
)
select t.id, t.competition_id, t.round_no, t.match_no, t.is_bye, t.fixture_id,
  t.fixture_date, t.fixture_status, t.home_points, t.away_points, t.winner_team_id,
  coalesce(t.saved_home, h.winner_team_id) as home_team_id,
  coalesce(t.saved_away, a.winner_team_id) as away_team_id
from ties t
left join ties h on h.competition_id = t.competition_id and h.round_no = t.round_no - 1 and h.match_no = t.match_no * 2 - 1
left join ties a on a.competition_id = t.competition_id and a.round_no = t.round_no - 1 and a.match_no = t.match_no * 2;

revoke all on public.mick_white_draw from public, anon, authenticated;
grant select on public.mick_white_draw to authenticated, service_role;

create function public.publish_mick_white_draw(p_competition_id uuid, p_opening_ties jsonb)
returns void
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  cup public.competitions%rowtype;
  approved_teams uuid[];
  drawn_teams uuid[];
  slots integer;
  total_rounds integer;
begin
  perform pg_advisory_xact_lock(hashtext('public_competition_team_submission'), 0);
  select * into cup from public.competitions where id = p_competition_id for update;
  if not found or cup.name !~* '^Mick White([[:space:]]|$)' or cup.is_archived or cup.is_completed then
    raise exception 'Select the active Mick White Memorial Cup.';
  end if;
  if cup.signup_open and (cup.signup_deadline is null or cup.signup_deadline >= now()) then
    raise exception 'Close entries before running the draw.';
  end if;
  if exists (select 1 from public.mick_white_draw_ties where competition_id = cup.id) then
    raise exception 'The official draw has already been published.';
  end if;
  if exists (select 1 from public.league_fixtures where cup_competition_id = cup.id) then
    raise exception 'Cup fixtures already exist. Review those fixtures before publishing a draw.';
  end if;

  perform 1 from public.competition_entries where competition_id = cup.id and status in ('pending','approved') for update;
  if exists (select 1 from public.competition_entries where competition_id = cup.id and status = 'pending') then
    raise exception 'Review all pending entries before running the draw.';
  end if;
  select array_agg(e.league_team_id order by e.league_team_id) into approved_teams
  from public.competition_entries e where e.competition_id = cup.id and e.status = 'approved';
  if coalesce(cardinality(approved_teams), 0) < 4 then
    raise exception 'Rule 30 requires the winner to play before the final. A standard knockout needs at least four approved teams.';
  end if;
  if exists (
    select 1 from unnest(approved_teams) as entrant(team_id)
    where not exists (
      select 1 from public.league_teams t join public.league_seasons s on s.id = t.season_id
      where t.id = entrant.team_id and t.is_active and s.is_active and s.is_published
        and s.handicap_enabled = false and s.singles_count = 4 and s.doubles_count = 1
        and s.name ~* '(^|[^[:alnum:]])(division[[:space:]]+(1|one)|first[[:space:]]+division)([^[:alnum:]]|$)'
        and substring(s.name from '[0-9]{4}/[0-9]{4}$') = substring(cup.name from '[0-9]{4}/[0-9]{4}$')
    )
  ) or (select count(distinct season_id) from public.league_teams where id = any(approved_teams)) <> 1 then
    raise exception 'All entrants must belong to the same scratch Division One winter league.';
  end if;

  total_rounds := ceil(log(2, cardinality(approved_teams)::numeric));
  slots := 1 << (total_rounds - 1);
  if jsonb_typeof(p_opening_ties) is distinct from 'array' or jsonb_array_length(p_opening_ties) <> slots then
    raise exception 'The opening-round fixtures do not match the number of approved teams.';
  end if;
  select array_agg(team_id order by team_id) into drawn_teams
  from jsonb_to_recordset(p_opening_ties) as pair(home uuid, away uuid)
  cross join lateral unnest(array[pair.home, pair.away]) as team(team_id)
  where team_id is not null;
  if drawn_teams is distinct from approved_teams then
    raise exception 'Entries changed. Reload the competition before running the draw.';
  end if;

  insert into public.mick_white_draw_ties (competition_id, round_no, match_no, seed_home_team_id, seed_away_team_id)
  select cup.id, 1, n, (seed->>'home')::uuid, (seed->>'away')::uuid
  from jsonb_array_elements(p_opening_ties) with ordinality as opening(seed, n);
  insert into public.mick_white_draw_ties (competition_id, round_no, match_no)
  select cup.id, round, position
  from generate_series(2, total_rounds) as round
  cross join lateral generate_series(1, 1 << (total_rounds - round)) as position;
end;
$$;

create function public.date_mick_white_draw_tie(p_competition_id uuid, p_tie_id uuid, p_fixture_date date)
returns uuid
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  cup public.competitions%rowtype;
  tie public.mick_white_draw%rowtype;
  saved_fixture_id uuid;
begin
  select * into cup from public.competitions where id = p_competition_id for update;
  if not found or cup.is_archived or cup.is_completed then
    raise exception 'Select the active Mick White Memorial Cup.';
  end if;
  select * into tie from public.mick_white_draw where competition_id = cup.id and id = p_tie_id;
  if not found or tie.is_bye or tie.home_team_id is null or tie.away_team_id is null then
    raise exception 'Wait until both teams in this tie are confirmed.';
  end if;
  if tie.fixture_id is not null then
    if tie.fixture_date = p_fixture_date then return tie.fixture_id; end if;
    raise exception 'An agreed date has already been saved for this fixture.';
  end if;
  if exists (
    select 1 from public.mick_white_draw_ties feeder
    join public.league_result_submissions s on s.fixture_id = feeder.fixture_id and s.status = 'pending'
    where feeder.competition_id = cup.id and feeder.round_no = tie.round_no - 1
      and feeder.match_no in (tie.match_no * 2 - 1, tie.match_no * 2)
  ) then
    raise exception 'Approve the preceding results before dating this tie.';
  end if;
  if p_fixture_date is null then raise exception 'Enter the agreed match date.'; end if;
  if exists (select 1 from public.mick_white_draw_ties t where t.competition_id = cup.id and t.round_no > tie.round_no) then
    saved_fixture_id := public.schedule_mick_white_fixture(cup.id, tie.home_team_id, tie.away_team_id, p_fixture_date);
  else
    if cup.final_venue_location_id is null then raise exception 'Save the neutral final venue before dating the final.'; end if;
    saved_fixture_id := public.schedule_mick_white_fixture(cup.id, tie.home_team_id, tie.away_team_id, p_fixture_date);
    update public.league_fixtures set location_id = cup.final_venue_location_id where id = saved_fixture_id;
  end if;
  update public.mick_white_draw_ties set fixture_id = saved_fixture_id where id = tie.id;
  return saved_fixture_id;
end;
$$;

revoke all on function public.publish_mick_white_draw(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.date_mick_white_draw_tie(uuid,uuid,date) from public, anon, authenticated;
grant execute on function public.publish_mick_white_draw(uuid,jsonb) to service_role;
grant execute on function public.date_mick_white_draw_tie(uuid,uuid,date) to service_role;

commit;

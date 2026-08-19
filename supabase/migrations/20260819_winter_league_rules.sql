alter table public.league_seasons
  add column if not exists handicap_max_start integer,
  add column if not exists handicap_review_interval_weeks integer not null default 4,
  add column if not exists rating_tracking_enabled boolean not null default true,
  add column if not exists fixture_cycles integer not null default 2,
  add column if not exists miss_rule text;

alter table public.league_seasons
  drop constraint if exists league_seasons_handicap_max_start_check,
  add constraint league_seasons_handicap_max_start_check
    check (handicap_max_start is null or handicap_max_start >= 0),
  drop constraint if exists league_seasons_handicap_review_interval_check,
  add constraint league_seasons_handicap_review_interval_check
    check (handicap_review_interval_weeks >= 1),
  drop constraint if exists league_seasons_fixture_cycles_check,
  add constraint league_seasons_fixture_cycles_check
    check (fixture_cycles between 1 and 3);

comment on column public.league_seasons.handicap_max_start is
  'Maximum points awarded at the start of a frame. NULL means no cap; ignored when handicap_enabled is false.';
comment on column public.league_seasons.rating_tracking_enabled is
  'When true, Elo continues to update even if match handicaps are disabled.';

-- New winter divisions agreed at the 2026 AGM. These updates are deliberately
-- name-based and only affect matching league seasons already created by an admin.
update public.league_seasons
set handicap_enabled = true,
    handicap_max_start = null,
    handicap_review_interval_weeks = 4,
    rating_tracking_enabled = true,
    fixture_cycles = 3,
    miss_rule = 'A miss may be called while a player is snookered. After the third attempt, the balls remain where they lie.'
where lower(name) like '%premier%';

update public.league_seasons
set handicap_enabled = false,
    handicap_max_start = null,
    handicap_review_interval_weeks = 4,
    rating_tracking_enabled = true,
    fixture_cycles = 3,
    miss_rule = 'The miss rule is not used in Division 1.'
where lower(name) like '%division 1%' or lower(name) like '%division one%';

-- Establish the agreed Premier League starting baseline. Historical rating
-- events are retained; the history row records the operational reset itself.
insert into public.league_handicap_history (
  player_id, season_id, change_type, delta, previous_handicap, new_handicap, reason
)
select distinct
  p.id,
  s.id,
  'baseline_override',
  0 - coalesce(p.snooker_handicap, 0),
  coalesce(p.snooker_handicap, 0),
  0,
  '2026 Premier League AGM reset: Elo 1000 and handicap 0.'
from public.players p
join public.league_team_members m on m.player_id = p.id
join public.league_seasons s on s.id = m.season_id
where lower(s.name) like '%premier%'
  and (
    coalesce(p.rating_snooker, 1000) <> 1000
    or coalesce(p.snooker_handicap, 0) <> 0
    or coalesce(p.rated_matches_snooker, 0) <> 0
  );

update public.players p
set rating_snooker = 1000,
    peak_rating_snooker = 1000,
    rated_matches_snooker = 0,
    snooker_handicap = 0,
    snooker_handicap_base = 0
where exists (
  select 1
  from public.league_team_members m
  join public.league_seasons s on s.id = m.season_id
  where m.player_id = p.id
    and lower(s.name) like '%premier%'
);

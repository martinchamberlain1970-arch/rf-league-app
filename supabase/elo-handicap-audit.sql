-- Elo / handicap pulse check for current registered league players.
-- Run each query separately in the Supabase SQL editor.

-- 1) Main audit: current Elo, latest rating event, handicap target, and mismatch flags.
with league_players as (
  select distinct player_id
  from league_registered_team_members
  where player_id is not null
),
event_counts as (
  select
    re.player_id,
    count(*)::int as rating_event_count,
    max(re.created_at) as latest_event_at
  from rating_events re
  join league_players lp on lp.player_id = re.player_id
  group by re.player_id
),
latest_events as (
  select distinct on (re.player_id)
    re.player_id,
    re.rating_after,
    re.created_at
  from rating_events re
  join league_players lp on lp.player_id = re.player_id
  order by re.player_id, re.created_at desc, re.id desc
)
select
  p.id as player_id,
  coalesce(nullif(trim(p.full_name), ''), p.display_name) as player_name,
  round(coalesce(p.rating_snooker, 1000))::int as current_elo,
  round(le.rating_after)::int as latest_event_elo,
  round(coalesce(p.rating_snooker, 1000))::int - round(coalesce(le.rating_after, p.rating_snooker, 1000))::int as elo_gap,
  coalesce(p.snooker_handicap, 0)::int as current_handicap,
  coalesce(p.snooker_handicap_base, p.snooker_handicap, 0)::int as baseline_handicap,
  round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4 as target_handicap_from_elo,
  (round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4) - coalesce(p.snooker_handicap, 0) as handicap_gap,
  abs(((round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4) - coalesce(p.snooker_handicap, 0)) / 4.0) as review_steps_away,
  coalesce(p.rated_matches_snooker, 0)::int as rated_matches_stored,
  coalesce(ec.rating_event_count, 0)::int as rating_event_count,
  ec.latest_event_at,
  case when le.player_id is not null and round(coalesce(p.rating_snooker, 1000))::int <> round(coalesce(le.rating_after, 1000))::int then true else false end as elo_mismatch,
  case when coalesce(p.rated_matches_snooker, 0)::int <> coalesce(ec.rating_event_count, 0)::int then true else false end as rated_match_count_mismatch,
  case when ((round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4) - coalesce(p.snooker_handicap, 0)) <> 0 then true else false end as handicap_not_aligned,
  case when coalesce(p.rated_matches_snooker, 0) = 0 and (round(coalesce(p.rating_snooker, 1000))::int <> 1000 or coalesce(p.snooker_handicap, 0)::int <> 0) then true else false end as unrated_non_default
from players p
join league_players lp on lp.player_id = p.id
left join event_counts ec on ec.player_id = p.id
left join latest_events le on le.player_id = p.id
where coalesce(p.is_archived, false) = false
order by
  (
    (case when le.player_id is not null and round(coalesce(p.rating_snooker, 1000))::int <> round(coalesce(le.rating_after, 1000))::int then 1 else 0 end) +
    (case when coalesce(p.rated_matches_snooker, 0)::int <> coalesce(ec.rating_event_count, 0)::int then 1 else 0 end) +
    (case when ((round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4) - coalesce(p.snooker_handicap, 0)) <> 0 then 1 else 0 end) +
    (case when coalesce(p.rated_matches_snooker, 0) = 0 and (round(coalesce(p.rating_snooker, 1000))::int <> 1000 or coalesce(p.snooker_handicap, 0)::int <> 0) then 1 else 0 end)
  ) desc,
  abs((round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4) - coalesce(p.snooker_handicap, 0)) desc,
  round(coalesce(p.rating_snooker, 1000)) desc,
  coalesce(nullif(trim(p.full_name), ''), p.display_name);

-- 2) Summary counts.
with league_players as (
  select distinct player_id
  from league_registered_team_members
  where player_id is not null
),
event_counts as (
  select re.player_id, count(*)::int as rating_event_count
  from rating_events re
  join league_players lp on lp.player_id = re.player_id
  group by re.player_id
),
latest_events as (
  select distinct on (re.player_id)
    re.player_id,
    re.rating_after
  from rating_events re
  join league_players lp on lp.player_id = re.player_id
  order by re.player_id, re.created_at desc, re.id desc
),
audit_rows as (
  select
    p.id,
    case when le.player_id is not null and round(coalesce(p.rating_snooker, 1000))::int <> round(coalesce(le.rating_after, 1000))::int then 1 else 0 end as elo_mismatch,
    case when coalesce(p.rated_matches_snooker, 0)::int <> coalesce(ec.rating_event_count, 0)::int then 1 else 0 end as rated_match_count_mismatch,
    case when ((round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4) - coalesce(p.snooker_handicap, 0)) <> 0 then 1 else 0 end as handicap_not_aligned
  from players p
  join league_players lp on lp.player_id = p.id
  left join event_counts ec on ec.player_id = p.id
  left join latest_events le on le.player_id = p.id
  where coalesce(p.is_archived, false) = false
)
select
  count(*)::int as total_players,
  sum(case when handicap_not_aligned = 0 then 1 else 0 end)::int as handicap_aligned,
  sum(case when handicap_not_aligned = 1 then 1 else 0 end)::int as handicap_misaligned,
  sum(case when elo_mismatch = 0 then 1 else 0 end)::int as elo_aligned,
  sum(case when elo_mismatch = 1 then 1 else 0 end)::int as elo_misaligned,
  sum(case when rated_match_count_mismatch = 0 then 1 else 0 end)::int as rated_match_count_aligned,
  sum(case when rated_match_count_mismatch = 1 then 1 else 0 end)::int as rated_match_count_misaligned
from audit_rows;

-- 3) Single-player check. Change the name as needed.
with latest_event as (
  select distinct on (re.player_id)
    re.player_id,
    re.rating_before,
    re.rating_after,
    re.rating_delta,
    re.created_at,
    re.source_result_id
  from rating_events re
  join players p on p.id = re.player_id
  where coalesce(nullif(trim(p.full_name), ''), p.display_name) = 'Steve Loyns'
  order by re.player_id, re.created_at desc, re.id desc
)
select
  p.id,
  coalesce(nullif(trim(p.full_name), ''), p.display_name) as player_name,
  round(coalesce(p.rating_snooker, 1000))::int as current_elo,
  coalesce(p.snooker_handicap, 0)::int as current_handicap,
  coalesce(p.snooker_handicap_base, p.snooker_handicap, 0)::int as baseline_handicap,
  coalesce(p.rated_matches_snooker, 0)::int as rated_matches_stored,
  round((1000 - coalesce(p.rating_snooker, 1000)) / 5.0 / 4.0) * 4 as target_handicap_from_elo,
  le.rating_before,
  le.rating_after,
  le.rating_delta,
  le.created_at as latest_rating_event_at,
  le.source_result_id as latest_rating_event_source
from players p
left join latest_event le on le.player_id = p.id
where coalesce(nullif(trim(p.full_name), ''), p.display_name) = 'Steve Loyns';

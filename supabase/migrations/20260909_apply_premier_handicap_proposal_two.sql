begin;

-- Premier League EGM, 9 September 2026: Proposal 2 adopted.
-- Restore every player affected by the 2026 opening reset from the preserved
-- rating-event and handicap-history records, then apply the agreed 40-point cap.

create temporary table proposal_two_restore_plan on commit drop as
select
  reset.player_id,
  reset.season_id,
  reset.created_at as reset_at,
  coalesce(last_event.rating_after, 1000 - (reset.previous_handicap * 5), 1000)::integer as baseline_elo,
  greatest(
    coalesce(last_event.rating_after, 1000 - (reset.previous_handicap * 5), 1000),
    coalesce(event_summary.peak_rating, last_event.rating_after, 1000)
  )::integer as baseline_peak_elo,
  coalesce(event_summary.rated_frames, 0)::integer as baseline_rated_frames,
  (reset.previous_handicap + coalesce(later_handicap_changes.total_delta, 0))::integer as restored_handicap,
  coalesce(current_player.snooker_handicap, 0)::integer as current_handicap
from (
  select distinct on (history.player_id)
    history.player_id,
    history.season_id,
    history.previous_handicap,
    history.created_at
  from public.league_handicap_history history
  where history.change_type = 'baseline_override'
    and history.created_at >= timestamptz '2026-08-01 00:00:00+01'
    and (
      lower(coalesce(history.reason, '')) like '%opening reset:%'
      or lower(coalesce(history.reason, '')) = '2026 premier league agm reset: elo 1000 and handicap 0.'
    )
  order by history.player_id, history.created_at asc, history.id asc
) reset
join public.players current_player on current_player.id = reset.player_id
left join lateral (
  select event.rating_after
  from public.rating_events event
  where event.player_id = reset.player_id
    and event.created_at <= reset.created_at
  order by event.created_at desc, event.id desc
  limit 1
) last_event on true
left join lateral (
  select
    count(*)::integer as rated_frames,
    max(greatest(event.rating_before, event.rating_after))::integer as peak_rating
  from public.rating_events event
  where event.player_id = reset.player_id
    and event.created_at <= reset.created_at
) event_summary on true
left join lateral (
  select coalesce(sum(history.delta), 0)::integer as total_delta
  from public.league_handicap_history history
  where history.player_id = reset.player_id
    and history.created_at > reset.created_at
    and coalesce(history.reason, '') not like 'Premier League EGM Proposal 2 adopted:%'
) later_handicap_changes on true;

-- Some legitimate results may have been recorded after the opening reset. Keep
-- their recorded Elo movements, but rebuild their before/after values from the
-- restored baseline so the rating-event audit trail remains continuous.
create temporary table proposal_two_shifted_events on commit drop as
select
  event.id,
  plan.player_id,
  (
    plan.baseline_elo
    + coalesce(
        sum(event.rating_delta) over (
          partition by event.player_id
          order by event.created_at, event.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      )
  )::integer as shifted_rating_before,
  (
    plan.baseline_elo
    + sum(event.rating_delta) over (
        partition by event.player_id
        order by event.created_at, event.id
        rows between unbounded preceding and current row
      )
  )::integer as shifted_rating_after
from proposal_two_restore_plan plan
join public.rating_events event on event.player_id = plan.player_id
where event.created_at > plan.reset_at;

update public.rating_events event
set rating_before = shifted.shifted_rating_before,
    rating_after = shifted.shifted_rating_after
from proposal_two_shifted_events shifted
where event.id = shifted.id;

update public.players player
set rating_snooker = coalesce(later_events.latest_rating, plan.baseline_elo),
    peak_rating_snooker = greatest(
      plan.baseline_peak_elo,
      coalesce(later_events.peak_rating, plan.baseline_elo)
    ),
    rated_matches_snooker = plan.baseline_rated_frames + coalesce(later_events.rated_frames, 0),
    snooker_handicap = plan.restored_handicap,
    snooker_handicap_base = plan.restored_handicap
from proposal_two_restore_plan plan
left join lateral (
  select
    (array_agg(event.rating_after order by event.created_at desc, event.id desc))[1]::integer as latest_rating,
    max(greatest(event.rating_before, event.rating_after))::integer as peak_rating,
    count(*)::integer as rated_frames
  from public.rating_events event
  where event.player_id = plan.player_id
    and event.created_at > plan.reset_at
) later_events on true
where player.id = plan.player_id;

insert into public.league_handicap_history (
  player_id,
  season_id,
  change_type,
  delta,
  previous_handicap,
  new_handicap,
  reason
)
select
  plan.player_id,
  plan.season_id,
  'baseline_override',
  plan.restored_handicap - plan.current_handicap,
  plan.current_handicap,
  plan.restored_handicap,
  'Premier League EGM Proposal 2 adopted: restored the validated pre-reset Elo and handicap while preserving later rating activity.'
from proposal_two_restore_plan plan
where not exists (
  select 1
  from public.league_handicap_history history
  where history.player_id = plan.player_id
    and history.change_type = 'baseline_override'
    and history.reason like 'Premier League EGM Proposal 2 adopted:%'
);

update public.league_seasons
set handicap_enabled = true,
    handicap_max_start = 40,
    handicap_review_interval_weeks = 4,
    rating_tracking_enabled = true
where lower(name) like '%premier league%'
  and (name like '%2026/2027%' or name like '%2026-27%');

comment on column public.league_seasons.handicap_review_interval_weeks is
  'Normal interval between formal handicap reviews. The 2026/27 Premier League has an adopted initial phase of weekly reviews for its first four fixture weeks.';

commit;

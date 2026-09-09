-- Apply the Proposal 2 review timetable automatically when the final fixture in
-- a due Premier League week is completed: weeks 1-4, then weeks 8, 12, 16, etc.

update public.league_seasons
set handicap_enabled = true,
    handicap_max_start = 40,
    handicap_review_interval_weeks = 4,
    rating_tracking_enabled = true
where lower(name) like '%premier league%'
  and (name like '%2026/2027%' or name like '%2026-27%');

create table if not exists public.league_handicap_reviews (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  week_no integer not null check (week_no > 0),
  trigger_fixture_id uuid null references public.league_fixtures(id) on delete set null,
  status text not null default 'complete' check (status in ('complete')),
  reviewed_player_count integer not null default 0,
  changed_player_count integer not null default 0,
  completed_at timestamptz not null default now(),
  unique (season_id, week_no)
);

alter table public.league_handicap_reviews enable row level security;

comment on table public.league_handicap_reviews is
  'One automatic Proposal 2 handicap review per scheduled Premier League review week.';

create or replace function public.apply_due_premier_handicap_review(p_fixture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_row public.league_fixtures%rowtype;
  season_row public.league_seasons%rowtype;
  review_id uuid;
  reviewed_count integer := 0;
  changed_count integer := 0;
begin
  select * into fixture_row
  from public.league_fixtures
  where id = p_fixture_id;

  if fixture_row.id is null or fixture_row.status <> 'complete' or fixture_row.week_no is null then
    return jsonb_build_object('applied', false, 'reason', 'fixture_not_complete');
  end if;

  select * into season_row
  from public.league_seasons
  where id = fixture_row.season_id;

  if season_row.id is null
     or season_row.handicap_enabled is not true
     or lower(coalesce(season_row.name, '')) not like '%premier league%'
     or not (season_row.name like '%2026/2027%' or season_row.name like '%2026-27%') then
    return jsonb_build_object('applied', false, 'reason', 'not_proposal_two_premier');
  end if;

  if not (fixture_row.week_no between 1 and 4 or fixture_row.week_no % 4 = 0) then
    return jsonb_build_object('applied', false, 'reason', 'review_not_due');
  end if;

  if exists (
    select 1
    from public.league_fixtures
    where season_id = fixture_row.season_id
      and week_no = fixture_row.week_no
      and status <> 'complete'
  ) then
    return jsonb_build_object('applied', false, 'reason', 'week_not_complete');
  end if;

  insert into public.league_handicap_reviews (
    season_id,
    week_no,
    trigger_fixture_id
  ) values (
    fixture_row.season_id,
    fixture_row.week_no,
    fixture_row.id
  )
  on conflict (season_id, week_no) do nothing
  returning id into review_id;

  if review_id is null then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;

  select count(distinct member.player_id)::integer into reviewed_count
  from public.league_team_members member
  join public.players player on player.id = member.player_id
  where member.season_id = fixture_row.season_id
    and coalesce(player.is_archived, false) = false;

  with targets as (
    select distinct
      player.id as player_id,
      coalesce(player.snooker_handicap, 0)::integer as previous_handicap,
      (
        round((((1000 - coalesce(player.rating_snooker, 1000))::numeric / 5) / 4)) * 4
      )::integer as target_handicap,
      coalesce(player.rating_snooker, 1000)::integer as rating
    from public.league_team_members member
    join public.players player on player.id = member.player_id
    where member.season_id = fixture_row.season_id
      and coalesce(player.is_archived, false) = false
  ),
  changed as (
    update public.players player
    set snooker_handicap = target.target_handicap
    from targets target
    where player.id = target.player_id
      and target.previous_handicap <> target.target_handicap
    returning player.id, target.previous_handicap, target.target_handicap, target.rating
  ),
  history as (
    insert into public.league_handicap_history (
      player_id,
      season_id,
      fixture_id,
      change_type,
      delta,
      previous_handicap,
      new_handicap,
      reason
    )
    select
      changed.id,
      fixture_row.season_id,
      fixture_row.id,
      'auto_result',
      changed.target_handicap - changed.previous_handicap,
      changed.previous_handicap,
      changed.target_handicap,
      format(
        'Automatic Proposal 2 handicap review after Premier League fixture week %s (Elo %s).',
        fixture_row.week_no,
        changed.rating
      )
    from changed
    returning id
  )
  select count(*)::integer into changed_count from history;

  update public.league_handicap_reviews
  set reviewed_player_count = reviewed_count,
      changed_player_count = changed_count,
      completed_at = now()
  where id = review_id;

  return jsonb_build_object(
    'applied', true,
    'weekNo', fixture_row.week_no,
    'reviewed', reviewed_count,
    'changed', changed_count
  );
end;
$$;

revoke all on function public.apply_due_premier_handicap_review(uuid) from public;
revoke all on function public.apply_due_premier_handicap_review(uuid) from anon;
revoke all on function public.apply_due_premier_handicap_review(uuid) from authenticated;
grant execute on function public.apply_due_premier_handicap_review(uuid) to service_role;

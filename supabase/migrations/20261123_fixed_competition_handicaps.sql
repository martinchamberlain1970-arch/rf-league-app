begin;

create table if not exists public.competition_handicap_locks (
  competition_id uuid primary key references public.competitions(id) on delete cascade,
  locked_at timestamptz not null,
  captured_at timestamptz not null default now()
);
create table if not exists public.competition_fixed_handicaps (
  competition_id uuid not null references public.competition_handicap_locks(competition_id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  handicap integer not null,
  division_one boolean not null,
  primary key (competition_id, player_id)
);
alter table public.competition_handicap_locks enable row level security;
alter table public.competition_fixed_handicaps enable row level security;
revoke all on public.competition_handicap_locks, public.competition_fixed_handicaps from anon, authenticated;
grant select, insert on public.competition_handicap_locks, public.competition_fixed_handicaps to service_role;

-- The first schedule or match read after the deadline can capture the same
-- cutoff values. The first later history row holds the value before its change.
create or replace function public.lock_2026_competition_handicaps(p_competition_id uuid)
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare
  deadline timestamptz;
  adjustment integer;
begin
  select locked_at into deadline from public.competition_handicap_locks where competition_id = p_competition_id;
  if found then return deadline; end if;
  select signup_deadline into deadline
    from public.competitions
    where id = p_competition_id and not is_archived and not is_completed
      and name in ('Lee Ford (Singles Handicap) - 2026/2027', 'Handicap Doubles - 2026/2027')
    for update;
  if not found or deadline is null or now() <= deadline then return null; end if;
  -- Check again after taking the lock, in case another caller has captured it.
  if exists (select 1 from public.competition_handicap_locks where competition_id = p_competition_id) then
    return (select locked_at from public.competition_handicap_locks where competition_id = p_competition_id);
  end if;
  select b.adjustment into adjustment from public.competition_handicap_ballots b
    where b.slug = 'competition-handicaps-2026-27' and b.phase = 'complete' and b.method = 'p2' and b.timing = 'p3';
  if adjustment is distinct from 8 then return null; end if;
  -- The recorded placeholder was never an open entry window.
  if deadline <= '2026-11-23 23:59:00+00' then return null; end if;

  insert into public.competition_handicap_locks(competition_id, locked_at) values (p_competition_id, deadline);
  insert into public.competition_fixed_handicaps(competition_id, player_id, handicap, division_one)
  with divisions as (
    select m.player_id,
      bool_or(s.name ~* 'division[[:space:]]+(1|one)([^[:alnum:]]|$)') as division_one,
      bool_or(s.name ~* 'premier') as premier
    from public.league_team_members m
    join public.league_seasons s on s.id = m.season_id and s.is_active and s.is_published
    join public.league_teams t on t.id = m.team_id and t.is_active
    group by m.player_id
  ), inputs as (
    select p.id, coalesce(d.division_one and not d.premier, false) as division_one,
      coalesce(next_elo.rating_before, p.rating_snooker, 1000) as cutoff_elo,
      coalesce(next_handicap.previous_handicap, p.snooker_handicap, p.snooker_handicap_base, 0) as cutoff_handicap
    from public.players p left join divisions d on d.player_id = p.id
    left join lateral (
      select e.rating_before from public.rating_events e
      where e.player_id = p.id and e.created_at > deadline
      order by e.created_at, e.id limit 1
    ) next_elo on true
    left join lateral (
      select h.previous_handicap from public.league_handicap_history h
      where h.player_id = p.id and h.created_at > deadline
      order by h.created_at, h.id limit 1
    ) next_handicap on true
    where not p.is_archived
  )
  select p_competition_id, id,
    case when division_one then (round((1000 - cutoff_elo)::numeric / 20) * 4)::integer + adjustment
      else cutoff_handicap end,
    division_one from inputs;
  return deadline;
end $$;

revoke all on function public.lock_2026_competition_handicaps(uuid) from public, anon, authenticated;
grant execute on function public.lock_2026_competition_handicaps(uuid) to service_role;

-- Keep legacy date-only deadlines inclusive, and enforce an explicit time when supplied.
create or replace function public.enforce_competition_signup_window()
returns trigger language plpgsql as $$
declare
  v_open boolean;
  v_deadline timestamptz;
  v_competition_name text;
begin
  select c.signup_open, c.signup_deadline, c.name into v_open, v_deadline, v_competition_name
    from public.competitions c where c.id = new.competition_id;
  if v_open is distinct from true then raise exception 'Sign-ups are closed for this competition'; end if;
  if v_deadline is not null and (
    case when v_competition_name like '% - 2026/2027' then now() > v_deadline
      when (v_deadline at time zone 'UTC')::time = time '00:00' then current_date > v_deadline::date
      else now() > v_deadline end
  ) then raise exception 'Sign-up deadline has passed for this competition'; end if;
  return new;
end $$;
commit;

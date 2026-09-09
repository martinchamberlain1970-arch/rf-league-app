-- Frozen, team-by-team confirmation of the restored 2026/27 Premier League
-- handicaps. Run this only after the Proposal 2 restoration migration.

create table if not exists public.league_handicap_confirmation_rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  slug text not null unique,
  title text not null,
  statement text not null,
  is_open boolean not null default true,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_handicap_confirmation_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.league_handicap_confirmation_rounds(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_name text not null,
  elo_rating integer not null,
  handicap integer not null,
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  unique (round_id, team_id, player_id)
);

create table if not exists public.league_handicap_team_confirmations (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.league_handicap_confirmation_rounds(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete restrict,
  representative_player_id uuid not null references public.players(id) on delete restrict,
  representative_name text not null,
  representative_role text not null check (representative_role in ('captain', 'vice_captain')),
  attestation_text text not null,
  confirmed_at timestamptz not null default now(),
  unique (round_id, team_id)
);

alter table public.league_handicap_confirmation_rounds enable row level security;
alter table public.league_handicap_confirmation_players enable row level security;
alter table public.league_handicap_team_confirmations enable row level security;

comment on table public.league_handicap_confirmation_players is
  'Immutable player and handicap snapshot shown to Premier team captains for pre-season confirmation.';

comment on table public.league_handicap_team_confirmations is
  'One confirmation per Premier League team, submitted by its registered captain or vice-captain.';

do $$
begin
  if not exists (
    select 1
    from public.league_handicap_history
    where reason like 'Premier League EGM Proposal 2 adopted:%'
  ) then
    raise exception using
      message = 'Premier handicap snapshot stopped safely because the Proposal 2 restoration has not been recorded.',
      hint = 'Run 20260909_apply_premier_handicap_proposal_two.sql first, verify the restored values, then run this migration.';
  end if;
end $$;

with premier_season as (
  select id
  from public.league_seasons
  where lower(name) like '%premier league%'
    and (name like '%2026/2027%' or name like '%2026-27%')
  order by created_at desc
  limit 1
)
insert into public.league_handicap_confirmation_rounds (season_id, slug, title, statement, is_open)
select
  id,
  'premier-2026-27-restored-handicaps',
  'Premier League Handicaps 2026/27',
  'I confirm on behalf of my Premier League team that I have reviewed the published pre-season handicap list and, to the best of my knowledge, the players and handicaps shown are correct. I understand that this confirmation is for factual errors only and that any suspected error must be reported directly to the League Secretary.',
  true
from premier_season
on conflict (slug) do update set
  title = excluded.title,
  statement = excluded.statement,
  updated_at = now();

insert into public.league_handicap_confirmation_players (
  round_id,
  team_id,
  player_id,
  player_name,
  elo_rating,
  handicap,
  is_captain,
  is_vice_captain
)
select
  confirmation_round.id,
  member.team_id,
  player.id,
  coalesce(nullif(trim(player.full_name), ''), player.display_name),
  coalesce(player.rating_snooker, 1000)::integer,
  coalesce(player.snooker_handicap, 0)::integer,
  coalesce(member.is_captain, false),
  coalesce(member.is_vice_captain, false)
from public.league_handicap_confirmation_rounds confirmation_round
join public.league_team_members member on member.season_id = confirmation_round.season_id
join public.league_teams team on team.id = member.team_id and team.is_active = true
join public.players player on player.id = member.player_id
where confirmation_round.slug = 'premier-2026-27-restored-handicaps'
  and not exists (
    select 1
    from public.league_handicap_confirmation_players existing
    where existing.round_id = confirmation_round.id
  )
order by team.name, player.display_name;

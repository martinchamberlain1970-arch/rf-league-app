create table if not exists public.league_handicap_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  season_id uuid null references public.league_seasons(id) on delete set null,
  fixture_id uuid null references public.league_fixtures(id) on delete set null,
  change_type text not null check (change_type in ('auto_result','manual_adjustment','manual_override','baseline_override')),
  delta integer not null default 0,
  previous_handicap integer not null,
  new_handicap integer not null,
  reason text null,
  changed_by_user_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists league_handicap_history_player_created_idx
  on public.league_handicap_history(player_id, created_at desc);

create index if not exists league_handicap_history_fixture_idx
  on public.league_handicap_history(fixture_id);

alter table public.league_handicap_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'league_handicap_history'
      and policyname = 'league_handicap_history_read_authenticated'
  ) then
    create policy league_handicap_history_read_authenticated
      on public.league_handicap_history
      for select
      to authenticated
      using (true);
  end if;
end $$;

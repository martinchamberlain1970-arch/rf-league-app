create extension if not exists pgcrypto;

create table if not exists public.external_player_links (
  id uuid primary key default gen_random_uuid(),
  league_player_id uuid not null references public.players(id) on delete cascade,
  source_app text not null check (source_app in ('league', 'club')),
  source_player_id text not null,
  created_at timestamptz not null default now(),
  unique (source_app, source_player_id),
  unique (league_player_id, source_app)
);

create index if not exists external_player_links_league_player_idx
  on public.external_player_links (league_player_id);

create table if not exists public.rating_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  opponent_player_id uuid null references public.players(id) on delete set null,
  source_app text not null check (source_app in ('league', 'club')),
  source_result_id text not null,
  event_type text not null check (event_type in ('result_win', 'result_loss', 'result_draw')),
  rating_before integer not null,
  rating_after integer not null,
  rating_delta integer not null,
  notes text null,
  created_at timestamptz not null default now(),
  unique (source_app, source_result_id, player_id)
);

create index if not exists rating_events_player_idx
  on public.rating_events (player_id, created_at desc);

create index if not exists rating_events_source_idx
  on public.rating_events (source_app, source_result_id);

create table if not exists public.rating_result_receipts (
  id uuid primary key default gen_random_uuid(),
  source_app text not null check (source_app in ('league', 'club')),
  source_result_id text not null,
  winner_player_id uuid null references public.players(id) on delete cascade,
  loser_player_id uuid null references public.players(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  error_message text null,
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (source_app, source_result_id)
);

create index if not exists rating_result_receipts_status_idx
  on public.rating_result_receipts (status, created_at desc);

alter table public.external_player_links enable row level security;
alter table public.rating_events enable row level security;
alter table public.rating_result_receipts enable row level security;

drop policy if exists external_player_links_service_only on public.external_player_links;
create policy external_player_links_service_only
on public.external_player_links
for all
to authenticated
using (false)
with check (false);

drop policy if exists rating_events_read_authenticated on public.rating_events;
create policy rating_events_read_authenticated
on public.rating_events
for select
to authenticated
using (true);

drop policy if exists rating_events_service_write on public.rating_events;
create policy rating_events_service_write
on public.rating_events
for all
to authenticated
using (false)
with check (false);

drop policy if exists rating_result_receipts_service_only on public.rating_result_receipts;
create policy rating_result_receipts_service_only
on public.rating_result_receipts
for all
to authenticated
using (false)
with check (false);

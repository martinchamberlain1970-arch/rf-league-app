-- Club-level league and competition invoicing with immutable invoice snapshots.

create extension if not exists pgcrypto;

create table if not exists public.league_invoice_batches (
  id uuid primary key default gen_random_uuid(),
  league_name text not null,
  treasurer_name text not null,
  issue_date date not null,
  due_date date not null,
  payment_instructions text,
  season_ids jsonb not null default '[]'::jsonb,
  competition_ids jsonb not null default '[]'::jsonb,
  league_team_fee_pence integer not null check (league_team_fee_pence >= 0),
  individual_fee_pence integer not null check (individual_fee_pence >= 0),
  mick_white_team_fee_pence integer not null check (mick_white_team_fee_pence >= 0),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (due_date >= issue_date)
);

create table if not exists public.league_invoices (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.league_invoice_batches(id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex') check (public_token ~ '^[a-f0-9]{48}$'),
  invoice_number text not null unique,
  location_id uuid references public.locations(id) on delete set null,
  club_name text not null,
  recipient_names jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  total_pence integer not null check (total_pence >= 0),
  status text not null default 'issued' check (status in ('issued', 'paid', 'cancelled')),
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists league_invoice_batches_created_idx
  on public.league_invoice_batches(created_at desc);

create index if not exists league_invoices_batch_idx
  on public.league_invoices(batch_id, invoice_number);

create index if not exists league_invoices_location_idx
  on public.league_invoices(location_id, created_at desc);

alter table public.league_invoice_batches enable row level security;
alter table public.league_invoices enable row level security;

drop policy if exists league_invoice_batches_manager_select on public.league_invoice_batches;
create policy league_invoice_batches_manager_select
on public.league_invoice_batches for select to authenticated
using (public.is_league_manager());

drop policy if exists league_invoices_manager_select on public.league_invoices;
create policy league_invoices_manager_select
on public.league_invoices for select to authenticated
using (public.is_league_manager());

comment on table public.league_invoice_batches is
  'League-officer generated invoice runs, including the selected seasons, competitions and fee schedule.';

comment on table public.league_invoices is
  'Immutable club invoice snapshots generated from league teams and approved competition entries.';

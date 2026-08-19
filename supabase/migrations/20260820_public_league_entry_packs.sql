-- Secure, account-free pre-season entry packs for league teams.
-- Public access is only through server routes using an unguessable token; no
-- anonymous table policy is created and submitted contact details stay private.

create extension if not exists pgcrypto;

create table if not exists public.player_private_contacts (
  player_id uuid primary key references public.players(id) on delete cascade,
  phone_number text,
  phone_share_consent boolean not null default false,
  guardian_phone text,
  source text,
  updated_at timestamptz not null default now()
);

insert into public.player_private_contacts (player_id, phone_number, phone_share_consent, source)
select id, phone_number, coalesce(phone_share_consent, false), 'legacy_player_profile'
from public.players
where phone_number is not null and btrim(phone_number) <> ''
on conflict (player_id) do update
set phone_number = excluded.phone_number,
    phone_share_consent = excluded.phone_share_consent,
    updated_at = now();

-- Contact numbers no longer live on the broadly readable player record.
update public.players
set phone_number = null,
    phone_share_consent = false
where phone_number is not null;

alter table public.player_private_contacts enable row level security;

drop policy if exists player_private_contacts_manage_league_officers on public.player_private_contacts;
create policy player_private_contacts_manage_league_officers
  on public.player_private_contacts for all to authenticated
  using (public.is_league_manager())
  with check (public.is_league_manager());

drop policy if exists player_private_contacts_read_own on public.player_private_contacts;
create policy player_private_contacts_read_own
  on public.player_private_contacts for select to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.claimed_by = auth.uid()));

drop policy if exists player_private_contacts_update_own on public.player_private_contacts;
create policy player_private_contacts_update_own
  on public.player_private_contacts for update to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.claimed_by = auth.uid()))
  with check (exists (select 1 from public.players p where p.id = player_id and p.claimed_by = auth.uid()));

comment on table public.player_private_contacts is
  'Private match-arranging contact data. Opponent access is mediated by a server route after checking an actual match relationship.';

create table if not exists public.league_entry_packs (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  contact_name text,
  contact_email text,
  contact_phone text,
  players jsonb not null default '[]'::jsonb,
  competition_notes text,
  general_notes text,
  phone_sharing_confirmed boolean not null default false,
  accuracy_confirmed boolean not null default false,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.app_users(id) on delete set null,
  review_notes text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, team_id)
);

create index if not exists league_entry_packs_status_idx
  on public.league_entry_packs(status, updated_at desc);
create index if not exists league_entry_packs_season_idx
  on public.league_entry_packs(season_id, team_id);

alter table public.league_entry_packs enable row level security;

drop policy if exists league_entry_packs_manage_league_officers on public.league_entry_packs;
create policy league_entry_packs_manage_league_officers
  on public.league_entry_packs
  for all
  to authenticated
  using (public.is_league_manager())
  with check (public.is_league_manager());

comment on table public.league_entry_packs is
  'Private team roster and competition entry submissions collected through secure public links.';
comment on column public.league_entry_packs.public_token is
  'Capability token used only in the private team URL. Never expose in public listings.';
comment on column public.league_entry_packs.players is
  'Validated roster rows containing player/guardian contact details, roles, and competition selections.';

-- Public, one-link club attestations for the expedited 2026/27 Premier League
-- handicap consultation. All reads and writes are performed by server routes
-- using the service role; no table is exposed directly to anonymous clients.

create table if not exists public.handicap_consultations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  season_label text not null,
  statement text not null,
  closes_at timestamptz,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.handicap_consultation_attestations (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.handicap_consultations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  attestor_name text not null,
  attestor_capacity text not null,
  attestation_text text not null,
  agreed boolean not null default true check (agreed = true),
  submitted_at timestamptz not null default now(),
  constraint handicap_consultation_attestations_one_per_club unique (consultation_id, location_id),
  constraint handicap_consultation_attestor_name_length check (char_length(trim(attestor_name)) between 3 and 120),
  constraint handicap_consultation_capacity_allowed check (attestor_capacity in ('captain', 'club_representative'))
);

alter table public.handicap_consultations enable row level security;
alter table public.handicap_consultation_attestations enable row level security;

comment on table public.handicap_consultations is
  'Time-limited league governance consultations published through a shared public URL.';

comment on table public.handicap_consultation_attestations is
  'One written procedural attestation per participating club. Identity is reviewed by league officers against the captains WhatsApp group.';

insert into public.handicap_consultations (slug, title, season_label, statement, closes_at, is_open)
values (
  'premier-handicap-2026-27',
  'Premier League Handicap Consultation',
  '2026/2027 season',
  'I confirm on behalf of my club that the club agrees to waive the normal 28-day submission requirement for this specific handicap decision. We agree that the proposals may be considered and voted upon before 10 September 2026, and that the resulting decision will apply to the 2026/2027 Premier League season.',
  '2026-09-07 20:00:00+01',
  true
)
on conflict (slug) do update set
  title = excluded.title,
  season_label = excluded.season_label,
  statement = excluded.statement,
  closes_at = excluded.closes_at,
  is_open = excluded.is_open,
  updated_at = now();

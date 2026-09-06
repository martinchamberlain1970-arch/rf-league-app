-- Controlled EGM attendance and ballot record for the 2026/27 Premier League
-- handicap decision. All access is through authenticated league-officer routes.

create table if not exists public.handicap_egm_meetings (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid null references public.handicap_consultations(id) on delete set null,
  slug text not null unique,
  title text not null,
  season_label text not null,
  meeting_at timestamptz,
  status text not null default 'register_open'
    check (status in ('register_open', 'round_1_open', 'round_1_closed', 'round_2_open', 'round_2_closed', 'completed')),
  runoff_proposals smallint[] not null default '{}',
  adopted_proposal smallint null check (adopted_proposal between 1 and 3),
  decision_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handicap_egm_runoff_proposal_count check (cardinality(runoff_proposals) <= 2)
);

create table if not exists public.handicap_egm_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.handicap_egm_meetings(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  representative_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handicap_egm_attendee_name_length check (char_length(trim(representative_name)) between 3 and 120),
  constraint handicap_egm_attendee_identity unique (meeting_id, location_id, representative_name)
);

create table if not exists public.handicap_egm_votes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.handicap_egm_meetings(id) on delete cascade,
  attendee_id uuid not null references public.handicap_egm_attendees(id) on delete cascade,
  round_no smallint not null check (round_no in (1, 2)),
  choice text not null check (choice in ('proposal_1', 'proposal_2', 'proposal_3', 'abstain')),
  recorded_by_user_id uuid null references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handicap_egm_one_vote_per_round unique (meeting_id, attendee_id, round_no)
);

alter table public.handicap_egm_meetings enable row level security;
alter table public.handicap_egm_attendees enable row level security;
alter table public.handicap_egm_votes enable row level security;

comment on table public.handicap_egm_meetings is
  'Officer-controlled EGM meeting state, ballot rounds and adopted Premier League handicap proposal.';
comment on table public.handicap_egm_attendees is
  'Named meeting attendees and the team/club they represent. The officer API enforces Rule 8''s maximum of two voting representatives per club.';
comment on table public.handicap_egm_votes is
  'Auditable proposal choice or abstention for each eligible attendee in each EGM ballot round.';

insert into public.handicap_egm_meetings (consultation_id, slug, title, season_label)
select id, 'premier-handicap-2026-27-egm', 'Premier League Handicap EGM', '2026/2027 season'
from public.handicap_consultations
where slug = 'premier-handicap-2026-27'
on conflict (slug) do update set
  consultation_id = excluded.consultation_id,
  title = excluded.title,
  season_label = excluded.season_label,
  updated_at = now();

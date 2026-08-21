-- One shared public competition-entry form with private, browser-held draft tokens.

create table if not exists public.public_competition_entry_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_token text not null unique check (draft_token ~ '^[a-f0-9]{48}$'),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete cascade,
  contact_name text,
  contact_phone text,
  selections jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_competition_entry_drafts_team_idx
  on public.public_competition_entry_drafts(team_id, updated_at desc);

alter table public.public_competition_entry_drafts enable row level security;

-- Public reads and writes are performed only by the server route using the
-- service role. No direct browser access is permitted to saved contact/DOB data.

alter table if exists public.competition_entries
  alter column requester_user_id drop not null;

comment on table public.public_competition_entry_drafts is
  'Private-token drafts created through the single public competition-entry form.';

-- A date-only closing date remains open for the whole of that date.
create or replace function public.enforce_competition_signup_window()
returns trigger
language plpgsql
as $$
declare
  v_open boolean;
  v_deadline timestamptz;
begin
  select c.signup_open, c.signup_deadline into v_open, v_deadline
  from public.competitions c where c.id = new.competition_id;
  if v_open is distinct from true then raise exception 'Sign-ups are closed for this competition'; end if;
  if v_deadline is not null and current_date > v_deadline::date then raise exception 'Sign-up deadline has passed for this competition'; end if;
  return new;
end;
$$;

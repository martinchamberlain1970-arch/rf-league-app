-- Allow registered EGM attendees to vote from the installed PWA or a shared
-- browser URL. Public access uses an unguessable meeting token and the confirmed
-- attendance register; submitted votes are locked to one per attendee per round.

alter table public.handicap_egm_meetings
  add column if not exists public_token text;

update public.handicap_egm_meetings
set public_token = replace(gen_random_uuid()::text, '-', '')
where public_token is null;

alter table public.handicap_egm_meetings
  alter column public_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column public_token set not null;

create unique index if not exists handicap_egm_meetings_public_token_key
  on public.handicap_egm_meetings(public_token);

alter table public.handicap_egm_votes
  add column if not exists submission_method text not null default 'officer';

alter table public.handicap_egm_votes
  drop constraint if exists handicap_egm_votes_submission_method_check;

alter table public.handicap_egm_votes
  add constraint handicap_egm_votes_submission_method_check
  check (submission_method in ('attendee', 'officer'));

comment on column public.handicap_egm_meetings.public_token is
  'Unguessable token used in the shared attendee voting URL.';
comment on column public.handicap_egm_votes.submission_method is
  'Whether the vote was submitted directly by the attendee or recorded by a league officer.';

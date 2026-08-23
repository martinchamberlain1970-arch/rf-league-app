-- Allow one distributed league-registration URL while keeping each team's
-- saved draft protected by a browser-held capability token.

alter table public.league_entry_packs
  add column if not exists common_draft_token text;

create unique index if not exists league_entry_packs_common_draft_token_uidx
  on public.league_entry_packs(common_draft_token)
  where common_draft_token is not null;

alter table public.league_entry_packs
  drop constraint if exists league_entry_packs_common_draft_token_format;

alter table public.league_entry_packs
  add constraint league_entry_packs_common_draft_token_format
  check (common_draft_token is null or common_draft_token ~ '^[a-f0-9]{48}$');

comment on column public.league_entry_packs.common_draft_token is
  'Browser-held capability token used to claim and resume a team through the shared public league-registration page.';

comment on table public.league_entry_packs is
  'League player-roster and captain-role registrations collected through the shared public team form.';

comment on column public.league_entry_packs.players is
  'Validated roster rows containing player names, junior status, and captain or vice-captain roles; private match-arranging contacts are collected separately.';

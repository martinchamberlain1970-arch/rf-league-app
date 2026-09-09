-- Record the voting basis agreed for the 2026/27 Premier League handicap EGM:
-- one vote per represented team, with every joint leader eligible for ballot 2.

alter table public.handicap_egm_meetings
  drop constraint if exists handicap_egm_runoff_proposal_count;

alter table public.handicap_egm_meetings
  add constraint handicap_egm_runoff_proposal_count
  check (cardinality(runoff_proposals) <= 3);

comment on table public.handicap_egm_attendees is
  'Named EGM voting representatives. For the 2026/27 Premier handicap EGM, the officer API permits one representative and one ballot vote per represented Premier League team.';

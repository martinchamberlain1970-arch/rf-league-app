-- Record the voting basis agreed for the 2026/27 Premier League handicap EGM:
-- one vote per represented team, with every joint leader eligible for ballot 2.

alter table public.handicap_egm_meetings
  drop constraint if exists handicap_egm_runoff_proposal_count;

alter table public.handicap_egm_meetings
  add constraint handicap_egm_runoff_proposal_count
  check (cardinality(runoff_proposals) <= 3);

-- The vote table already permits only one vote per representative per ballot.
-- Limiting the register to one representative per team therefore guarantees
-- one and only one vote per represented Premier League team in each ballot.
alter table public.handicap_egm_attendees
  drop constraint if exists handicap_egm_one_representative_per_team;

alter table public.handicap_egm_attendees
  add constraint handicap_egm_one_representative_per_team
  unique (meeting_id, team_id);

comment on table public.handicap_egm_attendees is
  'Named EGM voting representatives. For the 2026/27 Premier handicap EGM, the officer API permits one representative and one ballot vote per represented Premier League team.';

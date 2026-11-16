-- Round 1 tied 3–3. Set the fresh calculation runoff deadline; retain all votes.
update public.competition_handicap_rounds r
set closes_at = '2026-11-17 17:00:00+00'
from public.competition_handicap_ballots b
where r.ballot_id = b.id
  and b.slug = 'competition-handicaps-2026-27'
  and r.round_no = 2 and r.stage = 'calculation' and r.closed_at is null;

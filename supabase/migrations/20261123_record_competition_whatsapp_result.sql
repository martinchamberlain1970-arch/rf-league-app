-- Record the external aggregate tally without fabricating any team votes.
begin;
alter table public.competition_handicap_rounds
  add column if not exists result_source text;

do $$
declare
  b public.competition_handicap_ballots;
begin
  select * into strict b from public.competition_handicap_ballots
    where slug = 'competition-handicaps-2026-27' for update;
  if b.method is distinct from 'p2' or b.timing is distinct from 'p3'
    or (b.adjustment is not null and b.adjustment <> 8) then
    raise exception 'Ballot calculation or timing does not match the agreed decisions';
  end if;
  update public.competition_handicap_rounds
    set closed_at = '2026-11-21 17:00:00+00', closes_at = '2026-11-21 17:00:00+00',
      winner = '8', totals = '{"8":8,"12":1,"16":6}'::jsonb, result_source = 'WhatsApp poll'
    where ballot_id = b.id and stage = 'adjustment' and round_no = 4
      and cancelled_at is null and options @> array['8','12','16']::text[]
      and (closed_at is null or result_source = 'WhatsApp poll');
  if not found then raise exception 'Expected adjustment round could not be recorded safely'; end if;
  update public.competition_handicap_ballots set phase = 'complete', adjustment = 8 where id = b.id;
end $$;
commit;

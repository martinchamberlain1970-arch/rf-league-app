begin;
alter table public.competition_handicap_rounds add column if not exists cancelled_at timestamptz;
alter table public.competition_handicap_rounds add column if not exists cancellation_reason text;
do $$
declare ballot uuid; original uuid; repeat_round uuid;
begin
 select id into strict ballot from public.competition_handicap_ballots where slug='competition-handicaps-2026-27' for update;
 select id into strict original from public.competition_handicap_rounds where ballot_id=ballot and round_no=1 and stage='calculation' for update;
 select id into strict repeat_round from public.competition_handicap_rounds where ballot_id=ballot and round_no=2 and stage='calculation' for update;
 -- Do not silently discard or duplicate any newly submitted repeat votes.
 if exists(select 1 from public.competition_handicap_votes where round_id=repeat_round) then
   raise exception 'Repeat ballot has votes: reconcile before reopening the original.';
 end if;
 if (select count(*) from public.competition_handicap_votes where round_id=original)<>6 then
   raise exception 'Original vote count changed: review before reopening.';
 end if;
 if exists(select 1 from public.competition_handicap_rounds where ballot_id=ballot and round_no>2) then
   raise exception 'Later rounds exist: review before reopening.';
 end if;
 update public.competition_handicap_rounds set closed_at=coalesce(closed_at,now()),cancelled_at=now(),
  cancellation_reason='Original ballot reopened by Secretary; six original votes retained; deadline 17 November 2026 at 17:00 UK.' where id=repeat_round;
 update public.competition_handicap_rounds set closed_at=null,closed_by=null,winner=null,totals=null,
  closes_at='2026-11-17 17:00:00+00' where id=original;
 update public.competition_handicap_ballots set phase='calculation',method=null,adjustment=null,timing=null where id=ballot;
end $$;
commit;

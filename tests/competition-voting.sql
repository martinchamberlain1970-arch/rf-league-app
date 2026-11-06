-- Transaction-only integration checks. All synthetic ballots and votes are rolled back.
begin;
do $$
declare b uuid; r uuid; old_r uuid; officer uuid; captain uuid; team uuid; other_team uuid;
 ids uuid[]; opts text[]; blocked boolean; n integer;
begin
 select id into officer from public.app_users where role in ('owner','super') limit 1;
 if officer is null then raise exception 'Test needs an officer account'; end if;
 select u.id,m.team_id into captain,team from public.app_users u join public.league_team_members m on m.player_id=u.linked_player_id join public.competition_handicap_voters v on v.team_id=m.team_id where m.is_captain or m.is_vice_captain limit 1;
 select array_agg(team_id) into ids from (select team_id from public.competition_handicap_voters order by team_id limit 7) t;
 select t into other_team from unnest(ids) t where t<>team and not exists(select 1 from public.league_team_members m join public.app_users u on u.linked_player_id=m.player_id where u.id=captain and m.team_id=t and (m.is_captain or m.is_vice_captain)) limit 1;
 insert into public.competition_handicap_ballots(slug) values('test-only-rollback-'||gen_random_uuid()) returning id into b;
 insert into public.competition_handicap_voters select b,v.team_id,v.team_name from public.competition_handicap_voters v where v.ballot_id=(select id from public.competition_handicap_ballots where slug='competition-handicaps-2026-27');
 insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options) values(b,1,'calculation',array['p1','p2']) returning id into r;
 blocked:=false; begin perform public.open_competition_timing_vote(b,officer); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Premature timing allowed'; end if;
 blocked:=false; begin perform public.close_competition_handicap_round(r,officer); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Empty vote accepted'; end if;
 blocked:=false; begin perform public.cast_competition_handicap_vote(r,other_team,'p1',captain); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Other-team vote allowed'; end if;
 blocked:=false; begin perform public.cast_competition_handicap_vote(r,team,'16',captain); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Invalid option accepted'; end if;
 perform public.cast_competition_handicap_vote(r,team,'p2',captain);
 blocked:=false; begin perform public.cast_competition_handicap_vote(r,team,'p1',captain); exception when unique_violation then blocked:=true; end;
 if not blocked then raise exception 'Duplicate vote accepted'; end if;
 perform public.close_competition_handicap_round(r,officer);
 if (select method from public.competition_handicap_ballots where id=b)<>'p2' then raise exception 'P2 not selected'; end if;
 blocked:=false; begin perform public.cast_competition_handicap_vote(r,other_team,'p1',captain); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Closed round accepted a vote'; end if;
 select id into r from public.competition_handicap_rounds where ballot_id=b and closed_at is null;
 -- 3/2/1 substantive votes, one abstention: no majority. Runoff must be +8 and +12.
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id)
 select r,b,ids[i],case when i<=3 then '8' when i<=5 then '12' when i=6 then '16' else 'abstain' end,officer from generate_series(1,7) i;
 perform public.close_competition_handicap_round(r,officer);
 select id,options into r,opts from public.competition_handicap_rounds where ballot_id=b and closed_at is null;
 if cardinality(opts)<>2 or not opts@>array['8','12'] then raise exception 'Wrong runoff candidates: %',opts; end if;
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id) values(r,b,ids[1],'8',officer),(r,b,ids[2],'12',officer);
 perform public.close_competition_handicap_round(r,officer);
 select id into r from public.competition_handicap_rounds where ballot_id=b and closed_at is null;
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id) values(r,b,ids[1],'12',officer),(r,b,ids[2],'12',officer),(r,b,ids[3],'8',officer),(r,b,ids[4],'abstain',officer);
 perform public.close_competition_handicap_round(r,officer);
 if not exists(select 1 from public.competition_handicap_ballots where id=b and adjustment=12 and phase='timing_ready') then raise exception 'Adjustment not settled'; end if;
 if exists(select 1 from public.competition_handicap_rounds where ballot_id=b and closed_at is null) then raise exception 'Timing opened without officer'; end if;
 perform public.open_competition_timing_vote(b,officer);
 blocked:=false; begin perform public.open_competition_timing_vote(b,officer); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Timing opened twice'; end if;
 select id into r from public.competition_handicap_rounds where ballot_id=b and closed_at is null;
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id) values(r,b,ids[1],'p4',officer),(r,b,ids[2],'p3',officer),(r,b,ids[3],'p4',officer);
 perform public.close_competition_handicap_round(r,officer);
 if not exists(select 1 from public.competition_handicap_ballots where id=b and timing='p4' and phase='complete') then raise exception 'Timing not settled'; end if;
 -- Independent P1 route and tie at second place.
 insert into public.competition_handicap_ballots(slug) values('test-only-rollback-'||gen_random_uuid()) returning id into b;
 insert into public.competition_handicap_voters select b,v.team_id,v.team_name from public.competition_handicap_voters v where v.ballot_id=(select id from public.competition_handicap_ballots where slug='competition-handicaps-2026-27');
 insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options) values(b,1,'calculation',array['p1','p2']) returning id into r;
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id) values(r,b,ids[1],'p1',officer),(r,b,ids[2],'abstain',officer);
 perform public.close_competition_handicap_round(r,officer);
 if not exists(select 1 from public.competition_handicap_ballots where id=b and method='p1' and adjustment=0 and phase='timing_ready') then raise exception 'P1 should skip adjustment'; end if;
 insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options) values(b,2,'adjustment',array['8','12','16']) returning id into r;
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id) values(r,b,ids[1],'8',officer),(r,b,ids[2],'8',officer),(r,b,ids[3],'12',officer),(r,b,ids[4],'16',officer);
 perform public.close_competition_handicap_round(r,officer);
 select options into opts from public.competition_handicap_rounds where ballot_id=b and closed_at is null;
 if cardinality(opts)<>3 then raise exception 'Tie at cutoff incorrectly excluded'; end if;
 if has_function_privilege('authenticated','public.cast_competition_handicap_vote(uuid,uuid,text,uuid)','execute') or has_function_privilege('anon','public.close_competition_handicap_round(uuid,uuid)','execute') then raise exception 'RPC access too broad'; end if;
 if exists(select 1 from pg_tables where schemaname='public' and tablename like 'competition_handicap_%' and not rowsecurity) then raise exception 'RLS disabled'; end if;
end $$;
rollback;
select 'PASS: one vote per team, authority, invalid/closed ballots, P1/P2, majority, abstention, runoff, ties, timing gate, RLS; synthetic records rolled back' as result;

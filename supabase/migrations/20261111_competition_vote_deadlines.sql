begin;
alter table public.competition_handicap_rounds add column if not exists closes_at timestamptz;
drop index public.competition_handicap_one_open_round;
create unique index competition_handicap_one_open_stage on public.competition_handicap_rounds(ballot_id,stage) where closed_at is null;
update public.competition_handicap_rounds set closes_at='2026-11-13 17:00:00+00'
where round_no=1 and closed_at is null and ballot_id in (select id from public.competition_handicap_ballots where slug='competition-handicaps-2026-27');
create or replace function public.cast_competition_handicap_vote(p_round uuid,p_team uuid,p_choice text,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.competition_handicap_rounds;
begin
 -- Same row lock as round closure: a concurrent vote is either counted or rejected.
 select * into r from public.competition_handicap_rounds where id=p_round for update;
 if not found or r.closed_at is not null then raise exception 'This ballot is no longer open. Refresh the page.'; end if;
 if r.closes_at is not null and now() >= r.closes_at then raise exception 'The voting deadline has passed.'; end if;
 if p_choice <> 'abstain' and not p_choice=any(r.options) then raise exception 'Choose an available option.'; end if;
 if not exists(select 1 from public.competition_handicap_voters where ballot_id=r.ballot_id and team_id=p_team) then raise exception 'Team is not eligible.'; end if;
 -- Defence in depth: a signed-in captain/vice-captain must represent this exact team.
 if not exists(select 1 from public.app_users u join public.league_team_members m on m.player_id=u.linked_player_id
   where u.id=p_actor and m.team_id=p_team and (m.is_captain or m.is_vice_captain)) then raise exception 'Only the team captain or vice-captain can vote.'; end if;
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id) values(r.id,r.ballot_id,p_team,p_choice,p_actor);
end $$;

create or replace function public.close_competition_handicap_round(p_round uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.competition_handicap_rounds; counts jsonb; valid integer; best integer; cutoff integer;
 winner_choice text; next_options text[]; next_stage text;
begin
 if p_actor is not null and not exists(select 1 from public.app_users where id=p_actor and role in ('owner','super','league_secretary','league_chairman')) then raise exception 'Only the Secretary, Chairman or System Owner can manage ballots.'; end if;
 select * into r from public.competition_handicap_rounds where id=p_round;
 perform 1 from public.competition_handicap_ballots where id=r.ballot_id for update;
 select * into r from public.competition_handicap_rounds where id=p_round for update;
 if not found or r.closed_at is not null then raise exception 'This round has already closed.'; end if;
 if p_actor is null and (r.closes_at is null or now() < r.closes_at) then raise exception 'The voting deadline has not passed.'; end if;
 select jsonb_object_agg(o,n), coalesce(sum(n) filter(where o<>'abstain'),0),coalesce(max(n) filter(where o<>'abstain'),0)
 into counts,valid,best from (select o,(select count(*) from public.competition_handicap_votes v where v.round_id=r.id and v.choice=o) as n from unnest(r.options||array['abstain']) o) tally;
 if valid=0 then
  update public.competition_handicap_rounds set closed_at=now(),closed_by=p_actor,totals=counts where id=r.id;
  return;
 end if;
 select o into winner_choice from unnest(r.options) o where (counts->>o)::integer > valid/2;
 update public.competition_handicap_rounds set closed_at=now(),closed_by=p_actor,winner=winner_choice,totals=counts where id=r.id;
 if winner_choice is null then
   -- Top two plus any tie at the cutoff. Never break a tie by option order.
   select n into cutoff from (select (counts->>o)::integer n from unnest(r.options) o order by n desc offset 1 limit 1) t;
   select array_agg(o order by o) into next_options from unnest(r.options) o where (counts->>o)::integer >= cutoff;
   next_stage:=r.stage;
 elsif r.stage='calculation' then
   update public.competition_handicap_ballots set method=winner_choice,
    adjustment=case when winner_choice='p1' then 0 else null end,phase='timing' where id=r.ballot_id;
   insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options,closes_at)
   select r.ballot_id,coalesce(max(round_no),0)+1,'timing',array['p3','p4'],case when now() < '2026-11-15 17:00:00+00'::timestamptz then '2026-11-15 17:00:00+00'::timestamptz else null end
   from public.competition_handicap_rounds where ballot_id=r.ballot_id;
   if winner_choice='p2' then next_options:=array['8','12','16']; next_stage:='adjustment'; end if;
 elsif r.stage='adjustment' then
   update public.competition_handicap_ballots set adjustment=winner_choice::integer where id=r.ballot_id;
 else
   update public.competition_handicap_ballots set timing=winner_choice where id=r.ballot_id;
 end if;
 if next_options is not null then
   insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options,closes_at)
   select r.ballot_id,coalesce(max(round_no),0)+1,next_stage,next_options,
    case when winner_choice='p2' and r.stage='calculation' and now() < '2026-11-15 17:00:00+00'::timestamptz then '2026-11-15 17:00:00+00'::timestamptz else null end
   from public.competition_handicap_rounds where ballot_id=r.ballot_id;
 end if;
update public.competition_handicap_ballots set phase='complete' where id=r.ballot_id and method is not null and adjustment is not null and timing is not null;
end $$;


create or replace function public.process_competition_vote_deadlines() returns void
language plpgsql security definer set search_path=public as $$
declare due record;
begin
 for due in select id from public.competition_handicap_rounds
   where closed_at is null and closes_at <= now() order by ballot_id,round_no
 loop
   -- Another reader or cron may already have processed the same deadline.
   perform 1 from public.competition_handicap_ballots b join public.competition_handicap_rounds r on r.ballot_id=b.id where r.id=due.id for update of b;
   if exists(select 1 from public.competition_handicap_rounds where id=due.id and closed_at is null) then
    perform public.close_competition_handicap_round(due.id,null);
   end if;
 end loop;
end $$;
revoke all on function public.process_competition_vote_deadlines() from public,anon,authenticated;
grant execute on function public.process_competition_vote_deadlines() to service_role;
commit;

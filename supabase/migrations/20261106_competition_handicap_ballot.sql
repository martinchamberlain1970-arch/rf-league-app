-- Separate from the historical Premier EGM. Each round has one immutable vote per team.
begin;
create table public.competition_handicap_ballots (
 id uuid primary key default gen_random_uuid(), slug text unique not null,
 phase text not null default 'calculation' check (phase in ('calculation','adjustment','timing_ready','timing','complete')),
 method text check (method in ('p1','p2')), adjustment integer check (adjustment in (0,8,12,16)),
 timing text check (timing in ('p3','p4')), created_at timestamptz not null default now()
);
create table public.competition_handicap_voters (
 ballot_id uuid not null references public.competition_handicap_ballots(id),
 team_id uuid not null references public.league_teams(id), team_name text not null,
 primary key(ballot_id,team_id)
);
create table public.competition_handicap_rounds (
 id uuid primary key default gen_random_uuid(), ballot_id uuid not null references public.competition_handicap_ballots(id),
 round_no integer not null, stage text not null check(stage in ('calculation','adjustment','timing')),
 options text[] not null, opened_at timestamptz not null default now(), closed_at timestamptz,
 closed_by uuid references auth.users(id), winner text, totals jsonb,
 unique(ballot_id,round_no), unique(id,ballot_id)
);
create unique index competition_handicap_one_open_round on public.competition_handicap_rounds(ballot_id) where closed_at is null;
create table public.competition_handicap_votes (
 round_id uuid not null, ballot_id uuid not null, team_id uuid not null,
 choice text not null, voter_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(round_id,team_id),
 foreign key(round_id,ballot_id) references public.competition_handicap_rounds(id,ballot_id),
 foreign key(ballot_id,team_id) references public.competition_handicap_voters(ballot_id,team_id)
);
alter table public.competition_handicap_ballots enable row level security;
alter table public.competition_handicap_voters enable row level security;
alter table public.competition_handicap_rounds enable row level security;
alter table public.competition_handicap_votes enable row level security;
revoke all on public.competition_handicap_ballots,public.competition_handicap_voters,public.competition_handicap_rounds,public.competition_handicap_votes from anon,authenticated;
grant all on public.competition_handicap_ballots,public.competition_handicap_voters,public.competition_handicap_rounds,public.competition_handicap_votes to service_role;

create function public.cast_competition_handicap_vote(p_round uuid,p_team uuid,p_choice text,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.competition_handicap_rounds;
begin
 -- Same row lock as round closure: a concurrent vote is either counted or rejected.
 select * into r from public.competition_handicap_rounds where id=p_round for update;
 if not found or r.closed_at is not null then raise exception 'This ballot is no longer open. Refresh the page.'; end if;
 if p_choice <> 'abstain' and not p_choice=any(r.options) then raise exception 'Choose an available option.'; end if;
 if not exists(select 1 from public.competition_handicap_voters where ballot_id=r.ballot_id and team_id=p_team) then raise exception 'Team is not eligible.'; end if;
 -- Defence in depth: a signed-in captain/vice-captain must represent this exact team.
 if not exists(select 1 from public.app_users u join public.league_team_members m on m.player_id=u.linked_player_id
   where u.id=p_actor and m.team_id=p_team and (m.is_captain or m.is_vice_captain)) then raise exception 'Only the team captain or vice-captain can vote.'; end if;
 insert into public.competition_handicap_votes(round_id,ballot_id,team_id,choice,voter_id) values(r.id,r.ballot_id,p_team,p_choice,p_actor);
end $$;

create function public.close_competition_handicap_round(p_round uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.competition_handicap_rounds; counts jsonb; valid integer; best integer; cutoff integer;
 winner_choice text; next_options text[]; next_stage text;
begin
 if not exists(select 1 from public.app_users where id=p_actor and role in ('owner','super','league_secretary','league_chairman')) then raise exception 'Only the Secretary, Chairman or System Owner can manage ballots.'; end if;
 select * into r from public.competition_handicap_rounds where id=p_round for update;
 if not found or r.closed_at is not null then raise exception 'This round has already closed.'; end if;
 perform 1 from public.competition_handicap_ballots where id=r.ballot_id for update;
 select jsonb_object_agg(o,n), coalesce(sum(n) filter(where o<>'abstain'),0),coalesce(max(n) filter(where o<>'abstain'),0)
 into counts,valid,best from (select o,(select count(*) from public.competition_handicap_votes v where v.round_id=r.id and v.choice=o) as n from unnest(r.options||array['abstain']) o) tally;
 if valid=0 then raise exception 'No substantive votes have been cast. Keep the round open; abstentions alone cannot decide it.'; end if;
 select o into winner_choice from unnest(r.options) o where (counts->>o)::integer > valid/2;
 update public.competition_handicap_rounds set closed_at=now(),closed_by=p_actor,winner=winner_choice,totals=counts where id=r.id;
 if winner_choice is null then
   -- Top two plus any tie at the cutoff. Never break a tie by option order.
   select n into cutoff from (select (counts->>o)::integer n from unnest(r.options) o order by n desc offset 1 limit 1) t;
   select array_agg(o order by o) into next_options from unnest(r.options) o where (counts->>o)::integer >= cutoff;
   next_stage:=r.stage;
 elsif r.stage='calculation' then
   update public.competition_handicap_ballots set method=winner_choice,adjustment=case when winner_choice='p1' then 0 else null end,
    phase=case when winner_choice='p1' then 'timing_ready' else 'adjustment' end where id=r.ballot_id;
   if winner_choice='p2' then next_options:=array['8','12','16']; next_stage:='adjustment'; end if;
 elsif r.stage='adjustment' then
   update public.competition_handicap_ballots set adjustment=winner_choice::integer,phase='timing_ready' where id=r.ballot_id;
 else
   update public.competition_handicap_ballots set timing=winner_choice,phase='complete' where id=r.ballot_id;
 end if;
 if next_options is not null then
   insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options) values(r.ballot_id,r.round_no+1,next_stage,next_options);
 end if;
end $$;

create function public.open_competition_timing_vote(p_ballot uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare b public.competition_handicap_ballots;
begin
 if not exists(select 1 from public.app_users where id=p_actor and role in ('owner','super','league_secretary','league_chairman')) then raise exception 'Only the Secretary, Chairman or System Owner can manage ballots.'; end if;
 select * into b from public.competition_handicap_ballots where id=p_ballot for update;
 if not found or b.phase<>'timing_ready' then raise exception 'Finish the calculation and adjustment votes first.'; end if;
 insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options)
 select b.id,coalesce(max(round_no),0)+1,'timing',array['p3','p4'] from public.competition_handicap_rounds where ballot_id=b.id;
 update public.competition_handicap_ballots set phase='timing' where id=b.id;
end $$;
revoke all on function public.cast_competition_handicap_vote(uuid,uuid,text,uuid),public.close_competition_handicap_round(uuid,uuid),public.open_competition_timing_vote(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cast_competition_handicap_vote(uuid,uuid,text,uuid),public.close_competition_handicap_round(uuid,uuid),public.open_competition_timing_vote(uuid,uuid) to service_role;

insert into public.competition_handicap_ballots(slug) values('competition-handicaps-2026-27');
insert into public.competition_handicap_voters(ballot_id,team_id,team_name)
select b.id,t.id,t.name from public.competition_handicap_ballots b cross join public.league_teams t
where b.slug='competition-handicaps-2026-27' and t.is_active=true
and t.season_id in ('157a820e-7d9a-4d48-92fd-bcb8928cbf66'::uuid,'f141e65b-3a88-43e6-be20-bf3cdb601af9'::uuid);
insert into public.competition_handicap_rounds(ballot_id,round_no,stage,options)
select id,1,'calculation',array['p1','p2'] from public.competition_handicap_ballots where slug='competition-handicaps-2026-27';
commit;

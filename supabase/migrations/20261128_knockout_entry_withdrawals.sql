begin;

alter table public.competition_entries
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by_user_id uuid references auth.users(id) on delete set null;

create or replace function public.knockout_match_has_withdrawal(p_match_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.matches m
    join public.competitions c on c.id = m.competition_id and c.competition_format = 'knockout'
    join public.competition_entries e on e.competition_id = c.id and e.player_id = any(array[
      m.player1_id,m.player2_id,m.team1_player1_id,m.team1_player2_id,m.team2_player1_id,m.team2_player2_id
    ])
    where m.id = p_match_id and e.status = 'withdrawn'
      and not exists (
        select 1 from public.competition_entries active
        where active.competition_id = e.competition_id and active.player_id = e.player_id and active.status = 'approved'
      )
  );
$$;
revoke all on function public.knockout_match_has_withdrawal(uuid) from public, anon, authenticated;
grant execute on function public.knockout_match_has_withdrawal(uuid) to service_role;

create or replace function public.guard_withdrawn_knockout_scorecard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if public.knockout_match_has_withdrawal(new.match_id) then
    raise exception using errcode = 'P0011', message = 'A player or team has withdrawn. A league officer must resolve this tie.';
  end if;
  return new;
end
$$;
drop trigger if exists guard_withdrawn_knockout_scorecard on public.competition_result_submissions;
create trigger guard_withdrawn_knockout_scorecard before insert on public.competition_result_submissions
for each row execute function public.guard_withdrawn_knockout_scorecard();

create or replace function public.withdraw_knockout_entry(p_entry_id uuid, p_award_walkover boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  entrant public.competition_entries%rowtype;
  tie public.matches%rowtype;
  current_tie public.matches%rowtype;
  active_ties integer := 0;
  opposing_player uuid;
  opposing_side uuid[];
begin
  if actor is null or not public.is_league_manager(actor) then
    raise exception 'League officer access is required to withdraw entries.';
  end if;

  select * into entrant from public.competition_entries where id = p_entry_id;
  if not found then raise exception 'Competition entry not found.'; end if;
  perform 1 from public.competitions where id = entrant.competition_id
    and competition_format = 'knockout' and not is_archived and not is_completed for update;
  if not found then raise exception 'This knockout competition is closed or archived.'; end if;

  select * into entrant from public.competition_entries where id = p_entry_id for update;
  if not found or entrant.status not in ('pending', 'approved', 'withdrawn') then
    raise exception 'This entry cannot be withdrawn.';
  end if;

  for tie in
    select * from public.matches where competition_id = entrant.competition_id and not is_archived
      and status in ('pending','in_progress')
      and entrant.player_id = any(array[player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id])
      order by id for update
  loop
    active_ties := active_ties + 1;
    current_tie := tie;
  end loop;

  if p_award_walkover then
    if active_ties <> 1 then
      raise exception 'A walkover requires one open tie with a confirmed opponent. Use Withdraw entry if the tie is not ready.';
    end if;
    if current_tie.status <> 'pending' or current_tie.winner_player_id is not null or
       exists (select 1 from public.frames where match_id = current_tie.id) or
       exists (select 1 from public.competition_result_submissions where match_id = current_tie.id and status = 'pending') then
      raise exception 'This tie has started or has a result awaiting review. Check the scorecard before awarding a walkover.';
    end if;

    if entrant.player_id = any(array[current_tie.player1_id,current_tie.team1_player1_id,current_tie.team1_player2_id]) then
      opposing_player := coalesce(current_tie.team2_player1_id,current_tie.player2_id);
      opposing_side := array[current_tie.player2_id,current_tie.team2_player1_id,current_tie.team2_player2_id];
    else
      opposing_player := coalesce(current_tie.team1_player1_id,current_tie.player1_id);
      opposing_side := array[current_tie.player1_id,current_tie.team1_player1_id,current_tie.team1_player2_id];
    end if;
    if opposing_player is null or entrant.player_id = any(opposing_side) or
       ((current_tie.team1_player1_id is not null or current_tie.team2_player1_id is not null) and
        (current_tie.team1_player1_id is null or current_tie.team1_player2_id is null or
         current_tie.team2_player1_id is null or current_tie.team2_player2_id is null)) then
      raise exception 'The opponent is not confirmed yet. Use Withdraw entry and resolve the tie once both sides are known.';
    end if;
    if exists (
      select 1 from public.competition_entries e
      where e.competition_id = entrant.competition_id and e.player_id = any(opposing_side) and e.status = 'withdrawn'
        and not exists (select 1 from public.competition_entries active
          where active.competition_id = e.competition_id and active.player_id = e.player_id and active.status = 'approved')
    ) then
      raise exception 'The opposing side has also withdrawn. Review the bracket before awarding a walkover.';
    end if;

    insert into public.frames(match_id,frame_no,winner_player_id,is_walkover_award)
      values (current_tie.id,1,opposing_player,true);
    update public.matches set status = 'complete', winner_player_id = opposing_player where id = current_tie.id;
  end if;

  update public.competition_entries set status = 'withdrawn', withdrawn_by_user_id = actor, withdrawn_at = now()
    where id = entrant.id and status <> 'withdrawn';
  return case when p_award_walkover then 'walkover' when active_ties > 0 then 'tie_pending' else 'withdrawn' end;
end
$$;
revoke all on function public.withdraw_knockout_entry(uuid,boolean) from public, anon, authenticated;
grant execute on function public.withdraw_knockout_entry(uuid,boolean) to authenticated;

commit;

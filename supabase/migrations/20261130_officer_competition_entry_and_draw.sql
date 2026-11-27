begin;

create or replace function public.add_officer_competition_entry(
  p_competition_id uuid, p_actor_id uuid, p_player_ids uuid[], p_dob date, p_note jsonb
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  saved uuid;
  capacity integer;
  is_knockout boolean;
begin
  perform pg_advisory_xact_lock(hashtext('public_competition_team_submission'), 0);

  select c.max_entries, c.competition_format = 'knockout' into capacity, is_knockout
  from public.competitions c
  where c.id = p_competition_id and not c.is_archived and not c.is_completed;
  if not found then raise exception 'This competition is unavailable.'; end if;
  if is_knockout and exists (select 1 from public.matches m where m.competition_id = p_competition_id and not m.is_archived) then
    raise exception 'The draw has already been published.';
  end if;
  if capacity is not null and capacity <= (
    select count(*) from public.competition_entries
    where competition_id = p_competition_id and status in ('approved', 'pending')
  ) then raise exception 'This competition is full.'; end if;

  if exists (
    select 1 from public.competition_entries e
    cross join unnest(p_player_ids) as candidate(id)
    where e.competition_id = p_competition_id and e.status in ('approved', 'pending')
      and (e.player_id = candidate.id or case when pg_input_is_valid(e.note, 'jsonb')
        then (e.note::jsonb->'teamMemberIds') ? candidate.id::text else false end)
  ) then raise exception 'One of these players already has an active entry in this competition.'; end if;

  insert into public.competition_entries (
    competition_id, player_id, entrant_date_of_birth, requester_user_id,
    status, reviewed_by_user_id, reviewed_at, note
  ) values (
    p_competition_id, p_player_ids[1], p_dob, p_actor_id,
    'approved', p_actor_id, now(), p_note::text
  ) returning id into saved;
  return saved;
end;
$$;

create or replace function public.publish_competition_opening_draw(
  p_competition_id uuid, p_entry_ids uuid[], p_matches jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  cup public.competitions;
  current_entries uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('public_competition_team_submission'), 0);

  select * into cup from public.competitions where id = p_competition_id for update;
  if not found or cup.is_archived or cup.is_completed or cup.competition_format <> 'knockout' then
    raise exception 'This knockout competition is unavailable.';
  end if;
  if cup.signup_open and (cup.signup_deadline is null or cup.signup_deadline >= now()) then
    raise exception 'Close entries before publishing the draw.';
  end if;
  if exists (select 1 from public.matches m where m.competition_id = cup.id and not m.is_archived) then
    raise exception 'A draw already exists for this competition.';
  end if;
  perform 1 from public.competition_entries e
    where e.competition_id = cup.id and e.status in ('pending', 'approved') for update;
  if exists (select 1 from public.competition_entries e where e.competition_id = cup.id and e.status = 'pending') then
    raise exception 'Review pending entries before publishing.';
  end if;
  select array_agg(e.id order by e.id) into current_entries
    from public.competition_entries e where e.competition_id = cup.id and e.status = 'approved';
  if current_entries is distinct from array(select id from unnest(p_entry_ids) as id order by id) then
    raise exception 'Entries changed. Create a fresh preview.';
  end if;

  insert into public.matches (
    competition_id, round_no, match_no, best_of, status, match_mode, player1_id, player2_id,
    team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id,
    winner_player_id, opening_break_player_id
  )
  select cup.id, 1, m.match_no, m.best_of, m.status, m.match_mode, m.player1_id, m.player2_id,
    m.team1_player1_id, m.team1_player2_id, m.team2_player1_id, m.team2_player2_id,
    m.winner_player_id, m.opening_break_player_id
  from jsonb_populate_recordset(null::public.matches, p_matches) as m;
end;
$$;

revoke all on function public.add_officer_competition_entry(uuid, uuid, uuid[], date, jsonb) from public, anon, authenticated;
revoke all on function public.publish_competition_opening_draw(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.add_officer_competition_entry(uuid, uuid, uuid[], date, jsonb) to service_role;
grant execute on function public.publish_competition_opening_draw(uuid, uuid[], jsonb) to service_role;

commit;

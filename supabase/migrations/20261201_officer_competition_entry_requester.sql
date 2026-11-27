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

  -- The officer reviews the entry on the player’s behalf. A requester account is
  -- reserved for self-submissions, where the legacy unique constraint applies.
  insert into public.competition_entries (
    competition_id, player_id, entrant_date_of_birth, requester_user_id,
    status, reviewed_by_user_id, reviewed_at, note
  ) values (
    p_competition_id, p_player_ids[1], p_dob, null,
    'approved', p_actor_id, now(), p_note::text
  ) returning id into saved;
  return saved;
end;
$$;

commit;

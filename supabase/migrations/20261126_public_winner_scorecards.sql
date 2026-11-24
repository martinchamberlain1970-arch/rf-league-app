begin;

create or replace function public.queue_competition_scorecard(
  p_match_id uuid, p_user_id uuid, p_token_hash text, p_payload jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.matches%rowtype;
  guest_link public.competition_scorecard_links%rowtype;
  side_players uuid[];
  lead_player uuid;
  competition_name text;
  declared_player text;
begin
  -- Serialize all result submissions for this match, regardless of sign-in method.
  select * into target from public.matches where id = p_match_id for update;
  if not found or target.is_archived or target.competition_id is null
      or target.status not in ('pending', 'in_progress')
      or not exists (select 1 from public.competitions c where c.id = target.competition_id and not c.is_archived and not c.is_completed)
      then return 'locked'; end if;

  if p_token_hash is not null then
    select * into guest_link from public.competition_scorecard_links
      where match_id = p_match_id and token_hash = p_token_hash for update;
    if not found or guest_link.used_at is not null or guest_link.expires_at <= clock_timestamp()
      then return 'invalid_link'; end if;
    if p_user_id is not null then return 'invalid_link'; end if;
  elsif p_user_id is null and p_payload->>'source' is distinct from 'public_winner_scorecard' then
    return 'invalid_link';
  end if;

  if p_user_id is null and p_payload->>'source' = 'public_winner_scorecard' then
    if not exists (select 1 from public.competitions where id = target.competition_id and competition_format = 'knockout')
      then return 'locked'; end if;
  end if;

  if p_user_id is null then
    declared_player := p_payload->>'declaredWinnerPlayerId';
    if p_payload->>'winnerSide' = 'home' then
      side_players := array[target.player1_id, target.team1_player1_id, target.team1_player2_id];
      lead_player := coalesce(target.team1_player1_id, target.player1_id);
    elsif p_payload->>'winnerSide' = 'away' then
      side_players := array[target.player2_id, target.team2_player1_id, target.team2_player2_id];
      lead_player := coalesce(target.team2_player1_id, target.player2_id);
    else
      return 'winner_required';
    end if;

    if declared_player is null then return 'winner_required'; end if;
    if not coalesce(declared_player = any(side_players::text[]), false) then
      select name into competition_name from public.competitions where id = target.competition_id;
      if competition_name !~ '^(Hodge Cup|Albery Cup) ' or not exists (
        select 1 from public.competition_entries e
        where e.competition_id = target.competition_id and e.player_id = lead_player and e.status = 'approved'
          and case when pg_input_is_valid(e.note, 'jsonb')
            then coalesce((e.note::jsonb->'teamMemberIds') ? declared_player, false) else false end
      ) then return 'winner_required'; end if;
    end if;
  end if;

  if exists (select 1 from public.competition_result_submissions s where s.match_id = target.id and s.status = 'pending')
    then return 'pending'; end if;

  insert into public.competition_result_submissions(match_id, competition_id, submitted_by_user_id, payload)
    values (target.id, target.competition_id, p_user_id, p_payload);
  if p_token_hash is not null then
    update public.competition_scorecard_links set used_at = clock_timestamp()
      where match_id = target.id and token_hash = p_token_hash;
  end if;
  return 'queued';
end
$$;

revoke all on function public.queue_competition_scorecard(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.queue_competition_scorecard(uuid, uuid, text, jsonb) to service_role;

commit;

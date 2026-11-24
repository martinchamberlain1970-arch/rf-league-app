begin;

create or replace function public.submit_public_competition_form(p_form jsonb, p_entries jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry jsonb;
  draft_key text := p_form->>'draft_token';
  cup_id uuid;
  player_key uuid;
  member_ids text[];
  conflict_player text;
  saved_id uuid;
  created integer := 0;
begin
  -- Forms can include teammates from another captain's roster. Check both
  -- forms under the same lock, and roll back all entries if any conflict.
  perform pg_advisory_xact_lock(hashtext('public_competition_team_submission'), 0);

  insert into public.public_competition_entry_drafts as draft
    (draft_token, season_id, team_id, contact_name, contact_phone, selections, status, submitted_at, updated_at)
  values (
    draft_key, (p_form->>'season_id')::uuid, (p_form->>'team_id')::uuid,
    p_form->>'contact_name', p_form->>'contact_phone', p_form->'selections',
    'submitted', now(), now()
  )
  on conflict (draft_token) do update
  set season_id = excluded.season_id, team_id = excluded.team_id,
      contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
      selections = excluded.selections, status = 'submitted',
      submitted_at = excluded.submitted_at, updated_at = excluded.updated_at
  where draft.status = 'draft'
  returning id into saved_id;
  if saved_id is null then raise exception 'This competition form has already been submitted.'; end if;

  for entry in select value from jsonb_array_elements(p_entries)
  loop
    cup_id := (entry->>'competition_id')::uuid;
    player_key := (entry->>'player_id')::uuid;
    member_ids := array[player_key::text] || array(select jsonb_array_elements_text(entry->'note'->'teamMemberIds'));
    -- An older route could have saved an entry before a later part of the
    -- form failed. Keep that entry on retry if it is the same group.
    if exists (
      select 1 from public.competition_entries e
      where e.competition_id = cup_id and e.player_id = player_key and e.status in ('pending', 'approved')
        and case when pg_input_is_valid(e.note, 'jsonb') then
          e.note::jsonb->>'draftToken' = draft_key
          and coalesce(e.note::jsonb->'teamMemberIds', '[]'::jsonb) = entry->'note'->'teamMemberIds'
        else false end
    ) then continue; end if;

    select candidate.id into conflict_player
    from unnest(member_ids) as candidate(id)
    where exists (
      select 1 from public.competition_entries e
      where e.competition_id = cup_id and e.status in ('pending', 'approved')
        and (e.player_id::text = candidate.id or case when pg_input_is_valid(e.note, 'jsonb')
          then (e.note::jsonb->'teamMemberIds') ? candidate.id else false end)
    )
    limit 1;
    if found then
      raise exception '% is already entered in %. Remove that entry from this form and try again.',
        (select coalesce(nullif(trim(full_name), ''), display_name) from public.players where id = conflict_player::uuid),
        (select name from public.competitions where id = cup_id);
    end if;

    insert into public.competition_entries
      (competition_id, requester_user_id, player_id, entrant_date_of_birth, status, note)
    values (cup_id, null, player_key, (entry->>'entrant_date_of_birth')::date, 'pending', (entry->'note')::text);
    created := created + 1;
  end loop;

  return created;
end
$$;

revoke all on function public.submit_public_competition_form(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.submit_public_competition_form(jsonb, jsonb) to service_role;

commit;

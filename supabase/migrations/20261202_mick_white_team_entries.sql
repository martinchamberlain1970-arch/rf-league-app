begin;

alter table public.competition_entries
  add column if not exists league_team_id uuid references public.league_teams(id),
  alter column player_id drop not null;

create unique index if not exists competition_entries_one_active_league_team
  on public.competition_entries (competition_id, league_team_id)
  where league_team_id is not null and status in ('pending','approved');

create or replace function public.check_mick_white_team_entry()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  team_cup boolean;
begin
  select c.name ~* '^Mick White([[:space:]]|$)' into team_cup
    from public.competitions c where c.id = new.competition_id;
  if not coalesce(team_cup, false) then
    if new.league_team_id is not null or new.player_id is null then raise exception 'This competition requires player entries.'; end if;
    return new;
  end if;
  if new.player_id is not null or new.league_team_id is null or not exists (
    select 1 from public.league_teams t join public.league_seasons s on s.id=t.season_id
    where t.id=new.league_team_id and t.is_active and s.is_active and s.is_published
      and s.name ~* '(^|[^[:alnum:]])(division[[:space:]]+(1|one)|first[[:space:]]+division)([^[:alnum:]]|$)'
  ) then raise exception 'The Mick White Memorial Cup is open to Division One teams only.'; end if;
  return new;
end;
$$;

drop trigger if exists check_mick_white_team_entry on public.competition_entries;
create trigger check_mick_white_team_entry before insert or update of competition_id, player_id, league_team_id
on public.competition_entries for each row execute function public.check_mick_white_team_entry();

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
    if exists (select 1 from public.competitions c where c.id=cup_id and c.name ~* '^Mick White([[:space:]]|$)') then
      if (entry->>'player_id') is not null or (entry->'note'->>'teamId') is distinct from (p_form->>'team_id') then
        raise exception 'Enter the registered Division One team for the Mick White Memorial Cup.';
      end if;
      if exists (select 1 from public.competition_entries where competition_id=cup_id
        and league_team_id=(p_form->>'team_id')::uuid and status in ('pending','approved')) then
        raise exception 'This team already has an entry in the Mick White Memorial Cup.';
      end if;
      insert into public.competition_entries (competition_id, league_team_id, requester_user_id, status, note)
      values (cup_id, (p_form->>'team_id')::uuid, null, 'pending', (entry->'note')::text);
      created := created + 1;
      continue;
    end if;
    player_key := (entry->>'player_id')::uuid;
    if player_key is null then raise exception 'Select a player for this competition.'; end if;
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

insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, signup_deadline, is_archived, is_completed)
select 'Mick White Memorial Cup - 2026/2027', 'snooker', 'knockout', 'singles', 5, true, existing.signup_deadline, false, false
from public.competitions existing
where existing.name='Gary Webb (Singles Scratch) - 2026/2027' and existing.signup_open
  and not existing.is_archived and not existing.is_completed
  and not exists (select 1 from public.competitions where name='Mick White Memorial Cup - 2026/2027' and not is_archived)
limit 1;

commit;

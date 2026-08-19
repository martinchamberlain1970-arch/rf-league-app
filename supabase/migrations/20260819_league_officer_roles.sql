-- Named league-officer roles. These roles administer competition operations
-- but do not inherit system-owner controls (backups, deletion, security, or
-- protected-role assignment).

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'app_users'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.app_users drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.app_users
  add constraint app_users_role_check
  check (lower(coalesce(role, 'user')) in ('user','admin','league_secretary','league_chairman','super','owner'));

create or replace function public.is_league_manager(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users au
    where au.id = check_user_id
      and lower(coalesce(au.role, 'user')) in ('league_secretary','league_chairman','super','owner')
  );
$$;

revoke all on function public.is_league_manager(uuid) from public;
grant execute on function public.is_league_manager(uuid) to authenticated;

do $$ begin
  if to_regclass('public.league_documents') is not null then
    execute 'drop policy if exists league_documents_write_super_user on public.league_documents';
    execute 'drop policy if exists league_documents_write_league_manager on public.league_documents';
    execute 'create policy league_documents_write_league_manager on public.league_documents for all to authenticated using (public.is_league_manager()) with check (public.is_league_manager())';
  end if;
end $$;

do $$ begin
  if to_regclass('public.competition_round_deadlines') is not null then
    execute 'drop policy if exists competition_round_deadlines_manage_super on public.competition_round_deadlines';
    execute 'drop policy if exists competition_round_deadlines_manage_league_manager on public.competition_round_deadlines';
    execute 'create policy competition_round_deadlines_manage_league_manager on public.competition_round_deadlines for all to authenticated using (public.is_league_manager()) with check (public.is_league_manager())';
  end if;
end $$;

do $$ begin
  if to_regclass('public.competition_match_breaks') is not null then
    execute 'drop policy if exists competition_match_breaks_manage_super on public.competition_match_breaks';
    execute 'drop policy if exists competition_match_breaks_manage_league_manager on public.competition_match_breaks';
    execute 'create policy competition_match_breaks_manage_league_manager on public.competition_match_breaks for all to authenticated using (public.is_league_manager()) with check (public.is_league_manager())';
  end if;
end $$;

do $$ begin
  if to_regclass('public.competition_result_submissions') is not null then
    execute 'drop policy if exists competition_result_submissions_select on public.competition_result_submissions';
    execute 'create policy competition_result_submissions_select on public.competition_result_submissions for select to authenticated using (submitted_by_user_id = auth.uid() or public.is_league_manager())';
    execute 'drop policy if exists competition_result_submissions_update_super on public.competition_result_submissions';
    execute 'drop policy if exists competition_result_submissions_update_league_manager on public.competition_result_submissions';
    execute 'create policy competition_result_submissions_update_league_manager on public.competition_result_submissions for update to authenticated using (public.is_league_manager()) with check (public.is_league_manager())';
  end if;
end $$;

do $$ begin
  if to_regclass('public.competition_entries') is not null then
    execute 'drop policy if exists competition_entries_select_own_or_owner on public.competition_entries';
    execute 'drop policy if exists competition_entries_select_own_or_manager on public.competition_entries';
    execute 'create policy competition_entries_select_own_or_manager on public.competition_entries for select to authenticated using (requester_user_id = auth.uid() or public.is_league_manager())';
    execute 'drop policy if exists competition_entries_update_own_or_owner on public.competition_entries';
    execute 'drop policy if exists competition_entries_update_own_or_manager on public.competition_entries';
    execute 'create policy competition_entries_update_own_or_manager on public.competition_entries for update to authenticated using (requester_user_id = auth.uid() or public.is_league_manager()) with check (requester_user_id = auth.uid() or public.is_league_manager())';
  end if;
end $$;

create or replace function public.enforce_competition_entry_review_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    if not public.is_league_manager(auth.uid()) then
      raise exception 'League management access is required to approve or reject entries';
    end if;
  end if;
  return new;
end;
$$;

do $$ begin
  if to_regclass('public.player_claim_requests') is not null then
    execute 'drop policy if exists player_claim_requests_read_scoped on public.player_claim_requests';
    execute 'create policy player_claim_requests_read_scoped on public.player_claim_requests for select to authenticated using (requester_user_id = auth.uid() or public.is_league_manager() or exists (select 1 from public.app_users au where au.id = auth.uid() and lower(coalesce(au.role,''user'')) = ''admin''))';
    execute 'drop policy if exists player_claim_requests_update_reviewers on public.player_claim_requests';
    execute 'create policy player_claim_requests_update_reviewers on public.player_claim_requests for update to authenticated using (public.is_league_manager() or exists (select 1 from public.app_users au where au.id = auth.uid() and lower(coalesce(au.role,''user'')) = ''admin'')) with check (public.is_league_manager() or exists (select 1 from public.app_users au where au.id = auth.uid() and lower(coalesce(au.role,''user'')) = ''admin''))';
  end if;
end $$;

do $$ begin
  if to_regclass('public.player_update_requests') is not null then
    execute 'drop policy if exists player_update_requests_read_scoped on public.player_update_requests';
    execute 'create policy player_update_requests_read_scoped on public.player_update_requests for select to authenticated using (requester_user_id = auth.uid() or public.is_league_manager() or exists (select 1 from public.app_users au where au.id = auth.uid() and lower(coalesce(au.role,''user'')) = ''admin''))';
    execute 'drop policy if exists player_update_requests_update_super on public.player_update_requests';
    execute 'drop policy if exists player_update_requests_update_league_manager on public.player_update_requests';
    execute 'create policy player_update_requests_update_league_manager on public.player_update_requests for update to authenticated using (public.is_league_manager()) with check (public.is_league_manager())';
  end if;
end $$;

do $$ begin
  if to_regclass('public.league_reports') is not null then
    execute 'drop policy if exists "league_reports_owner_insert" on public.league_reports';
    execute 'drop policy if exists league_reports_manager_insert on public.league_reports';
    execute 'create policy league_reports_manager_insert on public.league_reports for insert to authenticated with check (public.is_league_manager())';
    execute 'drop policy if exists "league_reports_owner_select" on public.league_reports';
    execute 'drop policy if exists league_reports_manager_select on public.league_reports';
    execute 'create policy league_reports_manager_select on public.league_reports for select to authenticated using (public.is_league_manager())';
  end if;
end $$;

begin;

drop policy if exists competition_entries_insert_own on public.competition_entries;
drop policy if exists competition_entries_insert_manager on public.competition_entries;
create policy competition_entries_insert_manager
on public.competition_entries for insert to authenticated
with check (requester_user_id = auth.uid() and public.is_league_manager());

drop policy if exists competition_entries_update_own_or_manager on public.competition_entries;
create policy competition_entries_update_own_or_manager
on public.competition_entries for update to authenticated
using (
  public.is_league_manager()
  or (requester_user_id = auth.uid() and status in ('pending', 'approved'))
)
with check (
  public.is_league_manager()
  or (requester_user_id = auth.uid() and status = 'withdrawn')
);

commit;

-- Fix RLS for competition entry submit/review flows

alter table if exists public.competition_entries enable row level security;

drop policy if exists competition_entries_select_own_or_owner on public.competition_entries;
create policy competition_entries_select_own_or_owner
on public.competition_entries
for select
to authenticated
using (
  requester_user_id = auth.uid()
  or exists (
    select 1
    from public.app_users au
    where au.id = auth.uid()
      and coalesce(au.role, 'user') = 'owner'
  )
);

drop policy if exists competition_entries_insert_own on public.competition_entries;
create policy competition_entries_insert_own
on public.competition_entries
for insert
to authenticated
with check (
  requester_user_id = auth.uid()
);

drop policy if exists competition_entries_update_own_or_owner on public.competition_entries;
create policy competition_entries_update_own_or_owner
on public.competition_entries
for update
to authenticated
using (
  requester_user_id = auth.uid()
  or exists (
    select 1
    from public.app_users au
    where au.id = auth.uid()
      and coalesce(au.role, 'user') = 'owner'
  )
)
with check (
  requester_user_id = auth.uid()
  or exists (
    select 1
    from public.app_users au
    where au.id = auth.uid()
      and coalesce(au.role, 'user') = 'owner'
  )
);

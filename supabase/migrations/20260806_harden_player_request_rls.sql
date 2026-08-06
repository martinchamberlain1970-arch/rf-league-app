-- Restrict player claim/profile update requests to their requester and trusted reviewers.
-- This replaces legacy policies that used using (true) / with check (true).

alter table public.player_claim_requests enable row level security;

drop policy if exists player_claim_requests_read_authenticated on public.player_claim_requests;
create policy player_claim_requests_read_scoped
  on public.player_claim_requests
  for select
  to authenticated
  using (
    requester_user_id = auth.uid()
    or exists (
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and lower(coalesce(au.role, 'user')) in ('admin', 'super', 'owner')
    )
  );
drop policy if exists player_claim_requests_update_authenticated on public.player_claim_requests;
create policy player_claim_requests_update_reviewers
  on public.player_claim_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and lower(coalesce(au.role, 'user')) in ('admin', 'super', 'owner')
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and lower(coalesce(au.role, 'user')) in ('admin', 'super', 'owner')
    )
  );

alter table public.player_update_requests enable row level security;

drop policy if exists player_update_requests_read_authenticated on public.player_update_requests;
create policy player_update_requests_read_scoped
  on public.player_update_requests
  for select
  to authenticated
  using (
    requester_user_id = auth.uid()
    or exists (
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and lower(coalesce(au.role, 'user')) in ('admin', 'super', 'owner')
    )
  );

drop policy if exists player_update_requests_update_authenticated on public.player_update_requests;
create policy player_update_requests_update_super
  on public.player_update_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and lower(coalesce(au.role, 'user')) in ('super', 'owner')
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and lower(coalesce(au.role, 'user')) in ('super', 'owner')
    )
  );

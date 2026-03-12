create table if not exists public.location_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid null references public.app_users(id) on delete set null,
  requester_email text not null,
  requester_full_name text not null,
  requested_location_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by_user_id uuid null references public.app_users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists location_requests_status_idx on public.location_requests(status);
create index if not exists location_requests_created_at_idx on public.location_requests(created_at desc);

alter table public.location_requests enable row level security;

drop policy if exists location_requests_insert_auth on public.location_requests;
create policy location_requests_insert_auth
  on public.location_requests
  for insert
  to authenticated
  with check (true);

drop policy if exists location_requests_select_own_or_owner on public.location_requests;
create policy location_requests_select_own_or_owner
  on public.location_requests
  for select
  to authenticated
  using (
    requester_user_id = auth.uid()
    or exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'owner'
    )
  );


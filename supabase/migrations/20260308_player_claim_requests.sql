create table if not exists public.player_claim_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  requester_user_id uuid not null references public.app_users(id) on delete cascade,
  requested_full_name text null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by_user_id uuid null references public.app_users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists player_claim_requests_requester_idx
  on public.player_claim_requests(requester_user_id, status, created_at desc);

create index if not exists player_claim_requests_player_idx
  on public.player_claim_requests(player_id, status, created_at desc);

alter table public.player_claim_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'player_claim_requests'
      and policyname = 'player_claim_requests_read_authenticated'
  ) then
    create policy player_claim_requests_read_authenticated
      on public.player_claim_requests
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'player_claim_requests'
      and policyname = 'player_claim_requests_insert_authenticated'
  ) then
    create policy player_claim_requests_insert_authenticated
      on public.player_claim_requests
      for insert
      to authenticated
      with check (requester_user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'player_claim_requests'
      and policyname = 'player_claim_requests_update_authenticated'
  ) then
    create policy player_claim_requests_update_authenticated
      on public.player_claim_requests
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

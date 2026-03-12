-- Persist notification read state per user.

create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  notification_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, notification_key)
);

create index if not exists notification_reads_user_created_idx
  on public.notification_reads(user_id, created_at desc);

alter table public.notification_reads enable row level security;

drop policy if exists "notification_reads_select_own" on public.notification_reads;
create policy "notification_reads_select_own"
  on public.notification_reads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_reads_insert_own" on public.notification_reads;
create policy "notification_reads_insert_own"
  on public.notification_reads
  for insert
  to authenticated
  with check (user_id = auth.uid());

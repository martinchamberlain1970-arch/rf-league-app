alter table public.notification_reads enable row level security;

drop policy if exists "notification_reads_update_own" on public.notification_reads;
create policy "notification_reads_update_own"
  on public.notification_reads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

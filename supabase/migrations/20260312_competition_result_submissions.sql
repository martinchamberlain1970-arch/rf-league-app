create table if not exists public.competition_result_submissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_correction')),
  rejection_reason text null,
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists competition_result_submissions_match_idx
  on public.competition_result_submissions(match_id);
create index if not exists competition_result_submissions_comp_idx
  on public.competition_result_submissions(competition_id);
create index if not exists competition_result_submissions_status_idx
  on public.competition_result_submissions(status, created_at desc);

alter table public.competition_result_submissions enable row level security;

drop policy if exists competition_result_submissions_select on public.competition_result_submissions;
create policy competition_result_submissions_select
on public.competition_result_submissions
for select
to authenticated
using (
  submitted_by_user_id = auth.uid()
  or exists (
    select 1 from public.app_users au
    where au.id = auth.uid()
      and lower(coalesce(au.role,'')) in ('owner','super')
  )
);

drop policy if exists competition_result_submissions_insert on public.competition_result_submissions;
create policy competition_result_submissions_insert
on public.competition_result_submissions
for insert
to authenticated
with check (submitted_by_user_id = auth.uid());

drop policy if exists competition_result_submissions_update_super on public.competition_result_submissions;
create policy competition_result_submissions_update_super
on public.competition_result_submissions
for update
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where au.id = auth.uid()
      and lower(coalesce(au.role,'')) in ('owner','super')
  )
)
with check (
  exists (
    select 1 from public.app_users au
    where au.id = auth.uid()
      and lower(coalesce(au.role,'')) in ('owner','super')
  )
);

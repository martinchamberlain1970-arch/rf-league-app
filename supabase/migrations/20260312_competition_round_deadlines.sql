create table if not exists public.competition_round_deadlines (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_no int not null check (round_no >= 1),
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (competition_id, round_no)
);

create index if not exists competition_round_deadlines_comp_idx
  on public.competition_round_deadlines(competition_id);

alter table public.competition_round_deadlines enable row level security;

drop policy if exists competition_round_deadlines_select_auth on public.competition_round_deadlines;
create policy competition_round_deadlines_select_auth
on public.competition_round_deadlines
for select
to authenticated
using (true);

drop policy if exists competition_round_deadlines_manage_super on public.competition_round_deadlines;
create policy competition_round_deadlines_manage_super
on public.competition_round_deadlines
for all
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

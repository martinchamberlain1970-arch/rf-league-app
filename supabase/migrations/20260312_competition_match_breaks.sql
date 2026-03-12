create table if not exists public.competition_match_breaks (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id uuid null references public.players(id) on delete set null,
  entered_player_name text null,
  break_value int not null check (break_value >= 30),
  created_at timestamptz not null default now()
);

create index if not exists competition_match_breaks_match_idx
  on public.competition_match_breaks(match_id);
create index if not exists competition_match_breaks_comp_idx
  on public.competition_match_breaks(competition_id);

alter table public.competition_match_breaks enable row level security;

drop policy if exists competition_match_breaks_select_auth on public.competition_match_breaks;
create policy competition_match_breaks_select_auth
on public.competition_match_breaks
for select
to authenticated
using (true);

drop policy if exists competition_match_breaks_manage_super on public.competition_match_breaks;
create policy competition_match_breaks_manage_super
on public.competition_match_breaks
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

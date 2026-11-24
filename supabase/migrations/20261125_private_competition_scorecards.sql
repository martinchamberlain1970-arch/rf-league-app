begin;

-- Some installations predate the competition result queue.
create table if not exists public.competition_result_submissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  submitted_by_user_id uuid references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_correction')),
  rejection_reason text,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.competition_result_submissions enable row level security;
grant select, update on public.competition_result_submissions to authenticated;
grant select, insert, update on public.competition_result_submissions to service_role;

create index if not exists competition_result_submissions_match_idx
  on public.competition_result_submissions(match_id);
create index if not exists competition_result_submissions_comp_idx
  on public.competition_result_submissions(competition_id);
create index if not exists competition_result_submissions_status_idx
  on public.competition_result_submissions(status, created_at desc);

drop policy if exists competition_result_submissions_select on public.competition_result_submissions;
create policy competition_result_submissions_select on public.competition_result_submissions for select to authenticated
using (submitted_by_user_id = auth.uid() or public.is_league_manager());
drop policy if exists competition_result_submissions_update_league_manager on public.competition_result_submissions;
create policy competition_result_submissions_update_league_manager on public.competition_result_submissions for update to authenticated
using (public.is_league_manager()) with check (public.is_league_manager());

create table if not exists public.competition_scorecard_links (
  match_id uuid primary key references public.matches(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.competition_scorecard_links enable row level security;
revoke all on public.competition_scorecard_links from public, anon, authenticated;
grant select, insert, update, delete on public.competition_scorecard_links to service_role;

alter table public.competition_result_submissions alter column submitted_by_user_id drop not null;
drop policy if exists competition_result_submissions_insert on public.competition_result_submissions;

create or replace function public.queue_competition_scorecard(
  p_match_id uuid, p_user_id uuid, p_token_hash text, p_payload jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.matches%rowtype;
  guest_link public.competition_scorecard_links%rowtype;
begin
  -- Serialize all result submissions for this match, regardless of sign-in method.
  select * into target from public.matches where id = p_match_id for update;
  if not found or target.is_archived or target.competition_id is null
      or target.status not in ('pending', 'in_progress')
      or not exists (select 1 from public.competitions c where c.id = target.competition_id and not c.is_archived and not c.is_completed)
      then return 'locked'; end if;

  if p_token_hash is not null then
    select * into guest_link from public.competition_scorecard_links
      where match_id = p_match_id and token_hash = p_token_hash for update;
    if not found or guest_link.used_at is not null or guest_link.expires_at <= clock_timestamp()
      then return 'invalid_link'; end if;
    if p_user_id is not null then return 'invalid_link'; end if;
  elsif p_user_id is null then
    return 'invalid_link';
  end if;

  if exists (select 1 from public.competition_result_submissions s where s.match_id = target.id and s.status = 'pending')
    then return 'pending'; end if;

  insert into public.competition_result_submissions(match_id, competition_id, submitted_by_user_id, payload)
    values (target.id, target.competition_id, p_user_id, p_payload);
  if p_token_hash is not null then
    update public.competition_scorecard_links set used_at = clock_timestamp()
      where match_id = target.id and token_hash = p_token_hash;
  end if;
  return 'queued';
end
$$;

revoke all on function public.queue_competition_scorecard(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.queue_competition_scorecard(uuid, uuid, text, jsonb) to service_role;

commit;

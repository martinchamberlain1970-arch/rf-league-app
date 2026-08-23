-- Private bearer links allow league officers to review a draft fixture list
-- before the league is formally published. Tokens live in their own protected
-- table so they are not exposed by general league-season read permissions.

create table if not exists public.league_fixture_draft_links (
  season_id uuid primary key references public.league_seasons(id) on delete cascade,
  share_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.league_fixture_draft_links enable row level security;

revoke all on table public.league_fixture_draft_links from anon;
grant select, insert, update, delete on table public.league_fixture_draft_links to authenticated;

drop policy if exists league_fixture_draft_links_manage on public.league_fixture_draft_links;
create policy league_fixture_draft_links_manage
on public.league_fixture_draft_links
for all
to authenticated
using (public.is_league_manager())
with check (public.is_league_manager());

insert into public.league_fixture_draft_links (season_id)
select id from public.league_seasons
on conflict (season_id) do nothing;

begin;

-- The two Meopham winter teams were entered against the correct divisions
-- but with their A/B labels reversed. Rename the existing season-team rows
-- in place so fixture IDs, dates, opponents, and entry-pack links are retained.
update public.league_teams
set name = 'Meopham A'
where id = '40be1c2a-d55b-4983-855a-884f197c56cd'
  and season_id = 'f141e65b-3a88-43e6-be20-bf3cdb601af9'
  and name = 'Meopham B';

update public.league_teams
set name = 'Meopham B'
where id = '1c9c99bd-b7f4-4228-ac38-a3f6fda5bbbb'
  and season_id = '157a820e-7d9a-4d48-92fd-bcb8928cbf66'
  and name = 'Meopham A';

do $$
begin
  if not exists (
    select 1
    from public.league_teams
    where id = '40be1c2a-d55b-4983-855a-884f197c56cd'
      and season_id = 'f141e65b-3a88-43e6-be20-bf3cdb601af9'
      and name = 'Meopham A'
  ) then
    raise exception 'Meopham A was not confirmed in the Premier League';
  end if;

  if not exists (
    select 1
    from public.league_teams
    where id = '1c9c99bd-b7f4-4228-ac38-a3f6fda5bbbb'
      and season_id = '157a820e-7d9a-4d48-92fd-bcb8928cbf66'
      and name = 'Meopham B'
  ) then
    raise exception 'Meopham B was not confirmed in Division 1';
  end if;
end $$;

commit;

alter table public.league_team_members
  add column if not exists is_match_scorer boolean not null default false;

comment on column public.league_team_members.is_match_scorer is
  'Season-specific permission to enter line-ups and match scores without captain administration rights.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'league_team_members_distinct_match_scorer_role'
      and conrelid = 'public.league_team_members'::regclass
  ) then
    alter table public.league_team_members
      add constraint league_team_members_distinct_match_scorer_role
      check (not (is_match_scorer and (is_captain or is_vice_captain)));
  end if;
end
$$;

create or replace function public.enforce_match_scorer_limit()
returns trigger
language plpgsql
as $$
begin
  if new.is_match_scorer and (
    select count(*)
    from public.league_team_members member
    where member.season_id = new.season_id
      and member.team_id = new.team_id
      and member.is_match_scorer = true
      and member.id is distinct from new.id
  ) >= 2 then
    raise exception 'A team can have no more than two additional match-night scorers in a season.';
  end if;
  return new;
end;
$$;

drop trigger if exists league_team_members_match_scorer_limit
  on public.league_team_members;

create trigger league_team_members_match_scorer_limit
before insert or update of is_match_scorer, season_id, team_id
on public.league_team_members
for each row
execute function public.enforce_match_scorer_limit();

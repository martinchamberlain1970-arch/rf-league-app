begin;
alter table public.league_friendlies add column can_host boolean not null default true,
  add column hosting_team_id uuid references public.league_teams(id);
update public.league_friendlies set hosting_team_id=host_team_id;
-- host_team_id remains the offering side for stable scorecards; hosting_team_id
-- identifies the actual venue host, including when the accepting side hosts.
create or replace function public.check_friendly_host_capacity() returns trigger
language plpgsql set search_path=public as $$
declare
  venue_id uuid; venue_name text; venue_address text; capacity integer; reserved integer;
begin
  if new.status='cancelled' then return new; end if;
  if new.can_host then new.hosting_team_id:=new.host_team_id;
  elsif new.status='open' then new.hosting_team_id:=null;
  else new.hosting_team_id:=new.guest_team_id;
  end if;
  if new.hosting_team_id is null then
    new.venue:='Awaiting a host club'; return new;
  end if;
  -- Score corrections do not move an already recorded reservation/address.
  if TG_OP='UPDATE' then
    if old.hosting_team_id is not distinct from new.hosting_team_id
      and old.match_date=new.match_date and old.status<>'cancelled' then
      new.venue:=old.venue; return new;
    end if;
  end if;
  select location_id into venue_id from public.league_teams where id=new.hosting_team_id;
  if venue_id is null then raise exception 'The hosting team has no registered club.'; end if;
  -- Serialize reservations at a club (including simultaneous offers/claims).
  select name,address,snooker_table_count into venue_name,venue_address,capacity
    from public.locations where id=venue_id for update;
  if nullif(trim(venue_address),'') is null then raise exception 'The hosting club needs a registered address before it can host.'; end if;
  if capacity is null or capacity<1 then raise exception 'The hosting club needs a registered snooker table count.'; end if;
  select count(*) into reserved from public.league_friendlies f
    join public.league_teams t on t.id=f.hosting_team_id
    where t.location_id=venue_id and f.match_date=new.match_date
      and f.status in ('open','booked','played') and f.id<>new.id;
  reserved:=reserved+(select count(*) from public.league_fixtures f
    join public.league_teams t on t.id=f.home_team_id
    join public.league_seasons s on s.id=f.season_id
    where t.location_id=venue_id and f.fixture_date=new.match_date
      and f.status<>'bye' and f.away_team_id is not null and s.is_published=true);
  if reserved>=capacity then raise exception 'This club has no free tables on that date. Choose an away game or another date.'; end if;
  new.venue:=concat_ws(' — ',nullif(trim(venue_name),''),trim(venue_address));
  return new;
end $$;
create trigger friendly_host_capacity before insert or update on public.league_friendlies
for each row execute function public.check_friendly_host_capacity();
notify pgrst,'reload schema';
commit;

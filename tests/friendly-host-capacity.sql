rollback;
begin;
do $$
declare l1 uuid; l2 uuid; season uuid; h uuid; g uuid; u uuid; cap integer; i integer; first_id uuid; away_id uuid; result_host uuid; result_venue text; expected_venue text; rejected boolean:=false;
begin
 select id into season from public.league_seasons limit 1;
 insert into public.locations(name,address,snooker_table_count) values('Friendly capacity test A','Test address A',1) returning id into l1;
 insert into public.locations(name,address,snooker_table_count) values('Friendly capacity test B','Test address B',1) returning id into l2;
 insert into public.league_teams(season_id,location_id,name,is_active) values(season,l1,'Friendly capacity test A',true) returning id into h;
 insert into public.league_teams(season_id,location_id,name,is_active) values(season,l2,'Friendly capacity test B',true) returning id into g;
 cap:=1; expected_venue:='Friendly capacity test B — Test address B';
 select id into u from auth.users limit 1;
 if h is null or g is null or u is null then raise exception 'Test requires two registered clubs with addresses'; end if;
 for i in 1..cap loop
  insert into public.league_friendlies(host_team_id,guest_team_id,match_date,start_time,venue,status,created_by,updated_by) values(h,g,'2999-01-01','19:00','test','booked',u,u) returning id into first_id;
 end loop;
 begin
  insert into public.league_friendlies(host_team_id,match_date,start_time,venue,created_by,updated_by) values(h,'2999-01-01','19:00','test',u,u);
 exception when raise_exception then
  if SQLERRM like 'This club has no free tables%' then rejected:=true; else raise; end if;
 end;
 if not rejected then raise exception 'Capacity failed to block overbooking'; end if;
 insert into public.league_friendlies(host_team_id,match_date,start_time,venue,can_host,created_by,updated_by) values(h,'2999-01-01','19:00','test',false,u,u) returning id into away_id;
 if (select hosting_team_id is not null from public.league_friendlies where id=away_id) then raise exception 'Away offer reserved a table'; end if;
 update public.league_friendlies set guest_team_id=g,status='booked' where id=away_id returning hosting_team_id,venue into result_host,result_venue;
 if result_host<>g or result_venue<>expected_venue then raise exception 'Accepting club did not become venue host'; end if;
 update public.league_friendlies set status='cancelled' where id=first_id;
 insert into public.league_friendlies(host_team_id,match_date,start_time,venue,created_by,updated_by) values(h,'2999-01-01','19:00','test',u,u);
end $$;
rollback;
select 'Passed: capacity limit, away offer, accepting host/address, cancellation releases table; test records rolled back' as result;

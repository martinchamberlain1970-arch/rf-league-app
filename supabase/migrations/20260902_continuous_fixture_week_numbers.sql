-- Break Thursdays move fixture dates but must not create gaps in the displayed
-- fixture round numbers. Renumber the current winter divisions in date order
-- without changing any dates, opponents, venues or results.

do $$
declare
  target_season record;
  old_week_no integer;
  next_week_no integer;
begin
  for target_season in
    select id, name
    from public.league_seasons
    where name in (
      'Gravesend & District Indoor Games League - Premier League 2026/2027',
      'Gravesend & District Indoor Games League - Division 1 2026/2027'
    )
  loop
    next_week_no := 0;

    for old_week_no in
      select distinct week_no
      from public.league_fixtures
      where season_id = target_season.id
        and week_no is not null
      order by week_no
    loop
      next_week_no := next_week_no + 1;

      if old_week_no <> next_week_no then
        update public.league_fixtures
        set week_no = next_week_no
        where season_id = target_season.id
          and week_no = old_week_no;
      end if;
    end loop;

    raise notice '% now has continuous fixture weeks 1 to %', target_season.name, next_week_no;
  end loop;
end;
$$;

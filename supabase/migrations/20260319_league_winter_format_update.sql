alter table public.league_seasons
drop constraint if exists league_seasons_format_check;

alter table public.league_seasons
add constraint league_seasons_format_check
check (
  (singles_count = 4 and doubles_count = 1)
  or (singles_count = 6 and doubles_count = 0)
);

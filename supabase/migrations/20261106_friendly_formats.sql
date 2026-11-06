begin;
alter table public.league_friendlies
  add column format text not null default 'six_singles' check (format in ('six_singles','four_singles_one_doubles')),
  add column use_handicaps boolean not null default false;
notify pgrst, 'reload schema';
commit;

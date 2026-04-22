alter table public.locations
  add column if not exists snooker_table_count integer not null default 1;

alter table public.locations
  drop constraint if exists locations_snooker_table_count_positive;

alter table public.locations
  add constraint locations_snooker_table_count_positive
  check (snooker_table_count >= 1 and snooker_table_count <= 12);

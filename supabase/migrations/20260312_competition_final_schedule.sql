alter table public.competitions
  add column if not exists final_scheduled_at timestamptz null,
  add column if not exists final_venue_location_id uuid null references public.locations(id) on delete set null;

create index if not exists competitions_final_venue_idx
  on public.competitions(final_venue_location_id);

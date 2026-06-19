alter table if exists public.league_fixture_breaks
  add column if not exists frame_slot_no integer;

create index if not exists league_fixture_breaks_fixture_slot_idx
  on public.league_fixture_breaks(fixture_id, frame_slot_no);

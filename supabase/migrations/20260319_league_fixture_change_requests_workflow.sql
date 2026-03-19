alter table public.league_fixture_change_requests
  drop constraint if exists league_fixture_change_requests_status_check;

alter table public.league_fixture_change_requests
  add constraint league_fixture_change_requests_status_check
  check (status in ('pending', 'approved_outstanding', 'rescheduled', 'rejected'));

alter table public.league_fixture_change_requests
  alter column proposed_fixture_date drop not null;

alter table public.league_fixture_change_requests
  add column if not exists agreed_fixture_date date null;

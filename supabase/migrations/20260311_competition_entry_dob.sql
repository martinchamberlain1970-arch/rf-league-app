alter table if exists public.competition_entries
  add column if not exists entrant_date_of_birth date;

comment on column public.competition_entries.entrant_date_of_birth
  is 'Optional DOB captured at competition sign-up; required for age-restricted competitions (e.g. Over 50/Over 60).';

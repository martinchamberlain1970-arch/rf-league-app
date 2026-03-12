alter table if exists public.players
  add column if not exists date_of_birth date;

comment on column public.players.date_of_birth is
  'Date of birth used for age eligibility validation (e.g. over-50/over-60 competitions).';

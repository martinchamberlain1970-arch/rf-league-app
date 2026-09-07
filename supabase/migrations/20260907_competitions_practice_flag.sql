-- Match Centre and Quick Match distinguish ordinary competitions from
-- practice matches. Older databases pre-date this flag.

alter table public.competitions
  add column if not exists is_practice boolean not null default false;

update public.competitions
set is_practice = false
where is_practice is null;

comment on column public.competitions.is_practice is
  'True only for informal Quick Match competitions; false for published league competitions and cups.';

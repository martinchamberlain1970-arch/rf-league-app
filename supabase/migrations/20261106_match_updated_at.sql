begin;
alter table public.matches add column if not exists updated_at timestamptz;
-- Existing rows remain NULL: their historical modification time is unknown.
alter table public.matches alter column updated_at set default now();
create or replace function public.set_match_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create or replace trigger set_match_updated_at before update on public.matches
for each row execute function public.set_match_updated_at();
notify pgrst, 'reload schema';
commit;

-- Only Super User (owner role) can approve/reject competition entries

create or replace function public.enforce_competition_entry_review_owner()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    if not exists (
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and coalesce(au.role, 'user') = 'owner'
    ) then
      raise exception 'Only Super User can approve or reject entries';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_competition_entries_review_owner on public.competition_entries;
create trigger trg_competition_entries_review_owner
before update on public.competition_entries
for each row
execute function public.enforce_competition_entry_review_owner();

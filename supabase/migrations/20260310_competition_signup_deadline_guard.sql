-- Enforce competition sign-up window at database level

create or replace function public.enforce_competition_signup_window()
returns trigger
language plpgsql
as $$
declare
  v_open boolean;
  v_deadline timestamptz;
begin
  select c.signup_open, c.signup_deadline
  into v_open, v_deadline
  from public.competitions c
  where c.id = new.competition_id;

  if v_open is distinct from true then
    raise exception 'Sign-ups are closed for this competition';
  end if;

  if v_deadline is not null and now() > v_deadline then
    raise exception 'Sign-up deadline has passed for this competition';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_competition_entries_signup_window on public.competition_entries;
create trigger trg_competition_entries_signup_window
before insert on public.competition_entries
for each row
execute function public.enforce_competition_signup_window();

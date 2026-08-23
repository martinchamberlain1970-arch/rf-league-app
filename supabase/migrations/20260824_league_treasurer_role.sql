-- Add League Treasurer as a named league-officer role. The three elected
-- officer roles share day-to-day league operation, approvals and invoicing,
-- while System Owner controls remain separate.

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'app_users'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.app_users drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.app_users
  add constraint app_users_role_check
  check (
    lower(coalesce(role, 'user')) in (
      'user',
      'admin',
      'league_secretary',
      'league_chairman',
      'league_treasurer',
      'super',
      'owner'
    )
  );

create or replace function public.is_league_manager(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.id = check_user_id
      and lower(coalesce(au.role, 'user')) in (
        'league_secretary',
        'league_chairman',
        'league_treasurer',
        'super',
        'owner'
      )
  );
$$;

revoke all on function public.is_league_manager(uuid) from public;
grant execute on function public.is_league_manager(uuid) to authenticated;

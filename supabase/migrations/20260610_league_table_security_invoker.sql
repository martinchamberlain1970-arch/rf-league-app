do $$
begin
  if exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'league_table'
  ) then
    execute 'alter view public.league_table set (security_invoker = true)';
  end if;
end
$$;

create table if not exists public.league_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  category text not null check (category in ('agm_minutes', 'league_rules', 'captain_meeting_minutes')),
  title text not null,
  description text null,
  file_name text not null,
  file_path text not null unique,
  file_url text not null,
  uploaded_by_user_id uuid null references public.app_users(id) on delete set null,
  is_active boolean not null default true
);

create index if not exists league_documents_category_idx
  on public.league_documents (category, created_at desc);

alter table public.league_documents enable row level security;

drop policy if exists league_documents_read_authenticated on public.league_documents;
create policy league_documents_read_authenticated
on public.league_documents
for select
to authenticated
using (is_active = true);

drop policy if exists league_documents_write_super_user on public.league_documents;
create policy league_documents_write_super_user
on public.league_documents
for all
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.id = auth.uid()
      and coalesce(au.role, 'user') in ('super', 'owner')
  )
)
with check (
  exists (
    select 1
    from public.app_users au
    where au.id = auth.uid()
      and coalesce(au.role, 'user') in ('super', 'owner')
  )
);

create or replace function public.set_league_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_league_documents_updated_at on public.league_documents;
create trigger set_league_documents_updated_at
before update on public.league_documents
for each row
execute function public.set_league_documents_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'league-documents',
  'league-documents',
  true,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

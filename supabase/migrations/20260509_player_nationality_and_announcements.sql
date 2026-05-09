alter table public.players
  add column if not exists nationality_name text,
  add column if not exists country_code text;

alter table public.player_update_requests
  add column if not exists requested_nationality_name text,
  add column if not exists requested_country_code text;

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',
  is_active boolean not null default false,
  updated_by_user_id uuid null references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists site_announcements_singleton_idx
  on public.site_announcements ((true));

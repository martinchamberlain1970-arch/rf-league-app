alter table public.league_fixtures
  add column if not exists pre_match_paper_record boolean not null default false,
  add column if not exists pre_match_paper_at timestamptz null,
  add column if not exists pre_match_paper_by_user_id uuid null references public.app_users(id) on delete set null,
  add column if not exists home_lineup_submitted_at timestamptz null,
  add column if not exists home_lineup_submitted_by_user_id uuid null references public.app_users(id) on delete set null,
  add column if not exists away_lineup_submitted_at timestamptz null,
  add column if not exists away_lineup_submitted_by_user_id uuid null references public.app_users(id) on delete set null;

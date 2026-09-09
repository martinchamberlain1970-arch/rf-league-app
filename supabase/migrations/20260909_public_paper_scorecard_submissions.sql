-- Public paper-scorecard fallback for teams that do not use an app account.
-- Evidence is held in a private bucket only while the submission awaits review.

alter table public.league_result_submissions
  alter column submitted_by_user_id drop not null,
  add column if not exists submission_source text not null default 'authenticated',
  add column if not exists public_submitter_name text null,
  add column if not exists public_submitter_team_id uuid null references public.league_teams(id) on delete set null,
  add column if not exists public_both_teams_confirmed boolean not null default false,
  add column if not exists public_submission_fingerprint text null,
  add column if not exists scorecard_photo_path text null,
  add column if not exists scorecard_photo_mime_type text null,
  add column if not exists scorecard_photo_original_name text null,
  add column if not exists scorecard_evidence_expires_at timestamptz null,
  add column if not exists scorecard_evidence_deleted_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'league_result_submissions_source_check'
  ) then
    alter table public.league_result_submissions
      add constraint league_result_submissions_source_check
      check (submission_source in ('authenticated', 'public_paper'));
  end if;
end $$;

create index if not exists league_result_submissions_public_fingerprint_idx
  on public.league_result_submissions (public_submission_fingerprint, created_at desc)
  where submission_source = 'public_paper';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'temporary-scorecards',
  'temporary-scorecards',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.league_result_submissions.scorecard_photo_path is
  'Private temporary evidence path. Removed automatically when an officer approves or rejects the submission.';


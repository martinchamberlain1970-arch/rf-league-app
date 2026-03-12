-- Player phone contact for off-platform scheduling (e.g. WhatsApp)
alter table if exists public.players
  add column if not exists phone_number text,
  add column if not exists phone_share_consent boolean not null default false;


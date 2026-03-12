alter table public.player_claim_requests
  add column if not exists requested_date_of_birth date;

comment on column public.player_claim_requests.requested_date_of_birth is
  'DOB submitted during signup/claim, applied when Super User approves the claim.';

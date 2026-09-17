-- Keep the app and PostgreSQL on the same exact-boundary rule.
-- Elo 1029 is in the -4 band; Elo 1030 begins the -8 band.
--
-- Mark Devonshire and Raj Puri were correctly set to -8 after Week 1, but the
-- JavaScript re-alignment used Math.round(-1.5), temporarily restoring -4.
-- Week 2 then appeared to move them from -4 to -8 despite no Elo movement.
-- Preserve those audit rows, but neutralise the two erroneous transitions.

update public.league_handicap_history
set delta = 0,
    previous_handicap = -8,
    new_handicap = -8,
    reason = 'Audit correction: Elo 1030 begins the -8 band; the earlier JavaScript re-alignment to -4 was a rounding artefact.'
where season_id = 'f141e65b-3a88-43e6-be20-bf3cdb601af9'::uuid
  and player_id in (
    '0934ade5-0ef3-46c2-ac43-350352be1dfc'::uuid,
    '6fc6b5ee-7b87-4d45-a9c9-33716108c529'::uuid
  )
  and previous_handicap = -8
  and new_handicap = -4
  and reason like 'Corrective Proposal 2 alignment after the Week % Elo rebuild (Elo 1030).';

update public.league_handicap_history
set delta = 0,
    previous_handicap = -8,
    new_handicap = -8,
    reason = 'Audit correction: no Week 2 handicap movement; Elo remained 1030 and the correct playing handicap remained -8.'
where season_id = 'f141e65b-3a88-43e6-be20-bf3cdb601af9'::uuid
  and player_id in (
    '0934ade5-0ef3-46c2-ac43-350352be1dfc'::uuid,
    '6fc6b5ee-7b87-4d45-a9c9-33716108c529'::uuid
  )
  and previous_handicap = -4
  and new_handicap = -8
  and reason = 'Automatic Proposal 2 handicap review after Premier League fixture week 2 (Elo 1030).';

update public.players
set snooker_handicap = -8
where id in (
  '0934ade5-0ef3-46c2-ac43-350352be1dfc'::uuid,
  '6fc6b5ee-7b87-4d45-a9c9-33716108c529'::uuid
)
  and rating_snooker = 1030;

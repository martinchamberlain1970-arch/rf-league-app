-- Rule 30: best of three before the semi-finals, best of five in the semi-finals and final.
update public.competitions as c
set best_of = 3,
    knockout_round_best_of = '{"round1": 3, "semi_final": 5, "final": 5}'::jsonb
where c.name in (
  'Cross Cup (Doubles Scratch) - 2026/2027',
  'Fred Osbourne (Over 60s) - 2026/2027',
  'Gary Webb (Singles Scratch) - 2026/2027',
  'Handicap Doubles - 2026/2027',
  'Henry Fidge (Under 25s Scratch Singles) - 2026/2027',
  'Jack Harvey (Over 50s) - 2026/2027',
  'Lee Ford (Singles Handicap) - 2026/2027'
)
and c.sport_type = 'snooker'
and c.competition_format = 'knockout'
and not c.is_archived
and not c.is_completed
and not exists (select 1 from public.matches m where m.competition_id = c.id);

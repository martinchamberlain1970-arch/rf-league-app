-- Seed league knockout competitions for sign-up + draw workflow

do $$
begin
  if not exists (select 1 from public.competitions where name = 'Gary Webb (Singles Scratch)') then
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Gary Webb (Singles Scratch)', 'snooker', 'knockout', 'singles', 1, false, false, false);
  end if;

  if not exists (select 1 from public.competitions where name = 'Lee Ford (Singles Handicap)') then
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Lee Ford (Singles Handicap)', 'snooker', 'knockout', 'singles', 1, false, false, false);
  end if;

  if not exists (select 1 from public.competitions where name = 'Cross Cup (Doubles Scratch)') then
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Cross Cup (Doubles Scratch)', 'snooker', 'knockout', 'doubles', 1, false, false, false);
  end if;

  if not exists (select 1 from public.competitions where name = 'Handicap Doubles') then
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Handicap Doubles', 'snooker', 'knockout', 'doubles', 1, false, false, false);
  end if;

  if not exists (select 1 from public.competitions where name = 'Jack Harvey (Over 50s)') then
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Jack Harvey (Over 50s)', 'snooker', 'knockout', 'singles', 1, false, false, false);
  end if;

  if not exists (select 1 from public.competitions where name = 'Fred Osbourne (Over 60s)') then
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Fred Osbourne (Over 60s)', 'snooker', 'knockout', 'singles', 1, false, false, false);
  end if;

  if not exists (select 1 from public.competitions where name = 'Hamilton Cup (Billiards Singles)') then
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Hamilton Cup (Billiards Singles)', 'snooker', 'knockout', 'singles', 1, false, false, false);
  end if;

  if not exists (select 1 from public.competitions where name = 'Hodge Cup (Triples)') then
    -- current match engine supports singles/doubles; seeded as doubles placeholder for now
    insert into public.competitions (name, sport_type, competition_format, match_mode, best_of, signup_open, is_archived, is_completed)
    values ('Hodge Cup (Triples)', 'snooker', 'knockout', 'doubles', 1, false, false, false);
  end if;
end $$;

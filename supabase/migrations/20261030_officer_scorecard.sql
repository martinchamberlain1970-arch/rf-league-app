-- Save an officer's complete card and breaks together; reject stale drafts.
create or replace function public.save_officer_scorecard(
  p_fixture_id uuid, p_frames jsonb, p_expected_frames jsonb,
  p_breaks jsonb, p_expected_breaks jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare
  expected jsonb;
  actual_breaks jsonb;
begin
  perform 1 from league_fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found'; end if;
  perform 1 from league_fixture_frames where fixture_id = p_fixture_id for update;
  if jsonb_array_length(p_frames) <> (select count(*) from league_fixture_frames where fixture_id = p_fixture_id)
     or jsonb_array_length(p_expected_frames) <> jsonb_array_length(p_frames)
     or (select count(distinct value->>'id') from jsonb_array_elements(p_frames)) <> jsonb_array_length(p_frames) then
    raise exception 'Frame list changed. Reload the scorecard before saving.';
  end if;
  for expected in select value from jsonb_array_elements(p_expected_frames) loop
    if not exists (select 1 from league_fixture_frames f where f.fixture_id = p_fixture_id and f.id = (expected->>'id')::uuid and to_jsonb(f) @> expected) then
      raise exception 'This scorecard changed on another device. Reload before saving; your draft has not been published.';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_frames) proposed where not exists
    (select 1 from league_fixture_frames f where f.fixture_id = p_fixture_id and f.id = (proposed->>'id')::uuid
      and f.slot_no = (proposed->>'slot_no')::int and f.slot_type = proposed->>'slot_type')) then
    raise exception 'Invalid frame identity';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'player_id', player_id, 'entered_player_name', coalesce(entered_player_name, ''), 'break_value', break_value::text) order by id), '[]'::jsonb)
    into actual_breaks from league_fixture_breaks where fixture_id = p_fixture_id;
  if actual_breaks <> (select coalesce(jsonb_agg(value order by value->>'id'), '[]'::jsonb) from jsonb_array_elements(p_expected_breaks)) then
    raise exception 'Break entries changed on another device. Reload before saving.';
  end if;
  update league_fixture_frames f set
    home_player1_id = r.home_player1_id, home_player2_id = r.home_player2_id,
    away_player1_id = r.away_player1_id, away_player2_id = r.away_player2_id,
    home_nominated = r.home_nominated, away_nominated = r.away_nominated,
    home_forfeit = r.home_forfeit, away_forfeit = r.away_forfeit,
    home_nominated_name = r.home_nominated_name, away_nominated_name = r.away_nominated_name,
    home_points_scored = r.home_points_scored, away_points_scored = r.away_points_scored,
    winner_side = r.winner_side
  from jsonb_populate_recordset(null::league_fixture_frames, p_frames) r
  where f.id = r.id and f.fixture_id = p_fixture_id;
  delete from league_fixture_breaks where fixture_id = p_fixture_id;
  insert into league_fixture_breaks(fixture_id, player_id, entered_player_name, break_value)
    select p_fixture_id, r.player_id, r.entered_player_name, r.break_value
    from jsonb_to_recordset(p_breaks) r(player_id uuid, entered_player_name text, break_value integer);
end;
$$;
revoke all on function public.save_officer_scorecard(uuid,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_officer_scorecard(uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

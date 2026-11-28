import fs from "node:fs";
import assert from "node:assert/strict";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [cup, winter, premier, home, away, premierTeam, venue, pending, ordinary] = Array.from({ length: 9 }, (_, i) => uuid(i + 1));

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function public.is_league_manager(uuid) returns boolean language sql as 'select true';
    create table competitions(id uuid primary key, name text, is_archived boolean default false,
      is_completed boolean default false, signup_open boolean default true, signup_deadline timestamptz, final_venue_location_id uuid);
    create table league_seasons(id uuid primary key, name text, is_active boolean default true,
      is_published boolean default true, singles_count int default 4, doubles_count int default 1, handicap_enabled boolean default false);
    create table league_teams(id uuid primary key, season_id uuid, location_id uuid, is_active boolean default true);
    create table competition_entries(competition_id uuid, league_team_id uuid, status text);
    create table league_fixtures(id uuid primary key default gen_random_uuid(), season_id uuid, home_team_id uuid,
      away_team_id uuid, location_id uuid, week_no int, fixture_date date, status text default 'pending',
      home_points int default 0, away_points int default 0);
    create table league_result_submissions(fixture_id uuid, status text);
    create table league_fixture_frames(fixture_id uuid references league_fixtures(id) on delete cascade, slot_no int, slot_type text);
    create function seed_frames() returns trigger language plpgsql as $$
    begin
      insert into league_fixture_frames
        select new.id, i, case when i <= s.singles_count then 'singles' else 'doubles' end
        from league_seasons s cross join lateral generate_series(1,s.singles_count+s.doubles_count) i
        where s.id = new.season_id;
      return new;
    end;
    $$;
    create trigger seed after insert on league_fixtures for each row execute function seed_frames();
    create view league_table with (security_invoker=true) as
      select f.season_id, sum(f.home_points) as points from league_fixtures f
      where f.status = 'complete'::text group by f.season_id;
    insert into competitions(id,name,signup_deadline) values ('${cup}', 'Mick White Memorial Cup - 2026/2027', now() + interval '1 day');
    insert into league_seasons(id,name) values ('${winter}', 'Winter Division 1 2026/2027'), ('${premier}', 'Winter Premier League 2026/2027');
    insert into league_teams(id,season_id,location_id) values ('${home}', '${winter}', '${venue}'),
      ('${away}', '${winter}', '${venue}'), ('${pending}', '${winter}', '${venue}'), ('${premierTeam}', '${premier}', '${venue}');
    insert into competition_entries values ('${cup}', '${home}', 'approved'), ('${cup}', '${away}', 'approved'),
      ('${cup}', '${pending}', 'pending'), ('${cup}', '${premierTeam}', 'approved');
    insert into league_fixtures(id,season_id,home_team_id,away_team_id,fixture_date,status,home_points,away_points)
      values ('${ordinary}', '${winter}', '${home}', '${away}', '2026-12-01', 'complete', 4, 1);
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20260826_combined_winter_fixture_trigger_frames.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20261203_mick_white_match_night.sql", "utf8"));

  const schedule = async (a, b, date = "2026-12-02") => (await db.query(
    "select schedule_mick_white_fixture($1,$2,$3,$4) as id", [cup, a, b, date]
  )).rows[0].id;
  await assert.rejects(schedule(home, away), /Close entries/);
  await db.exec("update competitions set signup_deadline = now() - interval '1 minute'");
  await assert.rejects(schedule(home, premierTeam), /scratch Division One/);
  await assert.rejects(schedule(home, pending), /approved cup entries/);
  await assert.rejects(schedule(home, away, "2026-12-01"), /already has a fixture/);

  const fixture = await schedule(home, away);
  assert.equal(await schedule(home, away), fixture, "Retries reuse the scorecard");
  await assert.rejects(schedule(away, home), /already has a cup fixture/);
  const frames = await db.query("select slot_type from league_fixture_frames where fixture_id=$1 order by slot_no", [fixture]);
  assert.deepEqual(frames.rows.map((row) => row.slot_type), ["singles", "singles", "singles", "singles", "doubles"]);
  const stored = await db.query("select cup_competition_id, season_id, location_id, week_no from league_fixtures where id=$1", [fixture]);
  assert.deepEqual(stored.rows[0], { cup_competition_id: cup, season_id: winter, location_id: venue, week_no: null });

  await db.query("update league_fixtures set status='complete', home_points=3, away_points=2 where id=$1", [fixture]);
  assert.equal(Number((await db.query("select points from league_table")).rows[0].points), 4, "Cup score is excluded from league points");
  await db.query("update league_fixtures set status='pending' where id=$1", [ordinary]);
  await db.query("select replace_combined_winter_fixtures($1,$2)", [[winter, premier], JSON.stringify([
    { season_id: winter, location_id: venue, week_no: 1, fixture_date: "2026-12-03", home_team_id: home, away_team_id: away },
  ])]);
  assert.equal((await db.query("select id from league_fixtures where cup_competition_id=$1", [cup])).rows[0].id, fixture);
  await db.exec(fs.readFileSync("supabase/migrations/20261204_mick_white_official_draw.sql", "utf8"));
  const automaticCup = uuid(10);
  const outsiders = [uuid(11), uuid(12), uuid(13)];
  const allTeams = [home, away, ...outsiders];
  await db.query("insert into competitions(id,name) values ($1,'Mick White Team Test - 2026/2027')", [automaticCup]);
  for (const team of outsiders) await db.query("insert into league_teams(id,season_id,location_id) values ($1,$2,$3)", [team, winter, venue]);
  for (const team of allTeams) await db.query("insert into competition_entries values ($1,$2,'approved')", [automaticCup, team]);

  const pairings = [{ home, away }, ...outsiders.map((team) => ({ home: team, away: null }))];
  const publish = (pairs = pairings) => db.query("select publish_mick_white_draw($1,$2)", [automaticCup, JSON.stringify(pairs)]);
  const readDraw = async () => (await db.query("select * from mick_white_draw where competition_id=$1 order by round_no,match_no", [automaticCup])).rows;
  const dateTie = async (tie, date) => (await db.query("select date_mick_white_draw_tie($1,$2,$3) as id", [automaticCup, tie.id, date])).rows[0].id;
  await assert.rejects(publish(), /Close entries/);
  await db.query("update competitions set signup_open=false where id=$1", [automaticCup]);
  await db.query("update competition_entries set status='pending' where competition_id=$1 and league_team_id=$2", [automaticCup, away]);
  await assert.rejects(publish(), /Review all pending/);
  await db.query("update competition_entries set status='approved' where competition_id=$1", [automaticCup]);
  await assert.rejects(publish(pairings.map((pair, i) => i === 3 ? { home, away: null } : pair)), /Entries changed/);
  assert.equal((await readDraw()).length, 0);
  await publish();
  await assert.rejects(publish(), /already been published/);
  let draw = await readDraw();
  assert.equal(draw.length, 7);
  assert.equal(draw.filter((tie) => tie.is_bye).length, 3);
  assert.ok(draw.every((tie) => !tie.fixture_id && !tie.fixture_date), "Publishing leaves fixtures undated");
  await assert.rejects(dateTie(draw[1], "2026-12-04"), /both teams/);
  await assert.rejects(dateTie(draw[4], "2026-12-04"), /both teams/);
  const opener = await dateTie(draw[0], "2026-12-04");
  assert.equal(await dateTie(draw[0], "2026-12-04"), opener);
  assert.equal((await db.query("select count(*)::int as n from league_fixture_frames where fixture_id=$1", [opener])).rows[0].n, 5);
  await db.query("update league_fixtures set status='complete', home_points=3, away_points=2 where id=$1", [opener]);
  await db.query("insert into league_result_submissions values ($1,'pending')", [opener]);
  draw = await readDraw();
  assert.equal(draw[4].home_team_id, home);
  assert.equal(draw[4].away_team_id, outsiders[0]);
  await assert.rejects(dateTie(draw[4], "2026-12-05"), /Approve the preceding results/);
  await db.query("update league_result_submissions set status='approved' where fixture_id=$1", [opener]);
  const semifinalA = await dateTie(draw[4], "2026-12-05");
  const semifinalB = await dateTie(draw[5], "2026-12-05");
  await db.query("update league_fixtures set status='complete', home_points=4, away_points=1 where id in ($1,$2)", [semifinalA, semifinalB]);
  const final = (await readDraw())[6];
  assert.deepEqual([final.home_team_id, final.away_team_id], [home, outsiders[1]]);
  await assert.rejects(dateTie(final, "2026-12-06"), /neutral final venue/);
  const neutralVenue = uuid(14);
  await db.query("update competitions set final_venue_location_id=$1 where id=$2", [neutralVenue, automaticCup]);
  const finalFixture = await dateTie(final, "2026-12-06");
  assert.equal((await db.query("select location_id from league_fixtures where id=$1", [finalFixture])).rows[0].location_id, neutralVenue);
  await db.exec("grant select on competitions, league_fixtures to authenticated");
  await db.exec("set role authenticated");
  await assert.rejects(schedule(home, away), /permission denied/);
  await assert.rejects(publish(), /permission denied/);
  await assert.rejects(dateTie(final, "2026-12-06"), /permission denied/);
  assert.equal((await readDraw()).length, 7);
  console.log("PASS: cup scorecards, standings isolation, locked official draw, byes, winner progression, agreed dates and neutral final venue.");
} finally {
  await db.close();
}

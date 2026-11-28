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
      is_completed boolean default false, signup_open boolean default true, signup_deadline timestamptz);
    create table league_seasons(id uuid primary key, name text, is_active boolean default true,
      is_published boolean default true, singles_count int default 4, doubles_count int default 1, handicap_enabled boolean default false);
    create table league_teams(id uuid primary key, season_id uuid, location_id uuid, is_active boolean default true);
    create table competition_entries(competition_id uuid, league_team_id uuid, status text);
    create table league_fixtures(id uuid primary key default gen_random_uuid(), season_id uuid, home_team_id uuid,
      away_team_id uuid, location_id uuid, week_no int, fixture_date date, status text default 'pending',
      home_points int default 0, away_points int default 0);
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
  await db.exec("set role authenticated");
  await assert.rejects(schedule(home, away), /permission denied/);
  console.log("PASS: eligibility, deadline, fixture conflicts, five-frame scorecard, retries, standings isolation, schedule replacement and RPC access.");
} finally {
  await db.close();
}

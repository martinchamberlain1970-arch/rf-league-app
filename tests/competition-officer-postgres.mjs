import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create table competitions (
    id uuid primary key, max_entries int, is_archived bool default false, is_completed bool default false,
    competition_format text default 'knockout', signup_open bool default true, signup_deadline timestamptz
  );
  create table competition_entries (
    id uuid primary key default gen_random_uuid(), competition_id uuid, player_id uuid, entrant_date_of_birth date,
    requester_user_id uuid, status text, reviewed_by_user_id uuid, reviewed_at timestamptz, note text
  );
  create table matches (
    id uuid primary key default gen_random_uuid(), competition_id uuid, round_no int, match_no int, best_of int,
    status text, match_mode text, player1_id uuid, player2_id uuid, team1_player1_id uuid, team1_player2_id uuid,
    team2_player1_id uuid, team2_player2_id uuid, winner_player_id uuid, opening_break_player_id uuid,
    is_archived bool default false
  );
`);
await db.exec(readFileSync(new URL("../supabase/migrations/20261130_officer_competition_entry_and_draw.sql", import.meta.url), "utf8"));

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const cup = id(1), officer = id(2);
await db.query("insert into competitions (id) values ($1)", [cup]);

const add = (playerIds) => db.query("select add_officer_competition_entry($1, $2, $3::uuid[], null, $4::jsonb) as id",
  [cup, officer, playerIds, JSON.stringify({ teamMemberIds: playerIds.slice(1) })]);
const first = (await add([id(3), id(4), id(5)])).rows[0].id;
await assert.rejects(add([id(8), id(5), id(9)]), /already has an active entry/);
const second = (await add([id(6), id(7), id(8)])).rows[0].id;

const ties = JSON.stringify([{
  match_no: 1, best_of: 1, status: "pending", match_mode: "doubles",
  team1_player1_id: id(3), team1_player2_id: id(4), team2_player1_id: id(6), team2_player2_id: id(7),
}]);
const publish = (entries) => db.query("select publish_competition_opening_draw($1, $2::uuid[], $3::jsonb)", [cup, entries, ties]);
await assert.rejects(publish([first, second]), /Close entries/);
await db.query("update competitions set signup_open = false where id = $1", [cup]);
await assert.rejects(publish([first]), /Entries changed/);
await publish([first, second]);

const match = (await db.query("select * from matches")).rows[0];
assert.equal(match.match_mode, "doubles");
assert.equal(match.team2_player1_id, id(6));
await assert.rejects(publish([first, second]), /already exists/);
await assert.rejects(add([id(9), id(10), id(11)]), /already been published/);
const acl = (await db.query(`select has_function_privilege('authenticated', 'public.publish_competition_opening_draw(uuid,uuid[],jsonb)', 'execute') as allowed`)).rows[0];
assert.equal(acl.allowed, false);
await db.close();
console.log("Officer inserts, duplicate checks, draw publication and retries passed.");

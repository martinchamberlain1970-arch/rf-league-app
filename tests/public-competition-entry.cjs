const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");
const vm = require("node:vm");

const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/public-competition-entry.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsForTest });

const { validatePublicSelections } = exportsForTest;
const team = new Set(["captain-player", "same-team-player"]);
const club = new Set([...team, "other-team-player", "other-division-player"]);
const doubles = { id: "cup", name: "Cross Cup (Doubles Scratch)", match_mode: "doubles" };
const triples = { id: "cup", name: "Hodge Cup (Triples)", match_mode: "doubles" };
const singles = { id: "cup", name: "Gary Webb (Singles Scratch)", match_mode: "singles" };

function check(competition, ...groups) {
  return validatePublicSelections([{
    competitionId: competition.id, decision: "enter",
    entries: groups.map((playerIds) => ({ playerIds, entrantDateOfBirth: "" })),
  }], [competition], team, club, true, new Map());
}

test("doubles and triples accept partners from other teams and divisions at the same club", () => {
  assert.equal(check(doubles, ["captain-player", "other-division-player"]), null);
  assert.equal(check(triples, ["captain-player", "other-team-player", "other-division-player"]), null);
});

test("rejects other-club partners, missing slots and entries with no player from the team", () => {
  assert.match(check(doubles, ["captain-player", "other-club-player"]), /same club/);
  assert.match(check(doubles, ["", "captain-player"]), /needs 2 players/);
  assert.match(check(singles, ["other-team-player"]), /from the selected team/);
  assert.match(check(doubles, ["other-team-player", "other-division-player"]), /from the selected team/);
});

test("rejects a partner entered twice in the same competition", () => {
  assert.match(check(doubles, ["captain-player", "other-team-player"], ["same-team-player", "other-team-player"]), /repeated/);
});

test("all dropdowns for a competition exclude selected players and partners except the current slot", () => {
  const { selectedPlayerCounts, maySelectCompetitionPlayer } = exportsForTest;
  const counts = selectedPlayerCounts([
    { playerIds: ["first", "partner"] },
    { playerIds: ["", "third"] },
  ]);
  assert.equal(maySelectCompetitionPlayer("first", "", counts), false);
  assert.equal(maySelectCompetitionPlayer("partner", "", counts), false);
  assert.equal(maySelectCompetitionPlayer("third", "first", counts), false);
  assert.equal(maySelectCompetitionPlayer("first", "first", counts), true);
  assert.equal(maySelectCompetitionPlayer("unused", "", counts), true);
  const afterRemoval = selectedPlayerCounts([{ playerIds: ["", "third"] }]);
  assert.equal(maySelectCompetitionPlayer("partner", "", afterRemoval), true);
});

test("a saved submission can be reopened after closing and returns names without private form details", async () => {
  const token = "a".repeat(48);
  const queried = [];
  const client = {
    from(table) {
      queried.push(table);
      let key;
      const query = {
        select: () => query,
        eq: (_column, value) => { key = value; return query; },
        in: () => query,
        order: () => query,
        maybeSingle: async () => ({ data: table === "league_teams" ? { name: "Test Team" } : key === token ? {
          team_id: "team", status: "submitted", submitted_at: "2026-11-25T19:00:00Z",
          contact_phone: "private-phone",
          selections: [
            { competitionId: "cross", decision: "enter", entries: [{ playerIds: ["alex", "sam"], entrantDateOfBirth: "private-dob" }] },
            { competitionId: "hodge", decision: "no_entry", entries: [] },
          ],
        } : null }),
        then: (resolve) => resolve({ data: table === "competitions" ? [
          { id: "cross", name: "Cross Cup", signup_deadline: "2025-01-01" },
          { id: "hodge", name: "Hodge Cup", signup_deadline: "2025-01-01" },
        ] : table === "players" ? [
          { id: "alex", full_name: "Alex Example" }, { id: "sam", display_name: "Sam Example" },
        ] : [] }),
      };
      return query;
    },
  };
  const endpoint = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/app/api/public/competition-entry-form/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: endpoint,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "test", SUPABASE_SERVICE_ROLE_KEY: "test" } },
    require: (name) => ({
      "next/server": { NextResponse: Response },
      "@supabase/supabase-js": { createClient: () => client },
      "@/lib/public-competition-entry": exportsForTest,
      "@/lib/fixed-competition-handicaps": { competitionEntriesOpen: () => false },
    })[name],
  });
  const get = (query) => endpoint.GET({ nextUrl: new URL("https://test/entries" + query) });
  const response = await get("?draftToken=" + token);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { receipt: {
    teamName: "Test Team", submittedAt: "2026-11-25T19:00:00Z",
    competitions: [
      { name: "Cross Cup", groups: [["Alex Example", "Sam Example"]] },
      { name: "Hodge Cup", groups: [] },
    ],
  } });
  assert.ok(!queried.includes("league_seasons"));
  assert.equal((await (await get("?draftToken=" + "b".repeat(48))).json()).receipt, undefined);
  assert.equal((await (await get("?teamId=team")).json()).receipt, undefined);
});

test("pending competition entries group by captain's form without merging separate forms or individual entries", () => {
  const { groupTeamCompetitionEntries } = exportsForTest;
  const teamEntry = (id, teamId, token) => ({
    id, requester_user_id: null,
    note: JSON.stringify({ source: "public_team_competition_form", teamId, draftToken: token.repeat(48) }),
  });
  const first = teamEntry("a1", "greenhithe", "a");
  const second = teamEntry("a2", "greenhithe", "a");
  const separate = teamEntry("b1", "greenhithe", "b");
  const jordans = teamEntry("c1", "jordans", "c");
  const individual = { ...teamEntry("d1", "greenhithe", "a"), requester_user_id: "player" };
  const malformed = { id: "e1", requester_user_id: null, note: "old note" };
  const grouped = groupTeamCompetitionEntries([first, second, separate, jordans, individual, malformed]);
  assert.equal(grouped.forms.length, 3);
  assert.equal(grouped.forms[0].id, "a1");
  assert.equal(grouped.forms[0].entries.length, 2);
  assert.equal(grouped.forms[1].entries[0].id, "b1");
  assert.equal(grouped.forms[2].teamId, "jordans");
  assert.equal(grouped.individual.length, 2);
});

test("three-player cups retain their own sport, entry size and scoring descriptions", () => {
  const { competitionEntryFormat, entrantsRequired, specialCompetitionScoring } = exportsForTest;
  const hodge = { ...triples, name: "Hodge Cup (Triples) - 2026/2027" };
  const albery = { ...doubles, name: "Albery Cup (Billiards 3-Man Team) - 2026/2027", sport_type: "snooker" };
  assert.equal(entrantsRequired(hodge), 3);
  assert.equal(entrantsRequired(albery), 3);
  assert.equal(competitionEntryFormat(hodge).mode, "Three-player team");
  assert.equal(competitionEntryFormat(hodge).sport, "Snooker");
  assert.equal(competitionEntryFormat(albery).mode, "Three-player team");
  assert.equal(competitionEntryFormat(albery).sport, "Billiards");
  assert.match(specialCompetitionScoring(hodge.name), /First to 5 points/);
  assert.match(specialCompetitionScoring(albery.name), /100, 200 and 300/);
  assert.equal(competitionEntryFormat(doubles).mode, "Doubles");
});

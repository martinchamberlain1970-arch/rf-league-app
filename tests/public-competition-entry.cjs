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

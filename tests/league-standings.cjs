const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/league-standings.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsForTest });

const { rankLeagueStandings } = exportsForTest;

test("league points come first, then matches won", () => {
  const rows = [
    { name: "Bexley A", points: 32, won: 7, frameDiff: 14 },
    { name: "Jordans", points: 32, won: 9, frameDiff: 10 },
    { name: "Greenhithe A", points: 27, won: 10, frameDiff: 16 },
  ];

  const ranked = rankLeagueStandings(rows, (team) => team.name);

  assert.deepEqual(Array.from(ranked, ({ name, rank }) => [name, rank]),
    [["Jordans", 1], ["Bexley A", 2], ["Greenhithe A", 3]]);
  assert.equal(rows[0].name, "Bexley A");
});

test("teams tied on points and wins share a rank even with different frame differences", () => {
  const rows = [
    { name: "Perry Street B", points: 24, won: 4, frameDiff: 3 },
    { name: "Greenhithe B", points: 24, won: 4, frameDiff: -2 },
    { name: "Traders B", points: 21, won: 4, frameDiff: -8 },
  ];

  const ranked = rankLeagueStandings(rows, (team) => team.name);

  assert.deepEqual(Array.from(ranked, ({ name, rank }) => [name, rank]),
    [["Greenhithe B", 1], ["Perry Street B", 1], ["Traders B", 3]]);
});

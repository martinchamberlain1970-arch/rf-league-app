const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");
const vm = require("node:vm");

const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/knockout-draw.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsForTest });

const { knockoutSize, knockoutOpeningRound, entryRoster, isLeagueCup, knockoutMatchFields, knockoutMatchSides, knockoutBestOf } = exportsForTest;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("standard opening rounds allocate one slot per entry and never pair two empty slots", () => {
  for (let count = 2; count <= 80; count++) {
    const entrants = Array.from({ length: count }, (_, index) => `entry-${index}`);
    const { rounds, byes, matches } = knockoutSize(count);
    const draw = knockoutOpeningRound(entrants);
    assert.equal(draw.length, 2 ** (rounds - 1));
    assert.equal(draw.filter((tie) => !tie.away).length, byes);
    assert.equal(draw.filter((tie) => tie.away).length, matches);
    assert.deepEqual(plain(draw.flatMap(({ home, away }) => away ? [home, away] : [home])).sort(), entrants.sort());
  }
  assert.equal(knockoutOpeningRound(["sole entrant"]).length, 0);
});

test("pairs and triples share a fixture representation and a bye retains both stored player slots", () => {
  const trio = { id: "entry", player_id: "one", note: '{"teamMemberIds":["two","three"]}' };
  assert.deepEqual(plain(entryRoster(trio)), ["one", "two", "three"]);
  assert.deepEqual(plain(knockoutMatchSides(knockoutMatchFields(entryRoster(trio), [], true))), {
    home: ["one", "two"], away: [],
  });
  assert.deepEqual(plain(entryRoster({ ...trio, note: '{"teamMemberNames":["Unlinked"]}' })), ["one"]);
});

test("league cup checks and short brackets apply special round settings", () => {
  assert.equal(isLeagueCup("Henry Fidge (Under 25s Scratch Singles) - 2026/2027"), true);
  assert.equal(isLeagueCup("Club practice event"), false);
  const bestOf = { round1: 3, semi_final: 5, final: 7 };
  assert.equal(knockoutBestOf(bestOf, 3, 1, 2), 5);
  assert.equal(knockoutBestOf(bestOf, 3, 1, 1), 7);
  assert.equal(knockoutBestOf(bestOf, 3, 1, 4), 3);
});

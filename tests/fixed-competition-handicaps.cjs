const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => dependencies[name] });
  return exports;
}
const publicRules = load('src/lib/fixed-competition-handicaps.ts');
const { fixedHandicapsForMatch } = load('src/lib/fixed-competition-handicaps-server.ts', {
  '@/lib/fixed-competition-handicaps': publicRules,
  '@/lib/snooker-handicap': load('src/lib/snooker-handicap.ts'),
});

const match = {
  competition_id: 'comp', player1_id: 'a', player2_id: 'c',
  team1_player1_id: 'a', team1_player2_id: 'b', team2_player1_id: 'c', team2_player2_id: 'd',
};
const lockedAt = '2026-12-04T20:00:00Z';
const records = [{ player_id: 'a', handicap: -20 }, { player_id: 'b', handicap: 4 },
  { player_id: 'c', handicap: 12 }, { player_id: 'd', handicap: 16 }];
function mock(cutoff = lockedAt, players = records) {
  return {
    rpc: async () => ({ data: cutoff }),
    from: () => ({ select: () => ({ eq: () => ({ in: async (_key, ids) => ({ data: players.filter((p) => ids.includes(p.player_id)) }) }) }) }),
  };
}
test('competition entry closes at the configured time even on the same UK date', () => {
  assert.equal(publicRules.competitionEntriesOpen(lockedAt, new Date('2026-12-04T19:59:59Z')), true);
  assert.equal(publicRules.competitionEntriesOpen(lockedAt, new Date('2026-12-04T20:00:01Z')), false);
  assert.match(publicRules.competitionDeadlineLabel(lockedAt), /4 December 2026.*20:00/);
});
test('singles uses the difference of fixed handicaps and doubles averages each pair', async () => {
  const singles = await fixedHandicapsForMatch(mock(), match, 'Lee Ford (Singles Handicap) - 2026/2027');
  assert.equal(singles.awayStart, 32);
  assert.equal(singles.homeStart, 0);
  const doubles = await fixedHandicapsForMatch(mock(), match, 'Handicap Doubles - 2026/2027');
  assert.equal(doubles.homeHandicap, -8);
  assert.equal(doubles.awayHandicap, 14);
  assert.equal(doubles.awayStart, 22);
});
test('scratch and earlier editions bypass the rule, and missing snapshots never imply scratch', async () => {
  const singles = 'Lee Ford (Singles Handicap) - 2026/2027';
  assert.equal(await fixedHandicapsForMatch(null, match, 'Cross Cup (Doubles Scratch) - 2026/2027'), null);
  assert.equal(await fixedHandicapsForMatch(null, match, 'Handicap Doubles - 2025/2026'), null);
  assert.equal((await fixedHandicapsForMatch(mock(null), match, singles)).ready, false);
  assert.equal((await fixedHandicapsForMatch(mock(lockedAt, records.slice(0, 1)), match, singles)).ready, false);
});

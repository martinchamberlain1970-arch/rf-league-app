const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync('src/lib/fixture-date-emails.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ status = 'rescheduled', actualDate = '2026-11-25', homeEmail = 'home@example.com', alreadySent = false, failedAddress } = {}) {
  const sent = [];
  const logs = [];
  const tables = {
    league_fixture_change_requests: [{ fixture_id: 'fixture', status, original_fixture_date: '2026-11-26', agreed_fixture_date: '2026-11-25' }],
    league_fixtures: [{ home_team_id: 'home', away_team_id: 'away', season_id: 'season', fixture_date: actualDate, status: 'pending' }],
    league_teams: [{ id: 'home', name: 'Traders B', captain_email: homeEmail }, { id: 'away', name: 'Greenhithe B' }],
    league_team_members: [{ team_id: 'home', player_id: 'p1' }, { team_id: 'away', player_id: 'p2' }],
    players: [{ id: 'p1', full_name: 'Home Captain' }, { id: 'p2', full_name: 'Away Captain', claimed_by: 'claimed' }],
    audit_logs: alreadySent ? [{ meta: { team_id: 'home', fixture_date: '2026-11-25' } }] : [],
  };
  const client = {
    from(table) {
      const data = tables[table];
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: data[0] }),
        single: async () => ({ data: data[0] }),
        then: (resolve) => resolve({ data }),
        insert: async (record) => { logs.push(record); return {}; },
      };
      return builder;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'away@example.com', email_confirmed_at: '2026-10-20' } } }) } },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({
    sendNotificationEmail: async (message) => { sent.push(message); return { sent: message.to !== failedAddress }; },
  }) });
  return { run: () => exports.emailFixtureCaptains(client, 'request', 'officer'), sent, logs };
}

test('confirmed date is emailed to both captains and successes are recorded', async () => {
  const fixture = setup();
  assert.equal((await fixture.run()).sent, true);
  assert.deepEqual(fixture.sent.map((message) => message.to).sort(), ['away@example.com', 'home@example.com']);
  assert.ok(fixture.sent.every((message) => /Wednesday,? 25 November 2026/.test(message.text)));
  assert.equal(new Set(fixture.sent.map((message) => message.idempotencyKey)).size, 2);
  assert.equal(fixture.logs.length, 2);
});

test('an already emailed captain is skipped when retrying', async () => {
  const fixture = setup({ alreadySent: true });
  assert.equal((await fixture.run()).sent, true);
  assert.deepEqual(fixture.sent.map((message) => message.to), ['away@example.com']);
});

test('missing contacts and provider failures are reported without a success receipt', async () => {
  const fixture = setup({ homeEmail: '', failedAddress: 'away@example.com' });
  const result = await fixture.run();
  assert.equal(result.sent, false);
  assert.match(result.message, /no captain email available/);
  assert.match(result.message, /email provider did not accept/);
  assert.equal(fixture.logs.length, 0);
});

test('an unconfirmed or superseded fixture date sends nothing', async () => {
  for (const fixture of [setup({ status: 'approved_outstanding' }), setup({ actualDate: '2026-12-02' })]) {
    assert.equal((await fixture.run()).sent, false);
    assert.equal(fixture.sent.length, 0);
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function compile(file) {
  return ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const pagination = {};
vm.runInNewContext(compile('src/lib/supabase-pagination.ts'), { exports: pagination });
const route = compile('src/app/api/league/fixture-change-requests/route.ts');

function setup(role, { linked = true, signedIn = true } = {}) {
  const fixtureDate = new Date().toISOString().slice(0, 10);
  const tables = {
    app_users: linked ? [{ id: 'session-user', linked_player_id: 'player' }] : [],
    league_team_members: [{ player_id: 'player', team_id: 'home', is_captain: role === 'captain', is_vice_captain: role === 'vice' }],
    league_fixtures: [
      { id: 'match', home_team_id: 'home', away_team_id: 'away', fixture_date: fixtureDate, status: 'pending' },
      { id: 'unrelated', home_team_id: 'other', away_team_id: 'away', fixture_date: fixtureDate, status: 'pending' },
    ],
    league_fixture_change_requests: [
      { id: 'old', fixture_id: 'match', agreed_fixture_date: '2000-01-01', status: 'rescheduled', created_at: '2000-01-01' },
      { id: 'latest', fixture_id: 'match', agreed_fixture_date: fixtureDate, status: 'rescheduled', created_at: fixtureDate },
      { id: 'unrelated', fixture_id: 'unrelated', agreed_fixture_date: fixtureDate, status: 'rescheduled', created_at: fixtureDate },
    ],
    league_teams: [{ id: 'home', name: 'Traders B' }, { id: 'away', name: 'Greenhithe B' }],
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'session-user' } : null } }) },
    from(table) {
      let rows = tables[table];
      const query = {
        select: () => query,
        eq: (key, value) => { if (!key.includes('.')) rows = rows.filter((row) => row[key] === value); return query; },
        in: (key, values) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
        or: (filter) => {
          if (table === 'league_team_members') {
            assert.equal(filter, 'is_captain.eq.true,is_vice_captain.eq.true');
            rows = rows.filter((row) => row.is_captain || row.is_vice_captain);
          } else {
            const ids = filter.match(/home_team_id\.in\.\(([^)]+)\)/)[1].split(',');
            rows = rows.filter((row) => ids.includes(row.home_team_id) || ids.includes(row.away_team_id));
          }
          return query;
        },
        gte: () => query,
        neq: () => query,
        order: () => query,
        range: async (from, to) => ({ data: rows.slice(from, to + 1) }),
        maybeSingle: async () => ({ data: rows[0] }),
        then: (resolve) => resolve({ data: rows }),
      };
      return query;
    },
  };
  const exports = {};
  vm.runInNewContext(route, {
    exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    require: (name) => ({
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
      '@supabase/supabase-js': { createClient: () => db },
      '@/lib/supabase-pagination': pagination,
    })[name] ?? {},
  });
  return () => exports.GET({ headers: new Headers({ authorization: 'Bearer test' }), nextUrl: new URL('https://example.com/?scope=captain_inbox') });
}

test('captain and vice-captain both see only their team’s current confirmed date', async () => {
  for (const role of ['captain', 'vice']) {
    const { body, status } = await setup(role)();
    assert.equal(status, 200);
    assert.deepEqual(Array.from(body.rows, (row) => row.key.split(':')[1]), ['latest']);
    assert.match(body.rows[0].detail, /Traders B vs Greenhithe B/);
  }
});

test('unlinked accounts and ordinary team members get no team notices', async () => {
  assert.equal((await setup('captain', { linked: false })()).body.rows.length, 0);
  assert.equal((await setup('player')()).body.rows.length, 0);
});

test('signed-out requests are rejected', async () => {
  assert.equal((await setup('captain', { signedIn: false })()).status, 401);
});

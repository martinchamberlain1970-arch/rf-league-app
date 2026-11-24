const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (name) => dependencies[name],
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" } },
  });
  return exports;
}

const hodge = load("src/lib/hodge-score.ts");
const fixedRules = load("src/lib/fixed-competition-handicaps.ts");
function scorecard(name, { bestOf = 5, round = 1, status = "pending", linkAvailable = true, queueStatus } = {}) {
  const submissions = [];
  let linkUsed = false;
  const match = { id: "match", competition_id: "cup", player1_id: "home", player2_id: "away", best_of: bestOf, round_no: round, status };
  const service = {
    async rpc(name, args) {
      assert.equal(name, "queue_competition_scorecard");
      if (queueStatus) return { data: queueStatus };
      if (submissions.length) return { data: "pending" };
      if (args.p_token_hash) linkUsed = true;
      submissions.push({ match_id: args.p_match_id, submitted_by_user_id: args.p_user_id, payload: args.p_payload, status: "pending" });
      return { data: "queued" };
    },
    from(table) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === "matches" ? match :
            table === "competitions" ? { id: "cup", name, best_of: 3 } : { role: "user", linked_player_id: "home" },
        }),
        in: async () => ({ data: [{ id: "home", snooker_handicap: -20 }, { id: "away", snooker_handicap: 20 }] }),
        limit: async () => ({ data: [] }),
        then: (resolve) => resolve({ data: [1, 2, 3, 4].map((slot) => ({ round_no: 1, match_no: slot })) }),
      };
      return query;
    },
  };
  const { POST } = load("src/app/api/competition/submit-result/route.ts", {
    "next/server": { NextResponse: Response },
    "@supabase/supabase-js": {
      createClient: (_url, key) => key === "service" ? service : {
        auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
      },
    },
    "@/lib/hodge-score": hodge,
    "@/lib/competition-scorecard-links": {
      scorecardTokenHash: (token) => token,
      scorecardPlayerIds: (row) => [row.player1_id, row.player2_id],
      hasScorecardOpponents: (row) => Boolean(row.player1_id && row.player2_id),
      findScorecardLink: async () => linkAvailable && !linkUsed ? "match" : undefined,
      scorecardMatchFields: "*",
    },
    "@/lib/fixed-competition-handicaps": fixedRules,
    "@/lib/fixed-competition-handicaps-server": { fixedHandicapsForMatch: async () => ({ ready: true }) },
    "@/lib/push-server": { sendPushToLeagueManagers: async () => {} },
    "@/lib/app-roles": { canManageLeagueRole: () => false },
  });
  return {
    submissions,
    post: (body, authorization = "Bearer test") => POST(new Request("https://test/api/competition/submit-result", {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({ matchId: "match", mode: "standard", winnerSide: "home", ...body }),
    })),
  };
}

const frame = (home, away) => ({ home, away });
const homeFrame = frame(55, 20);
const awayFrame = frame(20, 55);

test("singles and doubles validate the match best-of and reject frames after the winner is decided", async () => {
  for (const name of ["Gary Webb (Singles Scratch)", "Handicap Doubles - 2026/2027"]) {
    const cup = scorecard(name);
    assert.equal((await cup.post({ frameResults: [homeFrame, homeFrame] })).status, 400);
    assert.equal((await cup.post({ frameResults: [homeFrame, homeFrame, homeFrame, awayFrame] })).status, 400);
    assert.equal((await cup.post({ frameResults: [{ ...homeFrame, frameNo: 2 }] })).status, 400);
    assert.equal((await cup.post({ frameResults: [homeFrame, awayFrame, homeFrame, homeFrame] })).status, 200);
    assert.equal(cup.submissions[0].payload.homeScore, 3);
    assert.equal(cup.submissions[0].status, "pending");
  }
});

test("Hodge counts six frames and three aggregate points, including a respotted black on a tied pairing", async () => {
  const cup = scorecard("Hodge Cup (Triples) - 2026/2027");
  const frames = [frame(65, 45), frame(75, 25), frame(20, 60), frame(40, 60), frame(35, 50), frame(65, 59)];
  assert.equal((await cup.post({ frameResults: frames.slice(0, 5) })).status, 400);
  assert.equal((await cup.post({ frameResults: frames })).status, 400);
  assert.equal((await cup.post({ frameResults: frames, hodgeBlackWinners: ["away", null, null] })).status, 200);
  const { homeScore, awayScore, winnerSide } = cup.submissions[0].payload;
  assert.deepEqual([homeScore, awayScore, winnerSide], [4, 5, "away"]);
});

test("Hamilton uses the full bracket to choose round targets and can accept the lower raw score as winner", async () => {
  const name = "Hamilton Cup (Singles Billiards) - 2026/2027";
  const opening = scorecard(name);
  assert.equal((await opening.post({ homeScore: 180, awayScore: 200 })).status, 200);
  const semi = scorecard(name, { round: 2 });
  assert.equal((await semi.post({ homeScore: 180, awayScore: 150 })).status, 400);
  assert.equal((await semi.post({ homeScore: 360, awayScore: 400 })).status, 200);
});

test("Albery keeps its three-leg scorecard and byes reject submission", async () => {
  const cup = scorecard("Albery Cup (Billiards 3-Man Team) - 2026/2027");
  assert.equal((await cup.post({ frameResults: [homeFrame] })).status, 400);
  assert.equal((await cup.post({ mode: "albery", albery: {
    homePlayers: ["A", "B", "C"], awayPlayers: ["D", "E", "F"],
    leg1: frame(100, 60), leg2: frame(200, 150), leg3: frame(300, 230),
  } })).status, 200);
  assert.equal(cup.submissions[0].payload.albery.leg3.home, 300);
  const bye = scorecard("Gary Webb (Singles Scratch)", { status: "bye" });
  assert.equal((await bye.post({ frameResults: [homeFrame] })).status, 400);
});

const guestAuthorization = "Scorecard " + "aa".repeat(32);

test("a guest link submits for only its own match without a user ID", async () => {
  const cup = scorecard("Gary Webb (Singles Scratch)", { bestOf: 1 });
  const result = { frameResults: [homeFrame] };
  assert.equal((await cup.post({ ...result, matchId: "another-match" }, guestAuthorization)).status, 410);
  assert.equal((await cup.post({ ...result, breakEntries: [{ player_id: "unrelated-player", break_value: 34 }] }, guestAuthorization)).status, 400);
  assert.equal((await cup.post(result, guestAuthorization)).status, 200);
  assert.equal(cup.submissions[0].submitted_by_user_id, null);
  assert.equal(cup.submissions[0].payload.source, "private_scorecard_link");
  assert.equal((await cup.post(result, guestAuthorization)).status, 410);
  assert.equal(cup.submissions.length, 1);
});

test("unavailable links and races at the database are handled without duplicate submissions", async () => {
  const name = "Gary Webb (Singles Scratch)";
  const result = { frameResults: [homeFrame] };
  const unavailable = scorecard(name, { bestOf: 1, linkAvailable: false });
  assert.equal((await unavailable.post(result, "")).status, 401);
  assert.equal((await unavailable.post(result, guestAuthorization)).status, 410);
  const revoked = scorecard(name, { bestOf: 1, queueStatus: "invalid_link" });
  assert.equal((await revoked.post(result, guestAuthorization)).status, 410);
  const pending = scorecard(name, { bestOf: 1, queueStatus: "pending" });
  assert.equal((await pending.post(result, guestAuthorization)).status, 409);
  assert.equal((await pending.post(result)).status, 409);
});

test("only officers can issue and revoke links; the stored token is hashed and expires in seven days", async () => {
  const crypto = require("node:crypto");
  const matchId = "44444444-4444-4444-8444-444444444444";
  const linkHelpers = load("src/lib/competition-scorecard-links.ts", { "node:crypto": crypto });
  let role = "user";
  const writes = [];
  const tokenBytes = Buffer.alloc(12, 170);
  const issuedToken = tokenBytes.toString("base64url");
  const service = {
    from(table) {
      const query = {
        select: () => query,
        eq: (field, value) => {
          if (table === "competition_scorecard_links") writes.push({ revoked: value, field });
          return query;
        },
        delete: () => query,
        maybeSingle: async () => ({
          data: table === "app_users" ? { role } :
            table === "matches" ? { competition_id: "cup", status: "pending", player1_id: "home", player2_id: "away" } : { id: "cup" },
        }),
        limit: async () => ({ data: [] }),
        upsert: async (row, options) => { writes.push({ row, options }); return {}; },
      };
      return query;
    },
  };
  const { POST } = load("src/app/api/competition/scorecard-links/route.ts", {
    "next/server": { NextResponse: Response },
    "node:crypto": { randomBytes: () => tokenBytes },
    "@supabase/supabase-js": {
      createClient: (_url, key) => key === "service" ? service : {
        auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
      },
    },
    "@/lib/competition-scorecard-links": linkHelpers,
    "@/lib/app-roles": { canManageLeagueRole: (value) => value === "league_secretary" },
  });
  const post = (action, authorization = "Bearer auth-token") => POST(new Request("https://test/issue", {
    method: "POST", headers: { authorization }, body: JSON.stringify({ action, matchId }),
  }));
  assert.equal((await post("issue", "")).status, 401);
  assert.equal((await post("issue")).status, 403);
  assert.equal(writes.length, 0);

  role = "league_secretary";
  const before = Date.now();
  const issued = await post("issue");
  assert.equal(issued.status, 200);
  assert.equal(issued.headers.get("cache-control"), "no-store");
  const link = await issued.json();
  assert.equal(link.path, "/competition-scorecard#" + issuedToken);
  const stored = writes[0].row;
  assert.equal(stored.token_hash, crypto.createHash("sha256").update(issuedToken).digest("hex"));
  assert.equal(stored.match_id, matchId);
  assert.equal(writes[0].options.onConflict, "match_id");
  assert.ok(Date.parse(stored.expires_at) >= before + 7 * 24 * 60 * 60 * 1000);
  assert.equal((await post("revoke")).status, 200);
  assert.deepEqual(writes[1], { revoked: matchId, field: "match_id" });
});

test("the public picker lists only scoreable fixtures in the selected competition", async () => {
  const competitionId = "33333333-3333-4333-8333-333333333333";
  const calls = [];
  const service = {
    from(table) {
      const query = {
        select: () => query,
        eq: (field, value) => { calls.push([table, field, value]); return query; },
        order: () => query,
        maybeSingle: async () => ({ data: { id: competitionId, name: "Hamilton Cup" } }),
        in: () => query,
        then: (resolve) => resolve({ data: {
          competitions: [{ id: competitionId, name: "Hamilton Cup" }],
          matches: [
            { id: "confirmed", round_no: 1, player1_id: "one", player2_id: "two" },
            { id: "awaiting-opponent", round_no: 2, player1_id: "one", player2_id: null },
          ],
          players: [
            { id: "one", full_name: "Alex Example", email: "private" },
            { id: "two", full_name: "Sam Example", email: "private" },
          ],
        }[table] }),
      };
      return query;
    },
  };
  const { GET } = load("src/app/api/public/competition-scorecard-options/route.ts", {
    "next/server": { NextResponse: Response },
    "@supabase/supabase-js": { createClient: () => service },
    "@/lib/competition-scorecard-links": load("src/lib/competition-scorecard-links.ts", { "node:crypto": require("node:crypto") }),
  });
  const get = (query = "") => GET({ nextUrl: new URL("https://test/choices" + query) });
  assert.equal((await get("?competitionId=invalid")).status, 400);
  assert.deepEqual((await (await get()).json()).competitions, [{ id: competitionId, name: "Hamilton Cup" }]);
  assert.deepEqual((await (await get("?competitionId=" + competitionId)).json()).fixtures, [
    { id: "confirmed", name: "Round 1 · Alex Example vs Sam Example" },
  ]);
  assert.ok(calls.some(([table, field, value]) => table === "matches" && field === "competition_id" && value === competitionId));
});

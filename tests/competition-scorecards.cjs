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
function scorecard(name, { bestOf = 5, round = 1, status = "pending" } = {}) {
  const submissions = [];
  const match = { id: "match", competition_id: "cup", player1_id: "home", player2_id: "away", best_of: bestOf, round_no: round, status };
  const service = {
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
        insert: async (entry) => { submissions.push(entry); return {}; },
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
    "@/lib/fixed-competition-handicaps": fixedRules,
    "@/lib/fixed-competition-handicaps-server": { fixedHandicapsForMatch: async () => ({ ready: true }) },
    "@/lib/push-server": { sendPushToLeagueManagers: async () => {} },
    "@/lib/app-roles": { canManageLeagueRole: () => false },
  });
  return {
    submissions,
    post: (body) => POST(new Request("https://test/api/competition/submit-result", {
      method: "POST",
      headers: { authorization: "Bearer test" },
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


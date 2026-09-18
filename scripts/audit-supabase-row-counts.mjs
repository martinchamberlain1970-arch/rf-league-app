import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const tables = [
  "audit_logs",
  "players",
  "league_fixtures",
  "league_fixture_frames",
  "league_fixture_breaks",
  "league_result_submissions",
  "league_team_members",
  "rating_events",
  "rating_result_receipts",
  "matches",
  "frames",
  "competition_entries",
  "competition_match_breaks",
];

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
for (const table of tables) {
  const result = await client.from(table).select("*", { count: "exact", head: true });
  results.push({
    table,
    count: result.count,
    error: result.error?.message ?? null,
  });
}

const width = Math.max(...tables.map((table) => table.length));
for (const result of results) {
  if (result.error) {
    console.log(`${result.table.padEnd(width)}  ERROR  ${result.error}`);
    continue;
  }
  const count = result.count ?? 0;
  const risk = count >= 1000 ? "OVER API CAP" : count >= 800 ? "NEAR API CAP" : "OK";
  console.log(`${result.table.padEnd(width)}  ${String(count).padStart(7)}  ${risk}`);
}

if (results.some((result) => result.error)) process.exitCode = 1;

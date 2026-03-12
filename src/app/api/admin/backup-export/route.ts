import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

const BACKUP_TABLES = [
  "locations",
  "players",
  "app_users",
  "league_registered_teams",
  "league_registered_team_members",
  "league_seasons",
  "league_teams",
  "league_team_members",
  "league_fixtures",
  "league_fixture_frames",
  "league_fixture_breaks",
  "league_result_submissions",
  "league_handicap_history",
  "competition_entries",
  "competitions",
  "player_claim_requests",
  "player_update_requests",
  "player_deletion_requests",
  "profile_merge_requests",
  "location_requests",
  "admin_requests",
  "feature_access_requests",
  "audit_logs",
  // Legacy tables (included if present)
  "matches",
  "frames",
  "result_submissions",
] as const;

function isMissingTable(message: string) {
  const m = message.toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table");
}

async function assertSuperUser(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return { error: "Server is not configured.", status: 500 as const };
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Missing auth token.", status: 401 as const };
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { error: "Unauthorized.", status: 401 as const };
  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || email !== superAdminEmail) return { error: "Only Super User can export backups.", status: 403 as const };
  return { userId: data.user.id, email };
}

export async function GET(req: NextRequest) {
  const guard = await assertSuperUser(req);
  if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const adminClient = createClient(supabaseUrl as string, serviceRoleKey as string);
  const payload: Record<string, unknown> = {
    version: "league-backup-1",
    exported_at: new Date().toISOString(),
    project: "league",
    exported_by_user_id: guard.userId,
    exported_by_email: guard.email,
    tables: BACKUP_TABLES,
  };
  const missingTables: string[] = [];

  for (const table of BACKUP_TABLES) {
    const { data, error } = await adminClient.from(table).select("*");
    if (error) {
      if (isMissingTable(error.message)) {
        payload[table] = [];
        missingTables.push(table);
        continue;
      }
      return NextResponse.json({ error: `Failed exporting ${table}: ${error.message}` }, { status: 400 });
    }
    payload[table] = data ?? [];
  }

  return NextResponse.json({ payload, missingTables });
}

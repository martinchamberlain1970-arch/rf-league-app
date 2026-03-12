import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

const RESTORE_ORDER = [
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
  "competitions",
  "competition_entries",
  "player_claim_requests",
  "player_update_requests",
  "player_deletion_requests",
  "profile_merge_requests",
  "location_requests",
  "admin_requests",
  "feature_access_requests",
  "audit_logs",
  // Legacy
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
  if (!superAdminEmail || email !== superAdminEmail) return { error: "Only Super User can restore backups.", status: 403 as const };
  return { userId: data.user.id, email };
}

export async function POST(req: NextRequest) {
  const guard = await assertSuperUser(req);
  if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json().catch(() => null);
  const payload = body?.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid backup payload." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl as string, serviceRoleKey as string);
  const restored: Array<{ table: string; count: number }> = [];
  const skipped: string[] = [];

  for (const table of RESTORE_ORDER) {
    const rows = payload[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const res = await adminClient.from(table).upsert(rows as Record<string, unknown>[], { onConflict: "id" });
    if (res.error) {
      if (isMissingTable(res.error.message)) {
        skipped.push(table);
        continue;
      }
      return NextResponse.json({ error: `Failed restoring ${table}: ${res.error.message}` }, { status: 400 });
    }
    restored.push({ table, count: rows.length });
  }

  await adminClient.from("audit_logs").insert({
    actor_user_id: guard.userId,
    actor_email: guard.email,
    actor_role: "owner",
    action: "system_restore_backup",
    entity_type: "system",
    entity_id: "backup_restore",
    summary: "Backup restore executed.",
    meta: {
      restored,
      skipped,
      exported_at: payload.exported_at ?? null,
      version: payload.version ?? null,
    },
  });

  return NextResponse.json({ ok: true, restored, skipped });
}

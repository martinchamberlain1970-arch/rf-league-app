import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeAppRole, type AppRole } from "@/lib/app-roles";
import { requireSuperUser } from "@/lib/server-role";
import { logServerAudit } from "@/lib/server-audit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ASSIGNABLE_ROLES = new Set<AppRole>(["user", "admin", "league_secretary", "league_chairman", "league_treasurer"]);

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const auth = await authClient.auth.getUser(token);
  if (auth.error || !auth.data.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try { await requireSuperUser(adminClient, auth.data.user); } catch { return NextResponse.json({ error: "Only the System Owner can assign protected roles." }, { status: 403 }); }

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "").trim();
  const role = normalizeAppRole(body?.role);
  if (!userId || !ASSIGNABLE_ROLES.has(role)) return NextResponse.json({ error: "Choose a valid assignable role." }, { status: 400 });
  if (userId === auth.data.user.id) return NextResponse.json({ error: "The System Owner cannot change their own protected role here." }, { status: 400 });

  const current = await adminClient.from("app_users").select("role,email").eq("id", userId).maybeSingle();
  if (current.error || !current.data) return NextResponse.json({ error: "User account record not found." }, { status: 404 });
  const previousRole = normalizeAppRole((current.data as { role?: string | null }).role);
  if (previousRole === "owner" || previousRole === "super") return NextResponse.json({ error: "Another protected System Owner role cannot be changed here." }, { status: 403 });

  const update = await adminClient.from("app_users").update({ role }).eq("id", userId);
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });
  await logServerAudit(adminClient, {
    action: "user-role-updated",
    actorUserId: auth.data.user.id,
    actorEmail: auth.data.user.email ?? null,
    actorRole: "super_user",
    entityType: "app_user",
    entityId: userId,
    meta: { previousRole, newRole: role, targetEmail: (current.data as { email?: string | null }).email ?? null },
  });
  return NextResponse.json({ ok: true, role });
}

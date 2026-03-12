import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

async function assertSuperUser(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return { error: "Server is not configured.", status: 500 as const };
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Missing auth token.", status: 401 as const };
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { error: "Unauthorized.", status: 401 as const };
  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || email !== superAdminEmail) return { error: "Only Super User can access restore points.", status: 403 as const };
  return { userId: data.user.id };
}

export async function GET(req: NextRequest) {
  const guard = await assertSuperUser(req);
  if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const adminClient = createClient(supabaseUrl as string, serviceRoleKey as string);
  const roots = ["system", guard.userId];
  const files: Array<{ path: string; name: string; updated_at: string | null; source: "system" | "user" }> = [];

  for (const root of roots) {
    const list = await adminClient.storage
      .from("backups")
      .list(root, { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
    if (list.error) continue;
    for (const f of list.data ?? []) {
      if (!f.name.toLowerCase().endsWith(".json")) continue;
      files.push({
        path: `${root}/${f.name}`,
        name: f.name,
        updated_at: f.updated_at ?? null,
        source: root === "system" ? "system" : "user",
      });
    }
  }

  files.sort((a, b) => {
    const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return bt - at;
  });

  return NextResponse.json({ files });
}


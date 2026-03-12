import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const requesterEmail = authData.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || requesterEmail !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can delete users." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetUserId = String(body?.userId ?? "").trim();
  if (!targetUserId) return NextResponse.json({ error: "Missing userId." }, { status: 400 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const appUserRes = await adminClient
    .from("app_users")
    .select("id,email,role,linked_player_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (appUserRes.error) return NextResponse.json({ error: appUserRes.error.message }, { status: 400 });
  if (!appUserRes.data) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const role = String(appUserRes.data.role ?? "").toLowerCase();
  if (role === "owner" || role === "super") {
    return NextResponse.json({ error: "Cannot delete the Super User account." }, { status: 400 });
  }

  // Ensure profile claim is cleared if this user is linked to a player.
  const linkedPlayerId = (appUserRes.data.linked_player_id as string | null) ?? null;
  if (linkedPlayerId) {
    const clearClaimRes = await adminClient
      .from("players")
      .update({ claimed_by: null })
      .eq("id", linkedPlayerId)
      .eq("claimed_by", targetUserId);
    if (clearClaimRes.error) return NextResponse.json({ error: clearClaimRes.error.message }, { status: 400 });
  }

  // Remove app_users row first, then auth user.
  const deleteAppUserRes = await adminClient.from("app_users").delete().eq("id", targetUserId);
  if (deleteAppUserRes.error) return NextResponse.json({ error: deleteAppUserRes.error.message }, { status: 400 });

  const authDeleteRes = await adminClient.auth.admin.deleteUser(targetUserId);
  if (authDeleteRes.error) {
    return NextResponse.json({ error: `Failed deleting user: ${authDeleteRes.error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

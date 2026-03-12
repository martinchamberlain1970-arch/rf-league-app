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
    return NextResponse.json({ error: "Only Super User can de-link users." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "").trim();
  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const userRes = await adminClient
    .from("app_users")
    .select("id,role,linked_player_id,email")
    .eq("id", userId)
    .maybeSingle();
  if (userRes.error) return NextResponse.json({ error: userRes.error.message }, { status: 400 });
  if (!userRes.data) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const role = String(userRes.data.role ?? "").toLowerCase();
  if (role === "owner" || role === "super") {
    return NextResponse.json({ error: "Cannot de-link the Super User account." }, { status: 400 });
  }

  const linkedPlayerId = (userRes.data.linked_player_id as string | null) ?? null;
  const unlinkRes = await adminClient.from("app_users").update({ linked_player_id: null }).eq("id", userId);
  if (unlinkRes.error) return NextResponse.json({ error: unlinkRes.error.message }, { status: 400 });

  if (linkedPlayerId) {
    const clearClaimRes = await adminClient
      .from("players")
      .update({ claimed_by: null })
      .eq("id", linkedPlayerId)
      .eq("claimed_by", userId);
    if (clearClaimRes.error) return NextResponse.json({ error: clearClaimRes.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, linked_player_id: linkedPlayerId });
}

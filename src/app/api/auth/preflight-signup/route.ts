import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const existingUserRes = await adminClient
    .from("app_users")
    .select("id,email,linked_player_id")
    .eq("email", email)
    .maybeSingle();

  if (existingUserRes.error) {
    return NextResponse.json({ error: existingUserRes.error.message }, { status: 400 });
  }

  const existingUser = existingUserRes.data as { id: string; email: string | null; linked_player_id: string | null } | null;
  if (!existingUser?.id) {
    return NextResponse.json({ ok: true, status: "clear" });
  }

  if (existingUser.linked_player_id) {
    return NextResponse.json({ ok: true, status: "linked_account_exists" });
  }

  const pendingClaimRes = await adminClient
    .from("player_claim_requests")
    .select("id,status", { count: "exact", head: true })
    .eq("requester_user_id", existingUser.id)
    .in("status", ["pending", "approved"]);

  if (pendingClaimRes.error) {
    return NextResponse.json({ error: pendingClaimRes.error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    status: (pendingClaimRes.count ?? 0) > 0 ? "pending_request_exists" : "unlinked_account_exists",
  });
}

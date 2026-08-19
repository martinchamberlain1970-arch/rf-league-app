import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
  const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  if (!requestId || !["cancel", "approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "A valid requestId and action are required." }, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const requestRes = await serviceClient
    .from("player_claim_requests")
    .select("id,player_id,requester_user_id,requested_full_name,requested_date_of_birth,status")
    .eq("id", requestId)
    .maybeSingle();
  if (requestRes.error) return NextResponse.json({ error: requestRes.error.message }, { status: 400 });
  if (!requestRes.data) return NextResponse.json({ error: "Claim request not found." }, { status: 404 });
  if (requestRes.data.status !== "pending") {
    return NextResponse.json({ error: "Only pending claim requests can be changed." }, { status: 409 });
  }

  if (action !== "cancel") {
    try {
      await requireLeagueManager(serviceClient, authData.user);
    } catch {
      return NextResponse.json({ error: "League Secretary or Chairman access is required." }, { status: 403 });
    }

    const approve = action === "approve";
    if (approve) {
      const playerUpdate: Record<string, unknown> = {
        claimed_by: requestRes.data.requester_user_id,
        is_archived: false,
      };
      if (requestRes.data.requested_full_name) playerUpdate.full_name = requestRes.data.requested_full_name;
      if (requestRes.data.requested_date_of_birth) playerUpdate.date_of_birth = requestRes.data.requested_date_of_birth;
      const playerRes = await serviceClient.from("players").update(playerUpdate).eq("id", requestRes.data.player_id);
      if (playerRes.error) return NextResponse.json({ error: playerRes.error.message }, { status: 400 });

      const userRes = await serviceClient
        .from("app_users")
        .update({ linked_player_id: requestRes.data.player_id })
        .eq("id", requestRes.data.requester_user_id);
      if (userRes.error) return NextResponse.json({ error: userRes.error.message }, { status: 400 });
    }

    const reviewRes = await serviceClient
      .from("player_claim_requests")
      .update({
        status: approve ? "approved" : "rejected",
        reviewed_by_user_id: authData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending");
    if (reviewRes.error) return NextResponse.json({ error: reviewRes.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (requestRes.data.requester_user_id !== authData.user.id) {
    return NextResponse.json({ error: "You can only cancel your own claim request." }, { status: 403 });
  }

  const updateRes = await serviceClient
    .from("player_claim_requests")
    .update({ status: "rejected", reviewed_by_user_id: null, reviewed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("requester_user_id", authData.user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 400 });
  if (!updateRes.data) return NextResponse.json({ error: "Claim request was already changed." }, { status: 409 });

  return NextResponse.json({ ok: true });
}

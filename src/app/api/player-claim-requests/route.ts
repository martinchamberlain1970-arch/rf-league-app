import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  if (!requestId || action !== "cancel") {
    return NextResponse.json({ error: "A valid requestId and cancel action are required." }, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const requestRes = await serviceClient
    .from("player_claim_requests")
    .select("id,requester_user_id,status")
    .eq("id", requestId)
    .maybeSingle();
  if (requestRes.error) return NextResponse.json({ error: requestRes.error.message }, { status: 400 });
  if (!requestRes.data) return NextResponse.json({ error: "Claim request not found." }, { status: 404 });
  if (requestRes.data.requester_user_id !== authData.user.id) {
    return NextResponse.json({ error: "You can only cancel your own claim request." }, { status: 403 });
  }
  if (requestRes.data.status !== "pending") {
    return NextResponse.json({ error: "Only pending claim requests can be cancelled." }, { status: 409 });
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

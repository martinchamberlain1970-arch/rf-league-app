import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const userEmail = authData.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || userEmail !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can review fixture change requests." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;
  const reviewNotes = typeof body?.reviewNotes === "string" ? body.reviewNotes.trim() : "";

  if (!requestId || !decision) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const requestRes = await adminClient
    .from("league_fixture_change_requests")
    .select("id,fixture_id,status,proposed_fixture_date")
    .eq("id", requestId)
    .maybeSingle();
  if (requestRes.error || !requestRes.data) {
    return NextResponse.json({ error: requestRes.error?.message ?? "Request not found." }, { status: 404 });
  }
  if (requestRes.data.status !== "pending") {
    return NextResponse.json({ error: "Request is no longer pending." }, { status: 400 });
  }

  if (decision === "approved") {
    const updFixture = await adminClient
      .from("league_fixtures")
      .update({ fixture_date: requestRes.data.proposed_fixture_date, status: "pending" })
      .eq("id", requestRes.data.fixture_id);
    if (updFixture.error) {
      return NextResponse.json({ error: updFixture.error.message }, { status: 400 });
    }
  }

  const updReq = await adminClient
    .from("league_fixture_change_requests")
    .update({
      status: decision,
      review_notes: reviewNotes || null,
      reviewed_by_user_id: authData.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (updReq.error) return NextResponse.json({ error: updReq.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

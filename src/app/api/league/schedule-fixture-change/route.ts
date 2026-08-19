import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isMissingTableError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("could not find the table") || m.includes("does not exist");
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try { await requireLeagueManager(adminClient, authData.user); } catch { return NextResponse.json({ error: "League management access is required." }, { status: 403 }); }

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const agreedFixtureDate = typeof body?.agreedFixtureDate === "string" ? body.agreedFixtureDate : "";
  const reviewNotes = typeof body?.reviewNotes === "string" ? body.reviewNotes.trim() : "";

  if (!requestId || !agreedFixtureDate) {
    return NextResponse.json({ error: "Missing request details." }, { status: 400 });
  }

  const requestRes = await adminClient
    .from("league_fixture_change_requests")
    .select("id,fixture_id,status")
    .eq("id", requestId)
    .maybeSingle();
  if (requestRes.error || !requestRes.data) {
    if (isMissingTableError(requestRes.error?.message)) {
      return NextResponse.json({ error: "Fixture date requests are not available until the latest database migration has been run." }, { status: 400 });
    }
    return NextResponse.json({ error: requestRes.error?.message ?? "Request not found." }, { status: 404 });
  }
  if (requestRes.data.status !== "approved_outstanding") {
    return NextResponse.json({ error: "This request is not waiting for a scheduled date." }, { status: 400 });
  }

  const updFixture = await adminClient
    .from("league_fixtures")
    .update({ fixture_date: agreedFixtureDate, status: "pending" })
    .eq("id", requestRes.data.fixture_id);
  if (updFixture.error) {
    return NextResponse.json({ error: updFixture.error.message }, { status: 400 });
  }

  const updReq = await adminClient
    .from("league_fixture_change_requests")
    .update({
      status: "rescheduled",
      agreed_fixture_date: agreedFixtureDate,
      review_notes: reviewNotes || null,
      reviewed_by_user_id: authData.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (updReq.error) {
    return NextResponse.json({ error: updReq.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

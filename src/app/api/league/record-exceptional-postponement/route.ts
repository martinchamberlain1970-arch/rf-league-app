import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveServerRole } from "@/lib/server-role";
import { isSuperRole } from "@/lib/app-roles";
import { logServerAudit } from "@/lib/server-audit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseDateOnly(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function canRecordExceptionalPostponement(role: string) {
  return isSuperRole(role) || role === "league_secretary" || role === "league_chairman";
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
  let role: string;
  try {
    role = await resolveServerRole(adminClient, authData.user);
  } catch {
    return NextResponse.json({ error: "Unable to verify league officer access." }, { status: 403 });
  }
  if (!canRecordExceptionalPostponement(role)) {
    return NextResponse.json({ error: "Only the League Secretary, League Chairman or System Owner can record an exceptional postponement." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fixtureId = typeof body?.fixtureId === "string" ? body.fixtureId : "";
  const agreedFixtureDate = typeof body?.agreedFixtureDate === "string" ? body.agreedFixtureDate : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const bothTeamsAgreed = body?.bothTeamsAgreed === true;

  if (!fixtureId || !agreedFixtureDate || !reason) {
    return NextResponse.json({ error: "Choose the fixture and new agreed date, then record the exceptional reason." }, { status: 400 });
  }
  if (!bothTeamsAgreed) {
    return NextResponse.json({ error: "Confirm that both teams have agreed to the later date." }, { status: 400 });
  }
  if (reason.length < 20) {
    return NextResponse.json({ error: "Please record enough detail to explain the exceptional circumstances." }, { status: 400 });
  }

  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,home_team_id,away_team_id,fixture_date,status")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error || !fixtureRes.data) {
    return NextResponse.json({ error: fixtureRes.error?.message ?? "Fixture not found." }, { status: 404 });
  }
  if (fixtureRes.data.status === "complete" || fixtureRes.data.status === "bye") {
    return NextResponse.json({ error: "Completed fixtures and BYE weeks cannot be rescheduled." }, { status: 400 });
  }
  if (!fixtureRes.data.fixture_date) {
    return NextResponse.json({ error: "This fixture does not currently have a league date." }, { status: 400 });
  }

  const seasonRes = await adminClient
    .from("league_seasons")
    .select("id,is_published,is_completed")
    .eq("id", fixtureRes.data.season_id)
    .maybeSingle();
  if (seasonRes.error || !seasonRes.data) {
    return NextResponse.json({ error: seasonRes.error?.message ?? "League season not found." }, { status: 404 });
  }
  if (!seasonRes.data.is_published || seasonRes.data.is_completed) {
    return NextResponse.json({ error: "Only fixtures in a live published league can be rescheduled." }, { status: 400 });
  }

  const originalDate = parseDateOnly(fixtureRes.data.fixture_date);
  const agreedDate = parseDateOnly(agreedFixtureDate);
  if (!originalDate || !agreedDate) {
    return NextResponse.json({ error: "Enter a valid new fixture date." }, { status: 400 });
  }
  if (agreedDate.getTime() <= originalDate.getTime()) {
    return NextResponse.json({ error: "An exceptional postponement must move the fixture to a later date. Use the ordinary early-play workflow for an earlier date." }, { status: 400 });
  }

  const activeRequestRes = await adminClient
    .from("league_fixture_change_requests")
    .select("id")
    .eq("fixture_id", fixtureId)
    .in("status", ["pending", "approved_outstanding"])
    .limit(1);
  if (activeRequestRes.error) {
    return NextResponse.json({ error: activeRequestRes.error.message }, { status: 400 });
  }
  if ((activeRequestRes.data ?? []).length > 0) {
    return NextResponse.json({ error: "This fixture already has an active date-change request. Review that request instead of creating a second record." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const reviewNotes = "Approved as an exceptional postponement under Rules 17 and 29.1. Both teams confirmed agreement. This is a specific exception and does not create a general right to postpone fixtures.";
  const requestRes = await adminClient
    .from("league_fixture_change_requests")
    .insert({
      fixture_id: fixtureId,
      requested_by_user_id: authData.user.id,
      requester_team_id: null,
      request_type: "play_late",
      original_fixture_date: fixtureRes.data.fixture_date,
      proposed_fixture_date: agreedFixtureDate,
      agreed_fixture_date: agreedFixtureDate,
      opposing_team_agreed: true,
      reason,
      status: "rescheduled",
      review_notes: reviewNotes,
      reviewed_by_user_id: authData.user.id,
      reviewed_at: now,
    })
    .select("id")
    .single();
  if (requestRes.error || !requestRes.data) {
    return NextResponse.json({ error: requestRes.error?.message ?? "Failed to create the postponement record." }, { status: 400 });
  }

  const updateRes = await adminClient
    .from("league_fixtures")
    .update({ fixture_date: agreedFixtureDate, status: "pending" })
    .eq("id", fixtureId)
    .eq("fixture_date", fixtureRes.data.fixture_date)
    .neq("status", "complete")
    .select("id")
    .maybeSingle();
  if (updateRes.error || !updateRes.data) {
    await adminClient.from("league_fixture_change_requests").delete().eq("id", requestRes.data.id);
    return NextResponse.json({ error: updateRes.error?.message ?? "The fixture changed while this decision was being recorded. Refresh and try again." }, { status: 409 });
  }

  await logServerAudit(adminClient, {
    actorUserId: authData.user.id,
    actorEmail: authData.user.email?.trim().toLowerCase() ?? null,
    actorRole: role,
    action: "league_fixture_exceptional_postponement_recorded",
    entityType: "league_fixture",
    entityId: fixtureId,
    summary: `Exceptional postponement recorded: ${fixtureRes.data.fixture_date} to ${agreedFixtureDate}.`,
    meta: {
      fixture_change_request_id: requestRes.data.id,
      season_id: fixtureRes.data.season_id,
      home_team_id: fixtureRes.data.home_team_id,
      away_team_id: fixtureRes.data.away_team_id,
      original_fixture_date: fixtureRes.data.fixture_date,
      agreed_fixture_date: agreedFixtureDate,
      both_teams_agreed: true,
      rule_basis: ["Rule 17", "Rule 29.1"],
      reason,
    },
  });

  return NextResponse.json({ ok: true, requestId: requestRes.data.id });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

type RoleMembership = {
  team_id: string;
  player_id: string;
  is_captain: boolean;
  is_vice_captain: boolean;
};

type FixtureRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  fixture_date: string | null;
  status: "pending" | "in_progress" | "complete";
};

function requireEnv() {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  return null;
}

async function authenticate(req: NextRequest) {
  const envError = requireEnv();
  if (envError) return { error: envError };
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Missing auth token." }, { status: 401 }) };
  const authClient = createClient(supabaseUrl!, supabaseAnonKey!);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  return { user: data.user };
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const adminClient = createClient(supabaseUrl!, serviceRoleKey!);
  const userId = auth.user.id;
  const userEmail = auth.user.email?.trim().toLowerCase() ?? "";
  const isSuper = !!superAdminEmail && userEmail === superAdminEmail;
  const scope = req.nextUrl.searchParams.get("scope") ?? "mine";
  const fixtureId = req.nextUrl.searchParams.get("fixtureId") ?? "";

  let query = adminClient
    .from("league_fixture_change_requests")
    .select(
      "id,fixture_id,requested_by_user_id,requester_team_id,request_type,original_fixture_date,proposed_fixture_date,opposing_team_agreed,reason,status,review_notes,reviewed_by_user_id,reviewed_at,created_at"
    )
    .order("created_at", { ascending: false });

  if (fixtureId) query = query.eq("fixture_id", fixtureId);

  if (scope === "admin") {
    const appUserRes = await adminClient.from("app_users").select("is_admin").eq("id", userId).maybeSingle();
    const isAdmin = Boolean(appUserRes.data?.is_admin);
    if (!isSuper && !isAdmin) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  } else {
    const appUserRes = await adminClient.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
    const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
    if (!linkedPlayerId) return NextResponse.json({ rows: [] });

    const membershipRes = await adminClient
      .from("league_team_members")
      .select("team_id,player_id,is_captain,is_vice_captain")
      .eq("player_id", linkedPlayerId);
    if (membershipRes.error) return NextResponse.json({ error: membershipRes.error.message }, { status: 400 });

    const teamIds = new Set(
      ((membershipRes.data ?? []) as RoleMembership[])
        .filter((m) => m.is_captain || Boolean(m.is_vice_captain))
        .map((m) => m.team_id)
    );
    if (teamIds.size === 0) return NextResponse.json({ rows: [] });

    const orClause = Array.from(teamIds)
      .map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`)
      .join(",");
    const fixtureRes = await adminClient.from("league_fixtures").select("id,home_team_id,away_team_id").or(orClause);
    if (fixtureRes.error) return NextResponse.json({ error: fixtureRes.error.message }, { status: 400 });

    const allowedFixtureIds = new Set((fixtureRes.data ?? []).map((r: { id: string }) => r.id));
    if (fixtureId && !allowedFixtureIds.has(fixtureId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (!fixtureId) {
      const ids = Array.from(allowedFixtureIds);
      if (ids.length === 0) return NextResponse.json({ rows: [] });
      query = query.in("fixture_id", ids);
    }
  }

  const res = await query;
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  return NextResponse.json({ rows: res.data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const adminClient = createClient(supabaseUrl!, serviceRoleKey!);
  const userId = auth.user.id;

  const appUserRes = await adminClient.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
  const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
  if (!linkedPlayerId) return NextResponse.json({ error: "Your account is not linked to a player." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const fixtureId = typeof body?.fixtureId === "string" ? body.fixtureId : "";
  const requestType = body?.requestType === "play_early" || body?.requestType === "play_late" ? body.requestType : null;
  const proposedFixtureDate = typeof body?.proposedFixtureDate === "string" ? body.proposedFixtureDate : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const opposingTeamAgreed = Boolean(body?.opposingTeamAgreed);

  if (!fixtureId || !requestType || !proposedFixtureDate || !reason) {
    return NextResponse.json({ error: "Missing request details." }, { status: 400 });
  }

  const membershipRes = await adminClient
    .from("league_team_members")
    .select("team_id,player_id,is_captain,is_vice_captain")
    .eq("player_id", linkedPlayerId);
  if (membershipRes.error) return NextResponse.json({ error: membershipRes.error.message }, { status: 400 });
  const captainMemberships = ((membershipRes.data ?? []) as RoleMembership[]).filter((m) => m.is_captain || Boolean(m.is_vice_captain));
  if (!captainMemberships.length) {
    return NextResponse.json({ error: "Only captains or vice-captains can request fixture date changes." }, { status: 403 });
  }

  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,home_team_id,away_team_id,fixture_date,status")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error || !fixtureRes.data) {
    return NextResponse.json({ error: fixtureRes.error?.message ?? "Fixture not found." }, { status: 404 });
  }
  const fixture = fixtureRes.data as FixtureRow;
  if (fixture.status === "complete") {
    return NextResponse.json({ error: "Completed fixtures cannot be changed." }, { status: 400 });
  }
  const captainTeamIds = new Set(captainMemberships.map((m) => m.team_id));
  const requesterTeamId = captainTeamIds.has(fixture.home_team_id) ? fixture.home_team_id : captainTeamIds.has(fixture.away_team_id) ? fixture.away_team_id : null;
  if (!requesterTeamId) {
    return NextResponse.json({ error: "You can only request changes for your own team fixtures." }, { status: 403 });
  }

  if (!fixture.fixture_date) {
    return NextResponse.json({ error: "This fixture does not currently have a league date." }, { status: 400 });
  }

  const originalDate = fixture.fixture_date;
  if (requestType === "play_early" && proposedFixtureDate >= originalDate) {
    return NextResponse.json({ error: "Play-before requests must use a date before the published league date." }, { status: 400 });
  }
  if (requestType === "play_late" && proposedFixtureDate <= originalDate) {
    return NextResponse.json({ error: "Exceptional postponement requests must use a later date." }, { status: 400 });
  }
  if (requestType === "play_early" && !opposingTeamAgreed) {
    return NextResponse.json({ error: "Play-before requests require confirmation that the opposing team agrees." }, { status: 400 });
  }

  const pendingRes = await adminClient
    .from("league_fixture_change_requests")
    .select("id")
    .eq("fixture_id", fixtureId)
    .eq("status", "pending")
    .limit(1);
  if (pendingRes.error) return NextResponse.json({ error: pendingRes.error.message }, { status: 400 });
  if ((pendingRes.data ?? []).length) {
    return NextResponse.json({ error: "A fixture date change request is already pending for this fixture." }, { status: 400 });
  }

  const ins = await adminClient.from("league_fixture_change_requests").insert({
    fixture_id: fixtureId,
    requested_by_user_id: userId,
    requester_team_id: requesterTeamId,
    request_type: requestType,
    original_fixture_date: originalDate,
    proposed_fixture_date: proposedFixtureDate,
    opposing_team_agreed: opposingTeamAgreed,
    reason,
    status: "pending",
  });
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

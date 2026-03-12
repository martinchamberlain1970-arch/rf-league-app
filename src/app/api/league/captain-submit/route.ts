import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

type SubmissionBreakEntry = {
  player_id?: string | null;
  entered_player_name?: string | null;
  break_value?: number;
};
type FrameResult = {
  slot_no: number;
  winner_side: "home" | "away" | null;
  slot_type?: "singles" | "doubles";
  home_player1_id?: string | null;
  home_player2_id?: string | null;
  away_player1_id?: string | null;
  away_player2_id?: string | null;
  home_nominated?: boolean;
  away_nominated?: boolean;
  home_forfeit?: boolean;
  away_forfeit?: boolean;
  home_nominated_name?: string | null;
  away_nominated_name?: string | null;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
  break_entries?: SubmissionBreakEntry[];
};

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const userId = authData.user.id;
  const userEmail = authData.user.email?.trim().toLowerCase() ?? "";
  if (superAdminEmail && userEmail === superAdminEmail) {
    return NextResponse.json({ error: "Super User should submit via League Manager." }, { status: 400 });
  }

  const body = await req.json();
  const fixtureId = body?.fixtureId as string | undefined;
  const frameResults = (body?.frameResults ?? []) as FrameResult[];
  const scorecardPhotoUrl = (body?.scorecardPhotoUrl as string | undefined) ?? null;
  if (!fixtureId || !Array.isArray(frameResults)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const appUserRes = await adminClient.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
  const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
  if (!linkedPlayerId) return NextResponse.json({ error: "Your account is not linked to a player profile." }, { status: 400 });

  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,location_id,fixture_date,home_team_id,away_team_id,status")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error || !fixtureRes.data) return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  const fixture = fixtureRes.data as {
    id: string;
    season_id: string;
    location_id: string | null;
    fixture_date: string | null;
    home_team_id: string;
    away_team_id: string;
    status: string;
  };
  if (fixture.status === "complete") {
    return NextResponse.json({ error: "This fixture is already complete." }, { status: 400 });
  }

  const seasonRes = await adminClient.from("league_seasons").select("id,is_published").eq("id", fixture.season_id).maybeSingle();
  if (seasonRes.error || !seasonRes.data) {
    return NextResponse.json({ error: "League season not found." }, { status: 404 });
  }
  if (!seasonRes.data.is_published) {
    return NextResponse.json({ error: "Only published league fixtures can be submitted." }, { status: 400 });
  }

  if (!fixture.fixture_date) {
    return NextResponse.json({ error: "Fixture has no date; submission is not allowed." }, { status: 400 });
  }
  const fixtureDate = new Date(`${fixture.fixture_date}T12:00:00Z`);
  const now = new Date();
  const endOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  if (fixtureDate > endOfTodayUtc) {
    return NextResponse.json({ error: "Fixture is not open yet. You can submit on the fixture date." }, { status: 400 });
  }

  const memberRes = await adminClient
    .from("league_team_members")
    .select("team_id,is_captain,is_vice_captain")
    .eq("season_id", fixture.season_id)
    .eq("player_id", linkedPlayerId)
    .or(`team_id.eq.${fixture.home_team_id},team_id.eq.${fixture.away_team_id}`);
  if (memberRes.error) return NextResponse.json({ error: memberRes.error.message }, { status: 400 });
  const allowedTeam = (memberRes.data ?? []).find((r: { team_id: string; is_captain: boolean; is_vice_captain: boolean }) => r.is_captain || r.is_vice_captain);
  if (!allowedTeam) return NextResponse.json({ error: "Only captain or vice-captain for this fixture can submit." }, { status: 403 });

  const existingRes = await adminClient
    .from("league_result_submissions")
    .select("id,status")
    .eq("fixture_id", fixtureId)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRes.error) return NextResponse.json({ error: existingRes.error.message }, { status: 400 });
  if (existingRes.data?.id) {
    if (existingRes.data.status === "approved") {
      return NextResponse.json({ error: "This fixture is locked because the submitted result has already been approved." }, { status: 400 });
    }
    return NextResponse.json({ error: "A submission is already pending for this fixture." }, { status: 400 });
  }

  const cleanFrameResults = frameResults
    .filter((r) => Number.isInteger(r.slot_no) && r.slot_no > 0 && (r.winner_side === "home" || r.winner_side === "away" || r.winner_side === null))
    .map((r) => ({
      slot_no: r.slot_no,
      winner_side: r.winner_side,
      slot_type: r.slot_type === "doubles" ? "doubles" : "singles",
      home_player1_id: r.home_player1_id ?? null,
      home_player2_id: r.home_player2_id ?? null,
      away_player1_id: r.away_player1_id ?? null,
      away_player2_id: r.away_player2_id ?? null,
      home_nominated: Boolean(r.home_nominated),
      away_nominated: Boolean(r.away_nominated),
      home_forfeit: Boolean(r.home_forfeit),
      away_forfeit: Boolean(r.away_forfeit),
      home_nominated_name: r.home_nominated_name ?? null,
      away_nominated_name: r.away_nominated_name ?? null,
      home_points_scored: typeof r.home_points_scored === "number" ? r.home_points_scored : null,
      away_points_scored: typeof r.away_points_scored === "number" ? r.away_points_scored : null,
      break_entries: Array.isArray(r.break_entries)
        ? r.break_entries
            .map((b) => ({
              player_id: b?.player_id ?? null,
              entered_player_name: b?.entered_player_name ?? null,
              break_value: Number(b?.break_value ?? 0),
            }))
            .filter((b) => Number.isFinite(b.break_value) && b.break_value >= 30 && (b.player_id || b.entered_player_name))
        : undefined,
    }));
  if (!cleanFrameResults.some((r) => r.winner_side)) {
    return NextResponse.json({ error: "Select at least one frame result before submitting." }, { status: 400 });
  }

  const ins = await adminClient.from("league_result_submissions").insert({
    fixture_id: fixture.id,
    season_id: fixture.season_id,
    location_id: fixture.location_id,
    submitted_by_user_id: userId,
    submitter_team_id: allowedTeam.team_id,
    frame_results: cleanFrameResults,
    scorecard_photo_url: scorecardPhotoUrl && scorecardPhotoUrl.trim() ? scorecardPhotoUrl.trim() : null,
    status: "pending",
  });
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

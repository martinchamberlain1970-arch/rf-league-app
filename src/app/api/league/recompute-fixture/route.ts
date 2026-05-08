import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rebuildLeagueFixtureSnookerRatings } from "@/lib/snooker-rating";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

type FixtureRow = {
  id: string;
  season_id: string;
  location_id?: string | null;
  week_no?: number | null;
  fixture_date?: string | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
  home_points: number | null;
  away_points: number | null;
};

type SeasonRow = {
  id: string;
  name: string | null;
  singles_count: number | null;
  doubles_count: number | null;
};

type FrameRow = {
  slot_no: number;
  winner_side: "home" | "away" | null;
  home_forfeit: boolean;
  away_forfeit: boolean;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
};

function isHodgeTriplesSeason(seasonName: string | null | undefined, singlesCount: number | null | undefined, doublesCount: number | null | undefined) {
  return (seasonName ?? "").toLowerCase().includes("hodge") && Number(singlesCount ?? 0) === 6 && Number(doublesCount ?? 0) === 0;
}

function calculateHodgeBonus(rows: FrameRow[]) {
  const pairs: Array<[number, number]> = [
    [1, 4],
    [2, 5],
    [3, 6],
  ];
  let homeBonus = 0;
  let awayBonus = 0;
  for (const [a, b] of pairs) {
    const ra = rows.find((r) => r.slot_no === a);
    const rb = rows.find((r) => r.slot_no === b);
    if (!ra && !rb) continue;
    const homeTotal =
      (typeof ra?.home_points_scored === "number" ? ra.home_points_scored : 0) +
      (typeof rb?.home_points_scored === "number" ? rb.home_points_scored : 0);
    const awayTotal =
      (typeof ra?.away_points_scored === "number" ? ra.away_points_scored : 0) +
      (typeof rb?.away_points_scored === "number" ? rb.away_points_scored : 0);
    if (homeTotal > awayTotal) homeBonus += 1;
    else if (awayTotal > homeTotal) awayBonus += 1;
  }
  return { homeBonus, awayBonus };
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

  const userEmail = authData.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || userEmail !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can recompute direct fixture results." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fixtureId = typeof body?.fixtureId === "string" ? body.fixtureId : "";
  if (!fixtureId) {
    return NextResponse.json({ error: "Fixture id is required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,location_id,week_no,fixture_date,home_team_id,away_team_id,status,home_points,away_points")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error || !fixtureRes.data) {
    return NextResponse.json({ error: fixtureRes.error?.message ?? "Fixture not found." }, { status: 404 });
  }

  const fixture = fixtureRes.data as FixtureRow;
  const seasonRes = await adminClient
    .from("league_seasons")
    .select("id,name,singles_count,doubles_count")
    .eq("id", fixture.season_id)
    .maybeSingle();
  if (seasonRes.error || !seasonRes.data) {
    return NextResponse.json({ error: seasonRes.error?.message ?? "League not found." }, { status: 400 });
  }
  const season = seasonRes.data as SeasonRow;

  const framesRes = await adminClient
    .from("league_fixture_frames")
    .select("slot_no,winner_side,home_forfeit,away_forfeit,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_points_scored,away_points_scored")
    .eq("fixture_id", fixtureId);
  if (framesRes.error) {
    return NextResponse.json({ error: framesRes.error.message }, { status: 400 });
  }

  const rows = (framesRes.data ?? []) as FrameRow[];
  let homePoints = rows.filter((r) => r.winner_side === "home").length;
  let awayPoints = rows.filter((r) => r.winner_side === "away").length;

  if (isHodgeTriplesSeason(season.name, season.singles_count, season.doubles_count)) {
    const bonus = calculateHodgeBonus(rows);
    homePoints += bonus.homeBonus;
    awayPoints += bonus.awayBonus;
  }

  const total = rows.length;
  const completeCount = rows.filter((r) => r.winner_side !== null || r.home_forfeit || r.away_forfeit).length;
  const status: FixtureRow["status"] = completeCount === 0 ? "pending" : completeCount >= total ? "complete" : "in_progress";

  const fixtureUpdateRes = await adminClient
    .from("league_fixtures")
    .update({ home_points: homePoints, away_points: awayPoints, status })
    .eq("id", fixtureId)
    .select("id,season_id,location_id,week_no,fixture_date,home_team_id,away_team_id,status,home_points,away_points")
    .maybeSingle();
  if (fixtureUpdateRes.error || !fixtureUpdateRes.data) {
    return NextResponse.json({ error: fixtureUpdateRes.error?.message ?? "Failed to update fixture." }, { status: 400 });
  }

  let ratingResult: { ok: boolean; ratedFrameCount: number; playerDeltas: Array<{ player_id: string; delta: number; side: "home" | "away" }> } | null = null;
  if (status === "complete") {
    try {
      ratingResult = await rebuildLeagueFixtureSnookerRatings({
        adminClient,
        fixtureId,
        seasonId: fixture.season_id,
        frames: rows.map((row) => ({
          slot_no: row.slot_no,
          slot_type: row.home_player2_id || row.away_player2_id ? "doubles" : "singles",
          winner_side: row.winner_side,
          home_forfeit: row.home_forfeit,
          away_forfeit: row.away_forfeit,
          home_player1_id: row.home_player1_id,
          home_player2_id: row.home_player2_id,
          away_player1_id: row.away_player1_id,
          away_player2_id: row.away_player2_id,
        })),
        notes: `League fixture ${fixtureId}`,
        metadata: { fixture_id: fixtureId, season_id: fixture.season_id, source: "superuser_direct_entry" },
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to apply snooker rating." },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    fixture: fixtureUpdateRes.data,
    ratingResult,
  });
}

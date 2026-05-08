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
  fixture_date: string | null;
  status: "pending" | "in_progress" | "complete";
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

  const userEmail = authData.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || userEmail !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can rebuild ratings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fixtureDate = typeof body?.fixtureDate === "string" ? body.fixtureDate : "";
  if (!fixtureDate) {
    return NextResponse.json({ error: "fixtureDate is required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const fixturesRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,fixture_date,status")
    .eq("fixture_date", fixtureDate)
    .eq("status", "complete")
    .order("id", { ascending: true });
  if (fixturesRes.error) {
    return NextResponse.json({ error: fixturesRes.error.message }, { status: 400 });
  }

  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const results: Array<{ fixtureId: string; ratedFrameCount: number }> = [];
  for (const fixture of fixtures) {
    const framesRes = await adminClient
      .from("league_fixture_frames")
      .select("slot_no,winner_side,home_forfeit,away_forfeit,home_player1_id,home_player2_id,away_player1_id,away_player2_id")
      .eq("fixture_id", fixture.id)
      .order("slot_no", { ascending: true });
    if (framesRes.error) {
      return NextResponse.json({ error: framesRes.error.message, fixtureId: fixture.id }, { status: 400 });
    }

    const frames = (framesRes.data ?? []) as FrameRow[];
    const rerated = await rebuildLeagueFixtureSnookerRatings({
      adminClient,
      fixtureId: fixture.id,
      seasonId: fixture.season_id,
      frames: frames.map((row) => ({
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
      notes: `League fixture ${fixture.id}`,
      metadata: { fixture_id: fixture.id, season_id: fixture.season_id, source: "bulk_rebuild" },
    });
    results.push({ fixtureId: fixture.id, ratedFrameCount: rerated.ratedFrameCount });
  }

  return NextResponse.json({ ok: true, fixtureDate, fixtureCount: fixtures.length, results });
}

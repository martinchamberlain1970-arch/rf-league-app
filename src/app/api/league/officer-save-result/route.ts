import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";
import { validateOfficerScorecard, type OfficerFrame, type OfficerBreak } from "@/lib/officer-scorecard";
import { POST as recomputeFixture } from "../recompute-fixture/route";

const fields = ["id", "fixture_id", "slot_no", "slot_type", "home_player1_id", "home_player2_id", "away_player1_id", "away_player2_id", "home_nominated", "away_nominated", "home_forfeit", "away_forfeit", "winner_side", "home_nominated_name", "away_nominated_name", "home_points_scored", "away_points_scored"];
const pickFrame = (row: Record<string, unknown>) => Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]])) as OfficerFrame;

export async function POST(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_OFFICER_SCORECARD_ENABLED !== "true") return NextResponse.json({ error: "Officer batch entry has not been enabled yet." }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !key) return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { data, error } = await createClient(url, anon).auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const db = createClient(url, key);
  try { await requireLeagueManager(db, data.user); } catch { return NextResponse.json({ error: "League management access is required." }, { status: 403 }); }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.fixtureId !== "string" || !Array.isArray(body.frames) || !Array.isArray(body.expectedFrames) || !Array.isArray(body.breaks) || !Array.isArray(body.expectedBreaks) || body.frames.length > 30 || body.breaks.length > 100) {
    return NextResponse.json({ error: "Invalid scorecard." }, { status: 400 });
  }
  if ([...body.frames, ...body.expectedFrames, ...body.breaks].some(row => !row || typeof row !== "object")) return NextResponse.json({ error: "Invalid scorecard rows." }, { status: 400 });
  const fixture = await db.from("league_fixtures").select("season_id").eq("id", body.fixtureId).single();
  if (fixture.error) return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  const season = await db.from("league_seasons").select("singles_count,doubles_count").eq("id", fixture.data.season_id).single();
  if (season.error) return NextResponse.json({ error: "League not found." }, { status: 404 });
  const frames = body.frames.map(pickFrame) as OfficerFrame[];
  const expected = body.expectedFrames.map(pickFrame) as OfficerFrame[];
  if (frames.some(row => row.fixture_id !== body.fixtureId) || expected.some(row => row.fixture_id !== body.fixtureId)) return NextResponse.json({ error: "Scorecard fixture mismatch." }, { status: 400 });
  const breaks = body.breaks.map((row: OfficerBreak) => ({ player_id: row.player_id || null, entered_player_name: typeof row.entered_player_name === "string" ? row.entered_player_name : "", break_value: row.break_value ?? "" }));
  const validation = validateOfficerScorecard(frames, breaks, season.data.singles_count ?? 4, season.data.doubles_count ?? 1);
  if (validation.errors.length) return NextResponse.json({ error: validation.errors.join("\n"), errors: validation.errors }, { status: 400 });
  const saved = await db.rpc("save_officer_scorecard", { p_fixture_id: body.fixtureId, p_frames: frames, p_expected_frames: expected, p_breaks: validation.breaks, p_expected_breaks: body.expectedBreaks });
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 409 });
  try {
  const response = await recomputeFixture(new NextRequest(req.url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ fixtureId: body.fixtureId, applyRatings: true }) }));
  const result = await response.json();
  return NextResponse.json({ ...result, scorecardSaved: true, ...(response.ok ? {} : { error: `The scorecard and breaks were saved, but final processing needs retrying: ${result.error}` }) }, { status: response.status });
  } catch {
    return NextResponse.json({ scorecardSaved: true, error: "The scorecard and breaks were saved, but final processing failed. Retry Validate and save result." }, { status: 500 });
  }
}

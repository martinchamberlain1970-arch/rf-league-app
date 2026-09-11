import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const authRes = await authClient.auth.getUser(token);
  if (authRes.error || !authRes.data.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const fixtureId = (await req.json().catch(() => null))?.fixtureId as string | undefined;
  if (!fixtureId) return NextResponse.json({ error: "Fixture id is required." }, { status: 400 });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const fixtureRes = await admin
    .from("league_fixtures")
    .select("id,season_id,home_team_id,away_team_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error || !fixtureRes.data) return NextResponse.json({ error: "Fixture not found." }, { status: 404 });

  const userRes = await admin.from("app_users").select("linked_player_id").eq("id", authRes.data.user.id).maybeSingle();
  const playerId = userRes.data?.linked_player_id as string | null | undefined;
  if (!playerId) return NextResponse.json({ error: "Your account is not linked to a player profile." }, { status: 403 });

  let membershipRes = await admin
    .from("league_team_members")
    .select("team_id,is_captain,is_vice_captain,is_match_scorer")
    .eq("season_id", fixtureRes.data.season_id)
    .eq("player_id", playerId)
    .in("team_id", [fixtureRes.data.home_team_id, fixtureRes.data.away_team_id]);
  if (membershipRes.error && membershipRes.error.message.toLowerCase().includes("is_match_scorer")) {
    const fallback = await admin.from("league_team_members").select("team_id,is_captain,is_vice_captain").eq("season_id", fixtureRes.data.season_id).eq("player_id", playerId).in("team_id", [fixtureRes.data.home_team_id, fixtureRes.data.away_team_id]);
    membershipRes = { ...fallback, data: (fallback.data ?? []).map((row) => ({ ...row, is_match_scorer: false })) } as unknown as typeof membershipRes;
  }
  const permitted = (membershipRes.data ?? []).some((row) => row.is_captain || row.is_vice_captain || row.is_match_scorer);
  if (membershipRes.error || !permitted) return NextResponse.json({ error: "Authorised match-night scorer access is required." }, { status: 403 });

  const seasonRes = await admin.from("league_seasons").select("singles_count,doubles_count").eq("id", fixtureRes.data.season_id).maybeSingle();
  if (seasonRes.error) return NextResponse.json({ error: seasonRes.error.message }, { status: 400 });
  const singles = seasonRes.data?.singles_count ?? 4;
  const doubles = seasonRes.data?.doubles_count ?? 1;
  if (singles !== 4 || doubles !== 1) return NextResponse.json({ error: "This is not a winter-format fixture." }, { status: 400 });

  const existingRes = await admin.from("league_fixture_frames").select("slot_no,slot_type").eq("fixture_id", fixtureId);
  if (existingRes.error) return NextResponse.json({ error: existingRes.error.message }, { status: 400 });
  const existing = new Set((existingRes.data ?? []).map((row) => `${row.slot_no}:${row.slot_type}`));
  const required = [
    ...Array.from({ length: 4 }, (_, index) => ({ slot_no: index + 1, slot_type: "singles" as const })),
    { slot_no: 5, slot_type: "doubles" as const },
  ];
  const missing = required.filter((row) => !existing.has(`${row.slot_no}:${row.slot_type}`));
  if (missing.length > 0) {
    const insertRes = await admin.from("league_fixture_frames").insert(missing.map((row) => ({ fixture_id: fixtureId, ...row })));
    if (insertRes.error) return NextResponse.json({ error: insertRes.error.message }, { status: 400 });
  }

  const framesRes = await admin
    .from("league_fixture_frames")
    .select("id,fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated,away_nominated,home_forfeit,away_forfeit,winner_side,home_nominated_name,away_nominated_name,home_points_scored,away_points_scored")
    .eq("fixture_id", fixtureId)
    .order("slot_no", { ascending: true });
  if (framesRes.error) return NextResponse.json({ error: framesRes.error.message }, { status: 400 });
  return NextResponse.json({ frames: framesRes.data ?? [] });
}

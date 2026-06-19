import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logServerAudit } from "@/lib/server-audit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SubmissionBreakEntry = {
  slot_no?: number | null;
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
  const userEmail = authData.user.email?.trim().toLowerCase() ?? null;
  const body = await req.json().catch(() => null);
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

  let fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,status,fixture_date,home_team_id,away_team_id,home_lineup_submitted_at,away_lineup_submitted_at,pre_match_paper_record,proxy_entry_enabled")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error && fixtureRes.error.message.toLowerCase().includes("proxy_entry")) {
    fixtureRes = await adminClient
      .from("league_fixtures")
      .select("id,season_id,status,fixture_date,home_team_id,away_team_id,home_lineup_submitted_at,away_lineup_submitted_at,pre_match_paper_record")
      .eq("id", fixtureId)
      .maybeSingle();
  }
  if (fixtureRes.error || !fixtureRes.data) return NextResponse.json({ error: "Fixture not found." }, { status: 404 });

  const fixture = fixtureRes.data as {
    id: string;
    season_id: string;
    status: string;
    fixture_date: string | null;
    home_team_id: string;
    away_team_id: string;
    home_lineup_submitted_at?: string | null;
    away_lineup_submitted_at?: string | null;
    pre_match_paper_record?: boolean | null;
    proxy_entry_enabled?: boolean | null;
  };

  if (fixture.status === "complete") {
    return NextResponse.json({ error: "This fixture is already complete." }, { status: 400 });
  }
  if (!fixture.home_lineup_submitted_at || !fixture.away_lineup_submitted_at) {
    return NextResponse.json({ error: "Both lineups must be completed before live score updates can be saved." }, { status: 400 });
  }
  if (fixture.pre_match_paper_record) {
    return NextResponse.json({ error: "This fixture is using a paper pre-match card." }, { status: 400 });
  }
  if (!fixture.fixture_date) {
    return NextResponse.json({ error: "Fixture has no date." }, { status: 400 });
  }

  const fixtureStart = new Date(`${fixture.fixture_date}T00:00:00`);
  const submissionDeadline = new Date(fixtureStart);
  submissionDeadline.setDate(submissionDeadline.getDate() + 1);
  submissionDeadline.setHours(23, 59, 59, 999);
  const now = new Date();
  if (now < fixtureStart || now > submissionDeadline) {
    return NextResponse.json({ error: "This fixture is outside the score entry window." }, { status: 400 });
  }

  const memberRes = await adminClient
    .from("league_team_members")
    .select("team_id,is_captain,is_vice_captain")
    .eq("season_id", fixture.season_id)
    .eq("player_id", linkedPlayerId)
    .or(`team_id.eq.${fixture.home_team_id},team_id.eq.${fixture.away_team_id}`);
  if (memberRes.error) return NextResponse.json({ error: memberRes.error.message }, { status: 400 });

  const allowedTeam = (memberRes.data ?? []).find((r: { team_id: string; is_captain: boolean; is_vice_captain: boolean }) => r.is_captain || r.is_vice_captain);
  if (!allowedTeam) {
    return NextResponse.json({ error: "Only the home captain or vice-captain can save live score progress." }, { status: 403 });
  }
  if (!fixture.proxy_entry_enabled && allowedTeam.team_id !== fixture.home_team_id) {
    return NextResponse.json({ error: "Only the home captain or vice-captain can save live score progress." }, { status: 403 });
  }
  const actorRole = allowedTeam.is_captain ? "captain" : "vice_captain";
  const actorSide = allowedTeam.team_id === fixture.home_team_id ? "home" : "away";

  const cleaned = frameResults
    .filter((r) => Number.isInteger(r.slot_no) && r.slot_no > 0)
    .map((r) => ({
      slot_no: r.slot_no,
      winner_side: r.winner_side,
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
              slot_no: Number.isInteger(b?.slot_no) ? Number(b.slot_no) : r.slot_no,
              player_id: b?.player_id ?? null,
              entered_player_name: b?.entered_player_name ?? null,
              break_value: Number(b?.break_value ?? 0),
            }))
            .filter((b) => Number.isFinite(b.break_value) && b.break_value >= 30 && Number.isInteger(b.slot_no) && (b.player_id || b.entered_player_name))
        : [],
    }));

  const frameMap = new Map(cleaned.map((row) => [row.slot_no, row]));
  const frameRowsRes = await adminClient
    .from("league_fixture_frames")
    .select("id,slot_no")
    .eq("fixture_id", fixture.id);
  if (frameRowsRes.error) return NextResponse.json({ error: frameRowsRes.error.message }, { status: 400 });

  const frameRows = (frameRowsRes.data ?? []) as Array<{ id: string; slot_no: number }>;
  for (const frame of frameRows) {
    const item = frameMap.get(frame.slot_no);
    if (!item) continue;
    const upd = await adminClient
      .from("league_fixture_frames")
      .update({
        winner_side: item.winner_side,
        home_player1_id: item.home_player1_id,
        home_player2_id: item.home_player2_id,
        away_player1_id: item.away_player1_id,
        away_player2_id: item.away_player2_id,
        home_nominated: item.home_nominated,
        away_nominated: item.away_nominated,
        home_forfeit: item.home_forfeit,
        away_forfeit: item.away_forfeit,
        home_nominated_name: item.home_nominated_name,
        away_nominated_name: item.away_nominated_name,
        home_points_scored: item.home_points_scored,
        away_points_scored: item.away_points_scored,
      })
      .eq("id", frame.id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });
  }

  const breaks = cleaned.flatMap((item) => item.break_entries ?? []);
  const delBreaks = await adminClient.from("league_fixture_breaks").delete().eq("fixture_id", fixture.id);
  if (delBreaks.error && !delBreaks.error.message.toLowerCase().includes("does not exist")) {
    return NextResponse.json({ error: delBreaks.error.message }, { status: 400 });
  }
  if (breaks.length > 0) {
    const insBreaks = await adminClient.from("league_fixture_breaks").insert(
      breaks.map((b) => ({
        fixture_id: fixture.id,
        frame_slot_no: b.slot_no ?? null,
        player_id: b.player_id,
        entered_player_name: b.entered_player_name,
        break_value: b.break_value,
      }))
    );
    if (insBreaks.error) return NextResponse.json({ error: insBreaks.error.message }, { status: 400 });
  }

  const hasAnyProgress = cleaned.some(
    (item) =>
      item.winner_side ||
      typeof item.home_points_scored === "number" ||
      typeof item.away_points_scored === "number"
  );
  const fixtureUpdate = await adminClient
    .from("league_fixtures")
    .update({
      status: hasAnyProgress ? "in_progress" : fixture.status,
    })
    .eq("id", fixture.id);
  if (fixtureUpdate.error) {
    return NextResponse.json({ error: fixtureUpdate.error.message }, { status: 400 });
  }

  const completedFrames = cleaned.filter((item) => item.winner_side || item.home_forfeit || item.away_forfeit).length;
  const scoredFrames = cleaned.filter(
    (item) => typeof item.home_points_scored === "number" || typeof item.away_points_scored === "number"
  ).length;
  await logServerAudit(adminClient, {
    actorUserId: userId,
    actorEmail: userEmail,
    actorRole,
    action: "league_live_progress_saved",
    entityType: "league_fixture",
    entityId: fixture.id,
    summary: `Live progress saved for fixture ${fixture.id.slice(0, 8)} by ${actorRole.replace("_", "-")} on ${actorSide} side.`,
    meta: {
      fixture_id: fixture.id,
      fixture_date: fixture.fixture_date,
      actor_side: actorSide,
      proxy_entry_enabled: Boolean(fixture.proxy_entry_enabled),
      frame_rows_received: cleaned.length,
      completed_frames: completedFrames,
      scored_frames: scoredFrames,
      recorded_breaks: breaks.length,
      scorecard_photo_url: scorecardPhotoUrl && scorecardPhotoUrl.trim() ? scorecardPhotoUrl.trim() : null,
      user_agent: req.headers.get("user-agent"),
    },
  });

  return NextResponse.json({ ok: true, scorecardPhotoUrl: scorecardPhotoUrl && scorecardPhotoUrl.trim() ? scorecardPhotoUrl.trim() : null });
}

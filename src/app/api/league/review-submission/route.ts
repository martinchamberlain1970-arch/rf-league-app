import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyGroupSnookerRating } from "@/lib/snooker-rating";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

type SubmissionBreakEntry = {
  player_id?: string | null;
  entered_player_name?: string | null;
  break_value?: number;
};

type SubmissionFrameResult = {
  slot_no: number;
  winner_side: "home" | "away" | null;
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

function isHodgeTriplesSeason(seasonName: string | null | undefined, singlesCount: number | null | undefined, doublesCount: number | null | undefined) {
  return (seasonName ?? "").toLowerCase().includes("hodge") && Number(singlesCount ?? 0) === 6 && Number(doublesCount ?? 0) === 0;
}

function calculateHodgeBonus(
  rows: Array<{
    slot_no: number;
    home_points_scored?: number | null;
    away_points_scored?: number | null;
  }>
) {
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
    // Respotted black means aggregate ties should not occur.
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

  const userId = authData.user.id;
  const userEmail = authData.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || userEmail !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can review submissions." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;
  const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";

  if (!submissionId || !decision) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const submissionRes = await adminClient
    .from("league_result_submissions")
    .select("id,fixture_id,status,frame_results")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionRes.error || !submissionRes.data) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }
  const submission = submissionRes.data as {
    id: string;
    fixture_id: string;
    status: "pending" | "approved" | "rejected" | "needs_correction";
    frame_results: SubmissionFrameResult[] | null;
  };

  if (submission.status !== "pending") {
    return NextResponse.json({ error: "Submission is no longer pending." }, { status: 400 });
  }

  if (decision === "approved") {
    const frameResults = (submission.frame_results ?? []) as SubmissionFrameResult[];
    const breaks: Array<{ player_id: string | null; entered_player_name: string | null; break_value: number }> = [];

    for (const item of frameResults) {
      if (!item?.slot_no || !Number.isInteger(item.slot_no)) continue;

      const slotRes = await adminClient
        .from("league_fixture_frames")
        .select("id")
        .eq("fixture_id", submission.fixture_id)
        .eq("slot_no", item.slot_no)
        .maybeSingle();
      if (slotRes.error || !slotRes.data) continue;

      const patch: Record<string, unknown> = {};
      if (item.winner_side === "home" || item.winner_side === "away" || item.winner_side === null) patch.winner_side = item.winner_side;
      if ("home_player1_id" in item) patch.home_player1_id = item.home_player1_id ?? null;
      if ("home_player2_id" in item) patch.home_player2_id = item.home_player2_id ?? null;
      if ("away_player1_id" in item) patch.away_player1_id = item.away_player1_id ?? null;
      if ("away_player2_id" in item) patch.away_player2_id = item.away_player2_id ?? null;
      if ("home_nominated" in item) patch.home_nominated = Boolean(item.home_nominated);
      if ("away_nominated" in item) patch.away_nominated = Boolean(item.away_nominated);
      if ("home_forfeit" in item) patch.home_forfeit = Boolean(item.home_forfeit);
      if ("away_forfeit" in item) patch.away_forfeit = Boolean(item.away_forfeit);
      if ("home_nominated_name" in item) patch.home_nominated_name = item.home_nominated_name ?? null;
      if ("away_nominated_name" in item) patch.away_nominated_name = item.away_nominated_name ?? null;
      if ("home_points_scored" in item) patch.home_points_scored = typeof item.home_points_scored === "number" ? item.home_points_scored : null;
      if ("away_points_scored" in item) patch.away_points_scored = typeof item.away_points_scored === "number" ? item.away_points_scored : null;

      const upd = await adminClient.from("league_fixture_frames").update(patch).eq("id", slotRes.data.id);
      if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });

      if (Array.isArray(item.break_entries)) {
        for (const br of item.break_entries) {
          const val = Number(br?.break_value ?? 0);
          if (!Number.isFinite(val) || val < 30) continue;
          breaks.push({
            player_id: br?.player_id ?? null,
            entered_player_name: br?.entered_player_name ?? null,
            break_value: val,
          });
        }
      }
    }

    const delBreaks = await adminClient.from("league_fixture_breaks").delete().eq("fixture_id", submission.fixture_id);
    if (delBreaks.error && !delBreaks.error.message.toLowerCase().includes("does not exist")) {
      return NextResponse.json({ error: delBreaks.error.message }, { status: 400 });
    }
    if (breaks.length > 0) {
      const insBreaks = await adminClient.from("league_fixture_breaks").insert(
        breaks.map((b) => ({
          fixture_id: submission.fixture_id,
          player_id: b.player_id,
          entered_player_name: b.entered_player_name,
          break_value: b.break_value,
        }))
      );
      if (insBreaks.error) return NextResponse.json({ error: insBreaks.error.message }, { status: 400 });
    }

    const fixtureRes = await adminClient
      .from("league_fixtures")
      .select("id,season_id")
      .eq("id", submission.fixture_id)
      .maybeSingle();
    if (fixtureRes.error || !fixtureRes.data) {
      return NextResponse.json({ error: fixtureRes.error?.message ?? "Fixture not found." }, { status: 400 });
    }
    const seasonRes = await adminClient
      .from("league_seasons")
      .select("id,name,singles_count,doubles_count")
      .eq("id", fixtureRes.data.season_id)
      .maybeSingle();
    if (seasonRes.error || !seasonRes.data) {
      return NextResponse.json({ error: seasonRes.error?.message ?? "League not found." }, { status: 400 });
    }

    const framesRes = await adminClient
      .from("league_fixture_frames")
      .select("slot_no,winner_side,home_forfeit,away_forfeit,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_points_scored,away_points_scored")
      .eq("fixture_id", submission.fixture_id);
    if (framesRes.error) return NextResponse.json({ error: framesRes.error.message }, { status: 400 });
    const rows = (framesRes.data ?? []) as Array<{
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
    }>;
    let homePoints = rows.filter((r) => r.winner_side === "home").length;
    let awayPoints = rows.filter((r) => r.winner_side === "away").length;
    if (isHodgeTriplesSeason(seasonRes.data.name, seasonRes.data.singles_count, seasonRes.data.doubles_count)) {
      const bonus = calculateHodgeBonus(rows);
      homePoints += bonus.homeBonus;
      awayPoints += bonus.awayBonus;
    }
    const total = rows.length;
    const completeCount = rows.filter((r) => r.winner_side !== null || r.home_forfeit || r.away_forfeit).length;
    const status: "pending" | "in_progress" | "complete" = completeCount === 0 ? "pending" : completeCount >= total ? "complete" : "in_progress";

    const fixtureUpdate = await adminClient
      .from("league_fixtures")
      .update({ home_points: homePoints, away_points: awayPoints, status })
      .eq("id", submission.fixture_id);
    if (fixtureUpdate.error) return NextResponse.json({ error: fixtureUpdate.error.message }, { status: 400 });

    // Apply shared Elo-style snooker rating only when fixture is complete.
    if (status === "complete") {
      const team1Ids = Array.from(
        new Set(
          rows
            .flatMap((r) => [r.home_player1_id, r.home_player2_id])
            .filter((v): v is string => Boolean(v))
        )
      );
      const team2Ids = Array.from(
        new Set(
          rows
            .flatMap((r) => [r.away_player1_id, r.away_player2_id])
            .filter((v): v is string => Boolean(v))
        )
      );
      if (team1Ids.length > 0 && team2Ids.length > 0) {
        try {
          await applyGroupSnookerRating({
            adminClient,
            sourceApp: "league",
            sourceResultId: `league_fixture:${submission.fixture_id}`,
            groupAIds: team1Ids,
            groupBIds: team2Ids,
            scoreA: homePoints,
            scoreB: awayPoints,
            notes: `League fixture ${submission.fixture_id}`,
            metadata: { fixture_id: submission.fixture_id, season_id: fixtureRes.data.season_id },
          });
        } catch (error) {
          return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to apply snooker rating." },
            { status: 400 }
          );
        }
      }
    }
  }

  const reviewUpdate = await adminClient
    .from("league_result_submissions")
    .update({
      status: decision,
      rejection_reason: decision === "rejected" ? rejectionReason || "Rejected by reviewer" : null,
      reviewed_by_user_id: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    .eq("status", "pending");

  if (reviewUpdate.error) return NextResponse.json({ error: reviewUpdate.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

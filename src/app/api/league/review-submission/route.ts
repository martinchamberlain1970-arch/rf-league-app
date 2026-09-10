import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rebuildLeagueFixtureSnookerRatings } from "@/lib/snooker-rating";
import { logServerAudit } from "@/lib/server-audit";
import { requireLeagueManager } from "@/lib/server-role";
import { sendPushToUserIds } from "@/lib/push-server";
import { applyDuePremierHandicapReview, type AutomaticHandicapReviewResult } from "@/lib/automatic-handicap-review";
import { expectedLeagueScorecardFrames, validateCompleteLeagueScorecard } from "@/lib/league-scorecard-validation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SubmissionBreakEntry = {
  slot_no?: number | null;
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
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let actorRole: string;
  try { actorRole = await requireLeagueManager(adminClient, authData.user); } catch { return NextResponse.json({ error: "League management access is required." }, { status: 403 }); }

  const body = await req.json().catch(() => ({}));
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;
  const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";

  if (!submissionId || !decision) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const submissionRes = await adminClient
    .from("league_result_submissions")
    .select("id,fixture_id,submitted_by_user_id,submitter_team_id,status,frame_results,submission_source,public_submitter_name,scorecard_photo_path")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionRes.error || !submissionRes.data) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }
  const submission = submissionRes.data as {
    id: string;
    fixture_id: string;
    submitted_by_user_id: string | null;
    submitter_team_id?: string | null;
    status: "pending" | "approved" | "rejected" | "needs_correction";
    frame_results: SubmissionFrameResult[] | null;
    submission_source?: "authenticated" | "public_paper";
    public_submitter_name?: string | null;
    scorecard_photo_path?: string | null;
  };

  if (submission.status !== "pending") {
    return NextResponse.json({ error: "Submission is no longer pending." }, { status: 400 });
  }

  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,home_team_id,away_team_id")
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

  let automaticHandicapReview: AutomaticHandicapReviewResult | null = null;
  if (decision === "approved") {
    const frameResults = (submission.frame_results ?? []) as SubmissionFrameResult[];
    const scorecardValidation = validateCompleteLeagueScorecard(
      frameResults,
      seasonRes.data.singles_count ?? 4,
      seasonRes.data.doubles_count ?? 1
    );
    if (!scorecardValidation.valid) {
      return NextResponse.json(
        { error: `${scorecardValidation.error} Reject this submission for correction rather than approving it.` },
        { status: 400 }
      );
    }
    const breaks: Array<{ frame_slot_no: number; player_id: string | null; entered_player_name: string | null; break_value: number }> = [];

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
            frame_slot_no: Number.isInteger(br?.slot_no) ? Number(br.slot_no) : item.slot_no,
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
          frame_slot_no: b.frame_slot_no,
          player_id: b.player_id,
          entered_player_name: b.entered_player_name,
          break_value: b.break_value,
        }))
      );
      if (insBreaks.error) return NextResponse.json({ error: insBreaks.error.message }, { status: 400 });
    }

    const framesRes = await adminClient
      .from("league_fixture_frames")
      .select("slot_no,winner_side,home_forfeit,away_forfeit,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated_name,away_nominated_name,home_points_scored,away_points_scored")
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
      home_nominated_name: string | null;
      away_nominated_name: string | null;
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

    // Apply per-frame snooker rating only when fixture is complete.
    if (status === "complete") {
      try {
        await rebuildLeagueFixtureSnookerRatings({
          adminClient,
          fixtureId: submission.fixture_id,
          seasonId: fixtureRes.data.season_id,
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
            home_nominated_name: row.home_nominated_name,
            away_nominated_name: row.away_nominated_name,
          })),
          notes: `League fixture ${submission.fixture_id}`,
          metadata: { fixture_id: submission.fixture_id, season_id: fixtureRes.data.season_id, source: "submission_review" },
        });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed to apply snooker rating." },
          { status: 400 }
        );
      }
      try {
        automaticHandicapReview = await applyDuePremierHandicapReview(adminClient, submission.fixture_id);
      } catch (error) {
        automaticHandicapReview = {
          applied: false,
          reason: `automatic_review_error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }
  }

  if (decision === "rejected") {
    // Repair the scorecard layout as part of reopening it. This matters for
    // older/incomplete submissions where (for example) the doubles row was
    // never created, otherwise the captain would have nothing to complete.
    const expectedFrames = expectedLeagueScorecardFrames(
      seasonRes.data.singles_count ?? 4,
      seasonRes.data.doubles_count ?? 1
    );
    const existingFramesRes = await adminClient
      .from("league_fixture_frames")
      .select("id,slot_no,slot_type")
      .eq("fixture_id", submission.fixture_id);
    if (existingFramesRes.error) {
      return NextResponse.json({ error: existingFramesRes.error.message }, { status: 400 });
    }
    const existingBySlot = new Map((existingFramesRes.data ?? []).map((row) => [row.slot_no, row]));
    const missingFrames = expectedFrames.filter((row) => !existingBySlot.has(row.slot_no));
    if (missingFrames.length > 0) {
      const insertFrames = await adminClient.from("league_fixture_frames").insert(
        missingFrames.map((row) => ({ fixture_id: submission.fixture_id, ...row }))
      );
      if (insertFrames.error) return NextResponse.json({ error: insertFrames.error.message }, { status: 400 });
    }
    for (const expected of expectedFrames) {
      const existing = existingBySlot.get(expected.slot_no);
      if (existing && existing.slot_type !== expected.slot_type) {
        const repairFrame = await adminClient
          .from("league_fixture_frames")
          .update({ slot_type: expected.slot_type })
          .eq("id", existing.id);
        if (repairFrame.error) return NextResponse.json({ error: repairFrame.error.message }, { status: 400 });
      }
    }

    // Keep the captain's recorded work available on the live fixture so the
    // scorecard reopens with the existing scores instead of starting again.
    for (const item of submission.frame_results ?? []) {
      if (!item?.slot_no || !Number.isInteger(item.slot_no)) continue;
      const patch: Record<string, unknown> = {
        winner_side: item.winner_side === "home" || item.winner_side === "away" ? item.winner_side : null,
        home_player1_id: item.home_player1_id ?? null,
        home_player2_id: item.home_player2_id ?? null,
        away_player1_id: item.away_player1_id ?? null,
        away_player2_id: item.away_player2_id ?? null,
        home_nominated: Boolean(item.home_nominated),
        away_nominated: Boolean(item.away_nominated),
        home_forfeit: Boolean(item.home_forfeit),
        away_forfeit: Boolean(item.away_forfeit),
        home_nominated_name: item.home_nominated_name ?? null,
        away_nominated_name: item.away_nominated_name ?? null,
        home_points_scored: typeof item.home_points_scored === "number" ? item.home_points_scored : null,
        away_points_scored: typeof item.away_points_scored === "number" ? item.away_points_scored : null,
      };
      const keepResult = await adminClient
        .from("league_fixture_frames")
        .update(patch)
        .eq("fixture_id", submission.fixture_id)
        .eq("slot_no", item.slot_no);
      if (keepResult.error) return NextResponse.json({ error: keepResult.error.message }, { status: 400 });
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

  let evidenceDeleted = !submission.scorecard_photo_path;
  if (submission.scorecard_photo_path) {
    const removed = await adminClient.storage.from("temporary-scorecards").remove([submission.scorecard_photo_path]);
    if (!removed.error) {
      evidenceDeleted = true;
      await adminClient.from("league_result_submissions").update({
        scorecard_photo_path: null,
        scorecard_evidence_deleted_at: new Date().toISOString(),
      }).eq("id", submission.id);
    }
  }

  if (decision === "rejected") {
    const hasRecordedFrames = (submission.frame_results ?? []).some(
      (row) => row.winner_side || row.home_forfeit || row.away_forfeit || typeof row.home_points_scored === "number" || typeof row.away_points_scored === "number"
    );
    const resetFixture = await adminClient.from("league_fixtures").update({ status: hasRecordedFrames ? "in_progress" : "pending" }).eq("id", submission.fixture_id);
    if (resetFixture.error) return NextResponse.json({ error: resetFixture.error.message }, { status: 400 });
  }

  await logServerAudit(adminClient, {
    actorUserId: userId,
    actorEmail: authData.user.email ?? null,
    actorRole,
    action: decision === "approved" ? "league_submission_approved" : "league_submission_rejected",
    entityType: "league_fixture",
    entityId: submission.fixture_id,
    summary:
      decision === "approved"
        ? "Fixture submission approved by a league officer."
        : `Fixture submission rejected by a league officer${rejectionReason ? `: ${rejectionReason}` : "."}`,
    meta: {
      fixture_id: submission.fixture_id,
      submission_id: submission.id,
      decision,
      rejection_reason: decision === "rejected" ? rejectionReason || null : null,
      submission_source: submission.submission_source ?? "authenticated",
      public_submitter_name: submission.public_submitter_name ?? null,
      temporary_scorecard_evidence_deleted: evidenceDeleted,
    },
  });

  let notificationUserIds = submission.submitted_by_user_id ? [submission.submitted_by_user_id] : [];
  if (decision === "rejected") {
    const correctionTeamId = submission.submitter_team_id ?? fixtureRes.data.home_team_id;
    const officersRes = await adminClient
      .from("league_team_members")
      .select("player_id")
      .eq("season_id", fixtureRes.data.season_id)
      .eq("team_id", correctionTeamId)
      .or("is_captain.eq.true,is_vice_captain.eq.true");
    if (!officersRes.error) {
      const playerIds = [...new Set((officersRes.data ?? []).map((row) => row.player_id).filter(Boolean))];
      if (playerIds.length > 0) {
        const usersRes = await adminClient.from("app_users").select("id").in("linked_player_id", playerIds);
        if (!usersRes.error) notificationUserIds = [...notificationUserIds, ...(usersRes.data ?? []).map((row) => row.id)];
      }
    }
  }

  if (notificationUserIds.length > 0) {
    await sendPushToUserIds(adminClient, notificationUserIds, {
      title: decision === "approved" ? "League result approved" : "League result needs attention",
      body: decision === "approved" ? "Your submitted league scorecard has been approved." : rejectionReason || "Your submitted scorecard was not approved. Open Rack & Frame for details.",
      url: decision === "approved" ? "/results" : `/captain-results?fixtureId=${submission.fixture_id}`,
      tag: `league-submission-review-${submission.id}`,
    });
  }

  return NextResponse.json({ ok: true, evidenceDeleted, automaticHandicapReview });
}

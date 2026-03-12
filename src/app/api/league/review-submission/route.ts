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

function expectedScore(teamA: number, teamB: number) {
  return 1 / (1 + Math.pow(10, (teamB - teamA) / 400));
}

function kFactor(avgRating: number, avgMatches: number) {
  if (avgMatches < 30) return 32;
  if (avgRating >= 1800) return 16;
  return 20;
}

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

    // Apply Elo-style snooker rating only when fixture is complete.
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
        const uniqueIds = Array.from(new Set([...team1Ids, ...team2Ids]));
        const playerRes = await adminClient
          .from("players")
          .select("id,rating_snooker,peak_rating_snooker,rated_matches_snooker")
          .in("id", uniqueIds);
        if (!playerRes.error && playerRes.data) {
          const players = playerRes.data as Array<{
            id: string;
            rating_snooker: number | null;
            peak_rating_snooker: number | null;
            rated_matches_snooker: number | null;
          }>;
          const playerById = new Map(players.map((p) => [p.id, p]));

          const team1Ratings = team1Ids.map((pid) => playerById.get(pid)?.rating_snooker ?? 1000);
          const team2Ratings = team2Ids.map((pid) => playerById.get(pid)?.rating_snooker ?? 1000);
          const team1Matches = team1Ids.map((pid) => playerById.get(pid)?.rated_matches_snooker ?? 0);
          const team2Matches = team2Ids.map((pid) => playerById.get(pid)?.rated_matches_snooker ?? 0);

          const team1AvgRating = team1Ratings.reduce((a, b) => a + b, 0) / team1Ratings.length;
          const team2AvgRating = team2Ratings.reduce((a, b) => a + b, 0) / team2Ratings.length;
          const team1AvgMatches = team1Matches.reduce((a, b) => a + b, 0) / team1Matches.length;
          const team2AvgMatches = team2Matches.reduce((a, b) => a + b, 0) / team2Matches.length;

          const expectedTeam1 = expectedScore(team1AvgRating, team2AvgRating);
          const actualTeam1 = homePoints > awayPoints ? 1 : homePoints < awayPoints ? 0 : 0.5;
          const k = Math.max(kFactor(team1AvgRating, team1AvgMatches), kFactor(team2AvgRating, team2AvgMatches));
          const deltaTeam1 = Math.round(k * (actualTeam1 - expectedTeam1));
          const deltaTeam2 = -deltaTeam1;

          for (const pid of team1Ids) {
            const p = playerById.get(pid);
            if (!p) continue;
            const current = p.rating_snooker ?? 1000;
            const next = Math.max(100, current + deltaTeam1);
            const peak = Math.max(p.peak_rating_snooker ?? 1000, next);
            const played = (p.rated_matches_snooker ?? 0) + 1;
            const upd = await adminClient
              .from("players")
              .update({
                rating_snooker: next,
                peak_rating_snooker: peak,
                rated_matches_snooker: played,
              })
              .eq("id", pid);
            if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });
          }

          for (const pid of team2Ids) {
            const p = playerById.get(pid);
            if (!p) continue;
            const current = p.rating_snooker ?? 1000;
            const next = Math.max(100, current + deltaTeam2);
            const peak = Math.max(p.peak_rating_snooker ?? 1000, next);
            const played = (p.rated_matches_snooker ?? 0) + 1;
            const upd = await adminClient
              .from("players")
              .update({
                rating_snooker: next,
                peak_rating_snooker: peak,
                rated_matches_snooker: played,
              })
              .eq("id", pid);
            if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });
          }
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

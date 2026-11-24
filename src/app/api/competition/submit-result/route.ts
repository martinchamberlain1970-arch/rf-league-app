import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fixedHandicapsForMatch } from "@/lib/fixed-competition-handicaps-server";
import { usesFixedCompetitionHandicaps } from "@/lib/fixed-competition-handicaps";
import { sendPushToLeagueManagers } from "@/lib/push-server";
import { isHodgeCup, scoreHodgeCup, type HodgeSide } from "@/lib/hodge-score";
import { canManageLeagueRole } from "@/lib/app-roles";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SubmitPayload = {
  matchId: string;
  mode: "standard" | "albery";
  winnerSide: "home" | "away";
  homeScore?: number;
  awayScore?: number;
  hodgeBlackWinners?: Array<HodgeSide | null>;
  frameResults?: Array<{ frameNo?: number; home: number; away: number }>;
  breakEntries?: Array<{ player_id?: string | null; entered_player_name?: string | null; break_value: number }>;
  albery?: {
    homePlayers: [string, string, string];
    awayPlayers: [string, string, string];
    leg1: { home: number; away: number };
    leg2: { home: number; away: number };
    leg3: { home: number; away: number };
  };
};

const isAlberyName = (name: string) =>
  name === "Albery Cup (Billiards 3-Man Team)" || name.startsWith("Albery Cup (Billiards 3-Man Team) - ");

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as SubmitPayload;
  const matchId = String(body?.matchId ?? "").trim();
  const mode = body?.mode;
  const winnerSide = body?.winnerSide;
  if (!matchId || (mode !== "standard" && mode !== "albery") || (winnerSide !== "home" && winnerSide !== "away")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const breakEntries = Array.isArray(body.breakEntries) ? body.breakEntries : [];

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const matchRes = await adminClient
    .from("matches")
    .select("id,competition_id,status,round_no,best_of,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id")
    .eq("id", matchId)
    .eq("is_archived", false)
    .maybeSingle();
  if (matchRes.error || !matchRes.data) return NextResponse.json({ error: "Match not found." }, { status: 404 });
  const match = matchRes.data as {
    id: string;
    competition_id: string | null;
    status: string;
    round_no: number | null;
    best_of: number | null;
    player1_id: string | null;
    player2_id: string | null;
    team1_player1_id: string | null;
    team1_player2_id: string | null;
    team2_player1_id: string | null;
    team2_player2_id: string | null;
  };

  if (!match.competition_id) return NextResponse.json({ error: "This match is not linked to a competition." }, { status: 400 });
  if (match.status !== "pending" && match.status !== "in_progress") return NextResponse.json({ error: "This match is locked for scoring." }, { status: 400 });

  const competitionRes = await adminClient
    .from("competitions")
    .select("id,name,best_of")
    .eq("id", match.competition_id)
    .maybeSingle();
  if (competitionRes.error || !competitionRes.data) return NextResponse.json({ error: "Competition not found." }, { status: 404 });
  const competition = competitionRes.data as { id: string; name: string; best_of: number };
  const isAlbery = isAlberyName(competition.name);
  const isHodge = isHodgeCup(competition.name);
  const isHamilton =
    competition.name === "Hamilton Cup (Singles Billiards)" ||
    competition.name.startsWith("Hamilton Cup (Singles Billiards) - ") ||
    competition.name === "Hamilton Cup (Billiards Singles)" ||
    competition.name.startsWith("Hamilton Cup (Billiards Singles) - ");
  if (isAlbery !== (mode === "albery")) {
    return NextResponse.json({ error: "Use the scorecard format for this competition." }, { status: 400 });
  }

  const appUserRes = await adminClient.from("app_users").select("linked_player_id,role").eq("id", authData.user.id).maybeSingle();
  if (appUserRes.error) return NextResponse.json({ error: appUserRes.error.message }, { status: 400 });
  const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
  const role = String(appUserRes.data?.role ?? "").toLowerCase();
  const isSuper = canManageLeagueRole(role);
  const participants = new Set(
    [
      match.player1_id,
      match.player2_id,
      match.team1_player1_id,
      match.team1_player2_id,
      match.team2_player1_id,
      match.team2_player2_id,
    ].filter(Boolean) as string[]
  );
  if (!isSuper && (!linkedPlayerId || !participants.has(linkedPlayerId))) {
    return NextResponse.json({ error: "Only match participants can submit this result." }, { status: 403 });
  }

  if (usesFixedCompetitionHandicaps(competition.name)) {
    try {
      const fixed = await fixedHandicapsForMatch(adminClient, { ...match, competition_id: match.competition_id }, competition.name);
      if (!fixed?.ready) return NextResponse.json({ error: fixed?.reason ?? "Fixed competition handicaps are not available." }, { status: 409 });
      if (mode !== "standard" || !Array.isArray(body.frameResults) || body.frameResults.length === 0) {
        return NextResponse.json({ error: "Enter the final scoreboard totals for each frame, including the handicap start." }, { status: 400 });
      }
    } catch (error) {
      console.error("Fixed competition handicap verification failed", error);
      return NextResponse.json({ error: "Fixed competition handicaps could not be checked. Try again." }, { status: 500 });
    }
  }

  if (mode === "standard") {
    const frameRows = Array.isArray(body.frameResults) ? body.frameResults : [];
    let derivedWinnerSide: "home" | "away" = winnerSide;
    let homeScore = Number(body.homeScore ?? 0);
    let awayScore = Number(body.awayScore ?? 0);
    if (isHodge) {
      if (frameRows.some((frame, index) => !frame || (frame.frameNo !== undefined && frame.frameNo !== index + 1))) {
        return NextResponse.json({ error: "Enter Hodge Cup frames in order from 1 to 6." }, { status: 400 });
      }
      const points = scoreHodgeCup(frameRows, Array.isArray(body.hodgeBlackWinners) ? body.hodgeBlackWinners : []);
      if ("error" in points) return NextResponse.json({ error: points.error }, { status: 400 });
      homeScore = points.home;
      awayScore = points.away;
      derivedWinnerSide = points.winnerSide;
    } else if (frameRows.length > 0) {
      if (isHamilton) return NextResponse.json({ error: "Enter final points for the Hamilton Cup." }, { status: 400 });
      let homeWins = 0;
      let awayWins = 0;
      const winsNeeded = Math.floor(Math.max(1, Number(match.best_of ?? competition.best_of ?? 1)) / 2) + 1;
      for (const [index, frame] of frameRows.entries()) {
        if (!frame || (frame.frameNo !== undefined && frame.frameNo !== index + 1)) {
          return NextResponse.json({ error: "Enter frame scores in order without gaps." }, { status: 400 });
        }
        const { home, away } = frame;
        if (!Number.isSafeInteger(home) || !Number.isSafeInteger(away) || home < 0 || away < 0 || home === away) {
          return NextResponse.json({ error: "Enter two different, valid scores for each frame." }, { status: 400 });
        }
        if (homeWins === winsNeeded || awayWins === winsNeeded) {
          return NextResponse.json({ error: "Remove any frames entered after the winning frame." }, { status: 400 });
        }
        if (home > away) homeWins += 1;
        else awayWins += 1;
      }
      homeScore = homeWins;
      awayScore = awayWins;
      derivedWinnerSide = homeWins > awayWins ? "home" : "away";
    } else if (!Number.isSafeInteger(homeScore) || !Number.isSafeInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      return NextResponse.json({ error: "Enter valid scores." }, { status: 400 });
    }
    if (isHamilton) {
      if (!match.player1_id || !match.player2_id) {
        return NextResponse.json({ error: "Hamilton Cup requires singles players on the match." }, { status: 400 });
      }
      const maxRoundRes = await adminClient
        .from("matches")
        .select("round_no,match_no")
        .eq("competition_id", competition.id)
        .eq("is_archived", false);
      if (maxRoundRes.error) return NextResponse.json({ error: maxRoundRes.error.message }, { status: 400 });
      const bracket = maxRoundRes.data ?? [];
      const firstRoundSlots = Math.max(1, ...bracket.filter((row) => (row.round_no ?? 1) === 1).map((row) => Number(row.match_no ?? 1)));
      const maxRound = Math.max(1 + Math.ceil(Math.log2(firstRoundSlots)), ...bracket.map((row) => Number(row.round_no ?? 1)));
      const isSemiOrFinal = (match.round_no ?? 1) >= Math.max(1, maxRound - 1);
      const base = isSemiOrFinal ? 400 : 200;
      const handicapMultiplier = isSemiOrFinal ? 2 : 1;

      const hcpRes = await adminClient
        .from("players")
        .select("id,snooker_handicap")
        .in("id", [match.player1_id, match.player2_id]);
      if (hcpRes.error) return NextResponse.json({ error: hcpRes.error.message }, { status: 400 });
      const hcpById = new Map((hcpRes.data ?? []).map((r) => [r.id, Number(r.snooker_handicap ?? 0)]));
      const homeTarget = base + (hcpById.get(match.player1_id) ?? 0) * handicapMultiplier;
      const awayTarget = base + (hcpById.get(match.player2_id) ?? 0) * handicapMultiplier;
      const winnerScore = derivedWinnerSide === "home" ? homeScore : awayScore;
      const otherScore = derivedWinnerSide === "home" ? awayScore : homeScore;
      const otherTarget = derivedWinnerSide === "home" ? awayTarget : homeTarget;
      const winnerTarget = derivedWinnerSide === "home" ? homeTarget : awayTarget;
      if (winnerScore < winnerTarget) {
        return NextResponse.json(
          { error: `Winner score must reach target (${Math.round(winnerTarget)}) for this Hamilton Cup round.` },
          { status: 400 }
        );
      }
      if (otherScore >= otherTarget) {
        return NextResponse.json({ error: "Only the winner can reach their Hamilton Cup target." }, { status: 400 });
      }
    } else if (!isHodge) {
      const winsNeeded = Math.floor(Math.max(1, Number(match.best_of ?? competition.best_of ?? 1)) / 2) + 1;
      derivedWinnerSide = homeScore > awayScore ? "home" : "away";
      const winnerScore = derivedWinnerSide === "home" ? homeScore : awayScore;
      const loserScore = derivedWinnerSide === "home" ? awayScore : homeScore;
      if (winnerScore !== winsNeeded || loserScore >= winsNeeded) {
        return NextResponse.json({ error: `Final score must be ${winsNeeded}-x or x-${winsNeeded}.` }, { status: 400 });
      }
    }
    (body as SubmitPayload).winnerSide = derivedWinnerSide;
    body.homeScore = homeScore;
    body.awayScore = awayScore;
  } else {
    const a = body.albery;
    if (!a) return NextResponse.json({ error: "Missing Albery details." }, { status: 400 });
    const legs = [a.leg1, a.leg2, a.leg3];
    const targets = [100, 200, 300];
    for (let i = 0; i < 3; i += 1) {
      const l = legs[i];
      if (!Number.isFinite(l.home) || !Number.isFinite(l.away) || l.home < 0 || l.away < 0) {
        return NextResponse.json({ error: "Enter valid Albery leg scores." }, { status: 400 });
      }
      if (l.home === l.away) return NextResponse.json({ error: `Leg ${i + 1} cannot be tied.` }, { status: 400 });
      if (Math.max(l.home, l.away) < targets[i]) {
        return NextResponse.json({ error: `Leg ${i + 1} must reach at least ${targets[i]} points.` }, { status: 400 });
      }
    }
    const inferredWinner: "home" | "away" = a.leg3.home > a.leg3.away ? "home" : "away";
    if (inferredWinner !== winnerSide) {
      return NextResponse.json({ error: "Winner side must match the final 300-point leg outcome." }, { status: 400 });
    }
    if (a.homePlayers.some((x) => !String(x ?? "").trim()) || a.awayPlayers.some((x) => !String(x ?? "").trim())) {
      return NextResponse.json({ error: "Enter all six player names for Albery Cup." }, { status: 400 });
    }
  }

  for (const br of breakEntries) {
    const v = Number(br?.break_value ?? 0);
    if (!Number.isFinite(v) || v < 30) {
      return NextResponse.json({ error: "All high breaks must be 30 or above." }, { status: 400 });
    }
    const hasName = String(br?.entered_player_name ?? "").trim().length > 0;
    const hasId = String(br?.player_id ?? "").trim().length > 0;
    if (!hasName && !hasId) {
      return NextResponse.json({ error: "Select a player for each high break entry." }, { status: 400 });
    }
  }

  const existingPending = await adminClient
    .from("competition_result_submissions")
    .select("id")
    .eq("match_id", match.id)
    .eq("status", "pending")
    .limit(1);
  if (existingPending.error) return NextResponse.json({ error: existingPending.error.message }, { status: 400 });
  if ((existingPending.data ?? []).length > 0) {
    return NextResponse.json({ error: "A result submission is already pending review for this match." }, { status: 400 });
  }

  const insRes = await adminClient.from("competition_result_submissions").insert({
    match_id: match.id,
    competition_id: match.competition_id,
    submitted_by_user_id: authData.user.id,
    payload: {
      mode,
      winnerSide: body.winnerSide,
      homeScore: body.homeScore ?? null,
      awayScore: body.awayScore ?? null,
      frameResults: Array.isArray(body.frameResults)
        ? body.frameResults.map((fr, idx) => ({
            frameNo: Number(fr?.frameNo ?? idx + 1),
            home: Number(fr?.home ?? 0),
            away: Number(fr?.away ?? 0),
          }))
        : null,
      breakEntries: breakEntries.map((br) => ({
        player_id: br?.player_id ?? null,
        entered_player_name: br?.entered_player_name ?? null,
        break_value: Number(br?.break_value ?? 0),
      })),
      ...(isHodge ? { hodgeBlackWinners: body.hodgeBlackWinners ?? [] } : {}),
      albery: body.albery ?? null,
    },
    status: "pending",
    rejection_reason: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
  });
  if (insRes.error) return NextResponse.json({ error: insRes.error.message }, { status: 400 });

  await sendPushToLeagueManagers(adminClient, {
    title: "Competition result awaiting approval",
    body: "A knockout competition result has been submitted for review.",
    url: "/results",
    tag: `competition-submission-${match.id}`,
  }, [authData.user.id]);

  return NextResponse.json({ ok: true });
}

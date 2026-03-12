import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

type CompetitionSubmissionPayload = {
  winnerSide?: "home" | "away";
  frameResults?: Array<{ frameNo?: number; home: number; away: number }>;
  breakEntries?: Array<{ player_id?: string | null; entered_player_name?: string | null; break_value: number }>;
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
    return NextResponse.json({ error: "Only Super User can review competition submissions." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;
  const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";
  if (!submissionId || !decision) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const subRes = await adminClient
    .from("competition_result_submissions")
    .select("id,match_id,competition_id,status,payload")
    .eq("id", submissionId)
    .maybeSingle();
  if (subRes.error || !subRes.data) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const sub = subRes.data as {
    id: string;
    match_id: string;
    competition_id: string;
    status: string;
    payload: CompetitionSubmissionPayload | null;
  };
  if (sub.status !== "pending") return NextResponse.json({ error: "Submission is no longer pending." }, { status: 400 });

  if (decision === "approved") {
    const matchRes = await adminClient
      .from("matches")
      .select("id,status,player1_id,player2_id,team1_player1_id,team2_player1_id")
      .eq("id", sub.match_id)
      .maybeSingle();
    if (matchRes.error || !matchRes.data) return NextResponse.json({ error: "Match not found." }, { status: 404 });
    const m = matchRes.data as {
      id: string;
      status: string;
      player1_id: string | null;
      player2_id: string | null;
      team1_player1_id: string | null;
      team2_player1_id: string | null;
    };
    if (m.status === "complete") {
      return NextResponse.json({ error: "Match is already complete and locked." }, { status: 400 });
    }

    const side = sub.payload?.winnerSide;
    if (side !== "home" && side !== "away") {
      return NextResponse.json({ error: "Submission payload is missing winner side." }, { status: 400 });
    }
    const winnerPlayerId =
      side === "home"
        ? (m.team1_player1_id ?? m.player1_id ?? null)
        : (m.team2_player1_id ?? m.player2_id ?? null);
    if (!winnerPlayerId) return NextResponse.json({ error: "Could not resolve match winner player." }, { status: 400 });

    const frameRows = Array.isArray(sub.payload?.frameResults) ? sub.payload?.frameResults ?? [] : [];
    if (frameRows.length > 0) {
      const delFrames = await adminClient.from("frames").delete().eq("match_id", m.id);
      if (delFrames.error && !delFrames.error.message.toLowerCase().includes("does not exist")) {
        return NextResponse.json({ error: delFrames.error.message }, { status: 400 });
      }
      const inserts: Array<{ match_id: string; frame_no: number; winner_player_id: string | null; is_walkover_award: boolean }> = [];
      frameRows.forEach((fr, idx) => {
        const h = Number(fr.home ?? 0);
        const a = Number(fr.away ?? 0);
        if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) return;
        const frameWinnerSide: "home" | "away" = h > a ? "home" : "away";
        const frameWinnerPlayerId =
          frameWinnerSide === "home"
            ? (m.team1_player1_id ?? m.player1_id ?? null)
            : (m.team2_player1_id ?? m.player2_id ?? null);
        inserts.push({
          match_id: m.id,
          frame_no: Number(fr.frameNo ?? idx + 1),
          winner_player_id: frameWinnerPlayerId,
          is_walkover_award: false,
        });
      });
      if (inserts.length > 0) {
        const insFrames = await adminClient.from("frames").insert(inserts);
        if (insFrames.error) return NextResponse.json({ error: insFrames.error.message }, { status: 400 });
      }
    }

    const breakRows = Array.isArray(sub.payload?.breakEntries) ? sub.payload?.breakEntries ?? [] : [];
    const delBreaks = await adminClient.from("competition_match_breaks").delete().eq("match_id", m.id);
    if (delBreaks.error && !delBreaks.error.message.toLowerCase().includes("does not exist")) {
      return NextResponse.json({ error: delBreaks.error.message }, { status: 400 });
    }
    if (breakRows.length > 0) {
      const inserts = breakRows
        .map((br) => ({
          match_id: m.id,
          competition_id: sub.competition_id,
          player_id: br?.player_id ?? null,
          entered_player_name: br?.entered_player_name ?? null,
          break_value: Number(br?.break_value ?? 0),
        }))
        .filter((r) => Number.isFinite(r.break_value) && r.break_value >= 30 && r.competition_id);
      if (inserts.length > 0) {
        const insBreaks = await adminClient.from("competition_match_breaks").insert(inserts);
        if (insBreaks.error) return NextResponse.json({ error: insBreaks.error.message }, { status: 400 });
      }
    }

    const updMatch = await adminClient
      .from("matches")
      .update({ winner_player_id: winnerPlayerId, status: "complete" })
      .eq("id", m.id);
    if (updMatch.error) return NextResponse.json({ error: updMatch.error.message }, { status: 400 });
  }

  const updSub = await adminClient
    .from("competition_result_submissions")
    .update({
      status: decision,
      rejection_reason: decision === "rejected" ? rejectionReason || null : null,
      reviewed_by_user_id: authData.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (updSub.error) return NextResponse.json({ error: updSub.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

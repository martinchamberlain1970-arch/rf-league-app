import type { SupabaseClient } from "@supabase/supabase-js";

type RatedPlayer = {
  id: string;
  rating_snooker: number | null;
  peak_rating_snooker: number | null;
  rated_matches_snooker: number | null;
};

type ApplyGroupRatingArgs = {
  adminClient: SupabaseClient;
  sourceApp: "league" | "club";
  sourceResultId: string;
  groupAIds: string[];
  groupBIds: string[];
  scoreA: number;
  scoreB: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

function expectedScore(teamA: number, teamB: number) {
  return 1 / (1 + Math.pow(10, (teamB - teamA) / 400));
}

function kFactor(avgRating: number, avgMatches: number) {
  if (avgMatches < 30) return 32;
  if (avgRating >= 1800) return 16;
  return 20;
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function targetHandicapFromElo(rating: number) {
  const raw = (1000 - rating) / 5;
  return Math.round(raw / 4) * 4;
}

export async function resolveCanonicalPlayerId(
  adminClient: SupabaseClient,
  sourceApp: "league" | "club",
  canonicalPlayerId?: string | null,
  sourcePlayerId?: string | null
) {
  if (canonicalPlayerId) return canonicalPlayerId;
  if (!sourcePlayerId) return null;
  if (sourceApp === "league") return sourcePlayerId;

  const linkRes = await adminClient
    .from("external_player_links")
    .select("league_player_id")
    .eq("source_app", sourceApp)
    .eq("source_player_id", sourcePlayerId)
    .maybeSingle();

  if (linkRes.error) throw new Error(linkRes.error.message);
  return (linkRes.data?.league_player_id as string | null) ?? null;
}

export async function applyGroupSnookerRating({
  adminClient,
  sourceApp,
  sourceResultId,
  groupAIds,
  groupBIds,
  scoreA,
  scoreB,
  notes,
  metadata,
}: ApplyGroupRatingArgs) {
  const sideA = uniqueIds(groupAIds);
  const sideB = uniqueIds(groupBIds);
  if (sideA.length === 0 || sideB.length === 0) {
    return { ok: true, skipped: true as const, reason: "missing_players" };
  }

  const existingReceipt = await adminClient
    .from("rating_result_receipts")
    .select("id,status")
    .eq("source_app", sourceApp)
    .eq("source_result_id", sourceResultId)
    .maybeSingle();
  if (existingReceipt.error) throw new Error(existingReceipt.error.message);
  if (existingReceipt.data?.id) {
    return { ok: true, skipped: true as const, reason: existingReceipt.data.status ?? "already_processed" };
  }

  const receiptInsert = await adminClient.from("rating_result_receipts").insert({
    source_app: sourceApp,
    source_result_id: sourceResultId,
    winner_player_id: scoreA === scoreB ? null : scoreA > scoreB ? sideA[0] : sideB[0],
    loser_player_id: scoreA === scoreB ? null : scoreA > scoreB ? sideB[0] : sideA[0],
    status: "processing",
    metadata: {
      side_a_ids: sideA,
      side_b_ids: sideB,
      score_a: scoreA,
      score_b: scoreB,
      ...metadata,
    },
  });
  if (receiptInsert.error) throw new Error(receiptInsert.error.message);

  try {
    const ids = uniqueIds([...sideA, ...sideB]);
    const playersRes = await adminClient
      .from("players")
      .select("id,rating_snooker,peak_rating_snooker,rated_matches_snooker")
      .in("id", ids);
    if (playersRes.error) throw new Error(playersRes.error.message);

    const players = (playersRes.data ?? []) as RatedPlayer[];
    const playerById = new Map(players.map((p) => [p.id, p]));

    const sideARatings = sideA.map((pid) => playerById.get(pid)?.rating_snooker ?? 1000);
    const sideBRatings = sideB.map((pid) => playerById.get(pid)?.rating_snooker ?? 1000);
    const sideAMatches = sideA.map((pid) => playerById.get(pid)?.rated_matches_snooker ?? 0);
    const sideBMatches = sideB.map((pid) => playerById.get(pid)?.rated_matches_snooker ?? 0);

    const sideAAvgRating = sideARatings.reduce((a, b) => a + b, 0) / sideARatings.length;
    const sideBAvgRating = sideBRatings.reduce((a, b) => a + b, 0) / sideBRatings.length;
    const sideAAvgMatches = sideAMatches.reduce((a, b) => a + b, 0) / sideAMatches.length;
    const sideBAvgMatches = sideBMatches.reduce((a, b) => a + b, 0) / sideBMatches.length;

    const expectedA = expectedScore(sideAAvgRating, sideBAvgRating);
    const actualA = scoreA > scoreB ? 1 : scoreA < scoreB ? 0 : 0.5;
    const k = Math.max(kFactor(sideAAvgRating, sideAAvgMatches), kFactor(sideBAvgRating, sideBAvgMatches));
    const deltaA = Math.round(k * (actualA - expectedA));
    const deltaB = -deltaA;

    const eventRows: Array<Record<string, unknown>> = [];

    for (const pid of sideA) {
      const p = playerById.get(pid);
      if (!p) continue;
      const current = p.rating_snooker ?? 1000;
      const next = Math.max(100, current + deltaA);
      const peak = Math.max(p.peak_rating_snooker ?? 1000, next);
      const played = (p.rated_matches_snooker ?? 0) + 1;
      const updateRes = await adminClient
        .from("players")
        .update({
          rating_snooker: next,
          peak_rating_snooker: peak,
          rated_matches_snooker: played,
        })
        .eq("id", pid);
      if (updateRes.error) throw new Error(updateRes.error.message);

      eventRows.push({
        player_id: pid,
        opponent_player_id: sideB[0] ?? null,
        source_app: sourceApp,
        source_result_id: sourceResultId,
        event_type: actualA === 1 ? "result_win" : actualA === 0 ? "result_loss" : "result_draw",
        rating_before: current,
        rating_after: next,
        rating_delta: next - current,
        notes: notes ?? null,
      });
    }

    for (const pid of sideB) {
      const p = playerById.get(pid);
      if (!p) continue;
      const current = p.rating_snooker ?? 1000;
      const next = Math.max(100, current + deltaB);
      const peak = Math.max(p.peak_rating_snooker ?? 1000, next);
      const played = (p.rated_matches_snooker ?? 0) + 1;
      const updateRes = await adminClient
        .from("players")
        .update({
          rating_snooker: next,
          peak_rating_snooker: peak,
          rated_matches_snooker: played,
        })
        .eq("id", pid);
      if (updateRes.error) throw new Error(updateRes.error.message);

      eventRows.push({
        player_id: pid,
        opponent_player_id: sideA[0] ?? null,
        source_app: sourceApp,
        source_result_id: sourceResultId,
        event_type: actualA === 1 ? "result_loss" : actualA === 0 ? "result_win" : "result_draw",
        rating_before: current,
        rating_after: next,
        rating_delta: next - current,
        notes: notes ?? null,
      });
    }

    if (eventRows.length > 0) {
      const eventsRes = await adminClient.from("rating_events").insert(eventRows);
      if (eventsRes.error) throw new Error(eventsRes.error.message);
    }

    const receiptUpdate = await adminClient
      .from("rating_result_receipts")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        metadata: {
          side_a_ids: sideA,
          side_b_ids: sideB,
          score_a: scoreA,
          score_b: scoreB,
          delta_a: deltaA,
          delta_b: deltaB,
          k_factor: k,
          expected_a: expectedA,
          ...metadata,
        },
      })
      .eq("source_app", sourceApp)
      .eq("source_result_id", sourceResultId);
    if (receiptUpdate.error) throw new Error(receiptUpdate.error.message);

    return {
      ok: true,
      skipped: false as const,
      deltaA,
      deltaB,
      expectedA,
      k,
    };
  } catch (error) {
    await adminClient
      .from("rating_result_receipts")
      .update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown rating error",
      })
      .eq("source_app", sourceApp)
      .eq("source_result_id", sourceResultId);
    throw error;
  }
}

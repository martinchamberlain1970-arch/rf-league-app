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

type LeagueFixtureRatingFrame = {
  slot_no: number;
  slot_type?: "singles" | "doubles" | null;
  winner_side: "home" | "away" | null;
  home_forfeit?: boolean | null;
  away_forfeit?: boolean | null;
  home_player1_id: string | null;
  home_player2_id?: string | null;
  away_player1_id: string | null;
  away_player2_id?: string | null;
};

type LeagueFixtureRatingArgs = {
  adminClient: SupabaseClient;
  fixtureId: string;
  seasonId?: string | null;
  frames: LeagueFixtureRatingFrame[];
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

type RatingEventRow = {
  player_id: string;
  rating_delta: number | null;
};

type RatingReceiptRow = {
  id: string;
  source_result_id: string;
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

  const [existingReceipt, existingEvents] = await Promise.all([
    adminClient
      .from("rating_result_receipts")
      .select("id,status")
      .eq("source_app", sourceApp)
      .eq("source_result_id", sourceResultId)
      .maybeSingle(),
    adminClient
      .from("rating_events")
      .select("id")
      .eq("source_app", sourceApp)
      .eq("source_result_id", sourceResultId)
      .limit(1),
  ]);
  if (existingReceipt.error) throw new Error(existingReceipt.error.message);
  if (existingEvents.error) throw new Error(existingEvents.error.message);
  if (existingReceipt.data?.status === "processed") {
    return { ok: true, skipped: true as const, reason: existingReceipt.data.status };
  }
  if (existingReceipt.data?.id || (existingEvents.data?.length ?? 0) > 0) {
    await revertSnookerRatingSources({
      adminClient,
      sourceApp,
      sourceResultIds: [sourceResultId],
    });
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

export async function revertSnookerRatingSources({
  adminClient,
  sourceApp,
  sourceResultIds,
}: {
  adminClient: SupabaseClient;
  sourceApp: "league" | "club";
  sourceResultIds: string[];
}) {
  const uniqueSourceIds = uniqueIds(sourceResultIds);
  if (uniqueSourceIds.length === 0) return { ok: true as const, reverted: 0 };

  const [eventsRes, receiptsRes] = await Promise.all([
    adminClient
      .from("rating_events")
      .select("player_id,rating_delta")
      .eq("source_app", sourceApp)
      .in("source_result_id", uniqueSourceIds),
    adminClient
      .from("rating_result_receipts")
      .select("id,source_result_id")
      .eq("source_app", sourceApp)
      .in("source_result_id", uniqueSourceIds),
  ]);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (receiptsRes.error) throw new Error(receiptsRes.error.message);

  const events = (eventsRes.data ?? []) as RatingEventRow[];
  const receipts = (receiptsRes.data ?? []) as RatingReceiptRow[];
  if (events.length === 0 && receipts.length === 0) {
    return { ok: true as const, reverted: 0 };
  }

  const deltaByPlayer = new Map<string, { delta: number; matches: number }>();
  for (const event of events) {
    if (!event.player_id) continue;
    const prev = deltaByPlayer.get(event.player_id) ?? { delta: 0, matches: 0 };
    prev.delta += Number(event.rating_delta ?? 0);
    prev.matches += 1;
    deltaByPlayer.set(event.player_id, prev);
  }

  if (deltaByPlayer.size > 0) {
    const playerIds = Array.from(deltaByPlayer.keys());
    const playersRes = await adminClient
      .from("players")
      .select("id,rating_snooker,rated_matches_snooker")
      .in("id", playerIds);
    if (playersRes.error) throw new Error(playersRes.error.message);
    const players = (playersRes.data ?? []) as Array<{ id: string; rating_snooker: number | null; rated_matches_snooker: number | null }>;
    for (const player of players) {
      const delta = deltaByPlayer.get(player.id);
      if (!delta) continue;
      const nextRating = Math.max(100, Number(player.rating_snooker ?? 1000) - delta.delta);
      const nextMatches = Math.max(0, Number(player.rated_matches_snooker ?? 0) - delta.matches);
      const updateRes = await adminClient
        .from("players")
        .update({
          rating_snooker: nextRating,
          rated_matches_snooker: nextMatches,
        })
        .eq("id", player.id);
      if (updateRes.error) throw new Error(updateRes.error.message);
    }
  }

  if (events.length > 0) {
    const deleteEvents = await adminClient
      .from("rating_events")
      .delete()
      .eq("source_app", sourceApp)
      .in("source_result_id", uniqueSourceIds);
    if (deleteEvents.error) throw new Error(deleteEvents.error.message);
  }
  if (receipts.length > 0) {
    const deleteReceipts = await adminClient
      .from("rating_result_receipts")
      .delete()
      .eq("source_app", sourceApp)
      .in("source_result_id", uniqueSourceIds);
    if (deleteReceipts.error) throw new Error(deleteReceipts.error.message);
  }

  return { ok: true as const, reverted: receipts.length };
}

async function rebuildSnookerRatedMatchCounts(adminClient: SupabaseClient, playerIds: string[]) {
  const uniquePlayerIds = uniqueIds(playerIds);
  if (uniquePlayerIds.length === 0) return;

  const [eventsRes, playersRes] = await Promise.all([
    adminClient
      .from("rating_events")
      .select("player_id")
      .eq("source_app", "league")
      .in("player_id", uniquePlayerIds),
    adminClient
      .from("players")
      .select("id")
      .in("id", uniquePlayerIds),
  ]);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (playersRes.error) throw new Error(playersRes.error.message);

  const counts = new Map<string, number>();
  for (const row of (eventsRes.data ?? []) as Array<{ player_id: string | null }>) {
    const playerId = row.player_id ?? "";
    if (!playerId) continue;
    counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
  }

  for (const player of (playersRes.data ?? []) as Array<{ id: string }>) {
    const nextCount = counts.get(player.id) ?? 0;
    const updateRes = await adminClient
      .from("players")
      .update({ rated_matches_snooker: nextCount })
      .eq("id", player.id);
    if (updateRes.error) throw new Error(updateRes.error.message);
  }
}

export async function rebuildLeagueFixtureSnookerRatings({
  adminClient,
  fixtureId,
  seasonId,
  frames,
  notes,
  metadata,
}: LeagueFixtureRatingArgs) {
  const summarySourceId = `league_fixture:${fixtureId}`;
  const touchedPlayerIds = uniqueIds(
    frames.flatMap((frame) => [
      frame.home_player1_id ?? "",
      frame.home_player2_id ?? "",
      frame.away_player1_id ?? "",
      frame.away_player2_id ?? "",
    ])
  );
  const frameSourceIds = frames
    .filter((frame) => Number.isInteger(frame.slot_no))
    .map((frame) => `league_fixture:${fixtureId}:frame:${frame.slot_no}`);

  await revertSnookerRatingSources({
    adminClient,
    sourceApp: "league",
    sourceResultIds: [summarySourceId, ...frameSourceIds],
  });

  const playerDeltaMap = new Map<string, { delta: number; side: "home" | "away" }>();
  const ratedFrames: Array<{
    slot_no: number;
    slot_type: "singles" | "doubles";
    winner_side: "home" | "away";
    delta_home: number;
    delta_away: number;
    expected_home: number;
    k_factor: number;
  }> = [];

  for (const frame of frames) {
    if (!frame.winner_side) continue;
    if (frame.home_forfeit || frame.away_forfeit) continue;

    const homeIds = uniqueIds([
      frame.home_player1_id ?? "",
      frame.slot_type === "doubles" ? frame.home_player2_id ?? "" : "",
    ]);
    const awayIds = uniqueIds([
      frame.away_player1_id ?? "",
      frame.slot_type === "doubles" ? frame.away_player2_id ?? "" : "",
    ]);
    const isDoubles = frame.slot_type === "doubles";
    if (homeIds.length !== (isDoubles ? 2 : 1) || awayIds.length !== (isDoubles ? 2 : 1)) continue;

    const scoreA = frame.winner_side === "home" ? 1 : 0;
    const scoreB = frame.winner_side === "away" ? 1 : 0;
    const result = await applyGroupSnookerRating({
      adminClient,
      sourceApp: "league",
      sourceResultId: `league_fixture:${fixtureId}:frame:${frame.slot_no}`,
      groupAIds: homeIds,
      groupBIds: awayIds,
      scoreA,
      scoreB,
      notes: notes ?? `League fixture ${fixtureId} frame ${frame.slot_no}`,
      metadata: {
        fixture_id: fixtureId,
        season_id: seasonId ?? null,
        rating_mode: "per_frame",
        slot_no: frame.slot_no,
        slot_type: frame.slot_type ?? "singles",
        ...metadata,
      },
    });
    if (result.skipped) continue;

    for (const id of homeIds) {
      const prev = playerDeltaMap.get(id) ?? { delta: 0, side: "home" as const };
      prev.delta += result.deltaA;
      playerDeltaMap.set(id, prev);
    }
    for (const id of awayIds) {
      const prev = playerDeltaMap.get(id) ?? { delta: 0, side: "away" as const };
      prev.delta += result.deltaB;
      playerDeltaMap.set(id, prev);
    }
    ratedFrames.push({
      slot_no: frame.slot_no,
      slot_type: isDoubles ? "doubles" : "singles",
      winner_side: frame.winner_side,
      delta_home: result.deltaA,
      delta_away: result.deltaB,
      expected_home: result.expectedA,
      k_factor: result.k,
    });
  }

  const summaryInsert = await adminClient.from("rating_result_receipts").insert({
    source_app: "league",
    source_result_id: summarySourceId,
    winner_player_id: null,
    loser_player_id: null,
    status: "processed",
    processed_at: new Date().toISOString(),
    metadata: {
      fixture_id: fixtureId,
      season_id: seasonId ?? null,
      rating_mode: "per_frame",
      rated_frame_count: ratedFrames.length,
      player_deltas: Array.from(playerDeltaMap.entries()).map(([player_id, value]) => ({
        player_id,
        delta: value.delta,
        side: value.side,
      })),
      rated_frames: ratedFrames,
      ...metadata,
    },
  });
  if (summaryInsert.error) throw new Error(summaryInsert.error.message);

  await rebuildSnookerRatedMatchCounts(adminClient, touchedPlayerIds);

  return {
    ok: true as const,
    ratedFrameCount: ratedFrames.length,
    playerDeltas: Array.from(playerDeltaMap.entries()).map(([player_id, value]) => ({
      player_id,
      delta: value.delta,
      side: value.side,
    })),
  };
}

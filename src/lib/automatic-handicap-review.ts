import type { SupabaseClient } from "@supabase/supabase-js";

export type AutomaticHandicapReviewResult = {
  applied: boolean;
  reason?: string;
  weekNo?: number;
  reviewed?: number;
  changed?: number;
};

function targetHandicap(rating: number) {
  return Math.round(((1000 - rating) / 5) / 4) * 4;
}

async function realignPreviouslyReviewedWeek(
  adminClient: SupabaseClient,
  fixtureId: string
): Promise<AutomaticHandicapReviewResult> {
  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,week_no,status")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error) throw new Error(fixtureRes.error.message);
  const fixture = fixtureRes.data;
  if (!fixture || fixture.status !== "complete" || !fixture.week_no) {
    return { applied: false, reason: "fixture_not_complete" };
  }

  const seasonRes = await adminClient
    .from("league_seasons")
    .select("id,name,handicap_enabled")
    .eq("id", fixture.season_id)
    .maybeSingle();
  if (seasonRes.error) throw new Error(seasonRes.error.message);
  const season = seasonRes.data;
  const isProposalTwoPremier = Boolean(
    season?.handicap_enabled &&
      /premier league/i.test(season.name ?? "") &&
      (/2026\/2027/.test(season.name ?? "") || /2026-27/.test(season.name ?? ""))
  );
  const reviewDue = fixture.week_no >= 1 && (fixture.week_no <= 4 || fixture.week_no % 4 === 0);
  if (!isProposalTwoPremier || !reviewDue) {
    return { applied: false, reason: "review_not_due" };
  }

  const incompleteRes = await adminClient
    .from("league_fixtures")
    .select("id")
    .eq("season_id", fixture.season_id)
    .eq("week_no", fixture.week_no)
    .neq("status", "complete")
    .limit(1);
  if (incompleteRes.error) throw new Error(incompleteRes.error.message);
  if ((incompleteRes.data ?? []).length > 0) {
    return { applied: false, reason: "week_not_complete" };
  }

  const membersRes = await adminClient
    .from("league_team_members")
    .select("player_id")
    .eq("season_id", fixture.season_id);
  if (membersRes.error) throw new Error(membersRes.error.message);
  const playerIds = Array.from(new Set((membersRes.data ?? []).map((row) => row.player_id).filter(Boolean)));
  if (playerIds.length === 0) return { applied: false, reason: "no_players" };

  const playersRes = await adminClient
    .from("players")
    .select("id,rating_snooker,snooker_handicap")
    .in("id", playerIds)
    .eq("is_archived", false);
  if (playersRes.error) throw new Error(playersRes.error.message);

  const changes = (playersRes.data ?? [])
    .map((player) => {
      const previous = Number(player.snooker_handicap ?? 0);
      const rating = Number(player.rating_snooker ?? 1000);
      return { id: player.id, previous, next: targetHandicap(rating), rating };
    })
    .filter((row) => row.previous !== row.next);

  for (const row of changes) {
    const updateRes = await adminClient
      .from("players")
      .update({ snooker_handicap: row.next })
      .eq("id", row.id);
    if (updateRes.error) throw new Error(updateRes.error.message);
  }

  if (changes.length > 0) {
    const historyRes = await adminClient.from("league_handicap_history").insert(
      changes.map((row) => ({
        player_id: row.id,
        season_id: fixture.season_id,
        fixture_id: fixture.id,
        change_type: "auto_result",
        delta: row.next - row.previous,
        previous_handicap: row.previous,
        new_handicap: row.next,
        reason: `Corrective Proposal 2 alignment after the Week ${fixture.week_no} Elo rebuild (Elo ${Math.round(row.rating)}).`,
      }))
    );
    if (historyRes.error) throw new Error(historyRes.error.message);
  }

  return {
    applied: changes.length > 0,
    reason: changes.length > 0 ? "previous_review_realigned" : "already_applied_aligned",
    weekNo: fixture.week_no,
    reviewed: playerIds.length,
    changed: changes.length,
  };
}

export async function applyDuePremierHandicapReview(
  adminClient: SupabaseClient,
  fixtureId: string,
): Promise<AutomaticHandicapReviewResult> {
  const result = await adminClient.rpc("apply_due_premier_handicap_review", { p_fixture_id: fixtureId });
  if (result.error) {
    if (/schema cache|does not exist|could not find the function/i.test(result.error.message)) {
      return { applied: false, reason: "automation_not_enabled" };
    }
    throw new Error(result.error.message);
  }
  const payload = (result.data ?? { applied: false, reason: "no_result" }) as AutomaticHandicapReviewResult;
  if (!payload.applied && payload.reason === "already_applied") {
    return realignPreviouslyReviewedWeek(adminClient, fixtureId);
  }
  return payload;
}

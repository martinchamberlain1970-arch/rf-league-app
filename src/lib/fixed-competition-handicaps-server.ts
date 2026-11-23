import type { SupabaseClient } from "@supabase/supabase-js";
import { usesFixedCompetitionHandicaps } from "@/lib/fixed-competition-handicaps";
import { calculateSnookerHandicapStarts } from "@/lib/snooker-handicap";

export type HandicapCompetitionMatch = {
  competition_id: string;
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
};

export async function fixedHandicapsForMatch(client: SupabaseClient, match: HandicapCompetitionMatch, competitionName: string) {
  if (!usesFixedCompetitionHandicaps(competitionName)) return null;
  const doubles = competitionName.startsWith("Handicap Doubles");
  const home = doubles ? [match.team1_player1_id, match.team1_player2_id] : [match.player1_id];
  const away = doubles ? [match.team2_player1_id, match.team2_player2_id] : [match.player2_id];
  const ids = [...home, ...away];
  if (!ids.every((id): id is string => Boolean(id))) return { ready: false as const, reason: "The draw must include all players before a start can be shown." };
  const lock = await client.rpc("lock_2026_competition_handicaps", { p_competition_id: match.competition_id });
  if (lock.error) throw lock.error;
  if (!lock.data) return { ready: false as const, reason: "Competition handicaps will be fixed when entries close." };
  const rows = await client.from("competition_fixed_handicaps").select("player_id,handicap").eq("competition_id", match.competition_id).in("player_id", ids);
  if (rows.error) throw rows.error;
  const handicap = new Map(rows.data.map((row) => [row.player_id, row.handicap as number]));
  if (!ids.every((id) => handicap.has(id))) {
    return { ready: false as const, reason: "A player is missing a fixed handicap. Contact the league secretary before playing." };
  }
  const homeHandicap = ids.slice(0, home.length).reduce((sum, id) => sum + handicap.get(id)!, 0) / home.length;
  const awayHandicap = ids.slice(home.length).reduce((sum, id) => sum + handicap.get(id)!, 0) / away.length;
  const starts = calculateSnookerHandicapStarts(homeHandicap, awayHandicap, null);
  return {
    ready: true as const,
    lockedAt: lock.data as string,
    homeHandicap,
    awayHandicap,
    homeStart: starts.team1,
    awayStart: starts.team2,
    players: ids.map((id) => ({ id, handicap: handicap.get(id)! })),
  };
}

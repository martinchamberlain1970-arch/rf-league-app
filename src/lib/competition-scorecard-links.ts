import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const privateScorecardHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export const scorecardMatchFields = "id,competition_id,status,round_no,match_no,best_of,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id";

export type ScorecardParticipants = {
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
};

export const scorecardPlayerIds = (match: ScorecardParticipants) => [
  match.player1_id, match.player2_id,
  match.team1_player1_id, match.team1_player2_id,
  match.team2_player1_id, match.team2_player2_id,
].filter((id): id is string => Boolean(id));

export function hasScorecardOpponents(match: ScorecardParticipants) {
  return Boolean((match.player1_id || (match.team1_player1_id && match.team1_player2_id)) &&
    (match.player2_id || (match.team2_player1_id && match.team2_player2_id)));
}

export function scorecardTokenHash(token: string) {
  return /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

export async function findScorecardLink(client: SupabaseClient, tokenHash: string) {
  const { data, error } = await client.from("competition_scorecard_links")
    .select("match_id").eq("token_hash", tokenHash).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return data?.match_id as string | undefined;
}

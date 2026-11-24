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
  return /^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{16})$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

export async function findScorecardLink(client: SupabaseClient, tokenHash: string) {
  const { data, error } = await client.from("competition_scorecard_links")
    .select("match_id").eq("token_hash", tokenHash).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return data?.match_id as string | undefined;
}

export const scorecardSide = (match: ScorecardParticipants, side: "home" | "away") =>
  side === "home"
    ? [...new Set([match.player1_id, match.team1_player1_id, match.team1_player2_id].filter((id): id is string => Boolean(id)))]
    : [...new Set([match.player2_id, match.team2_player1_id, match.team2_player2_id].filter((id): id is string => Boolean(id)))];

export async function scorecardSides(
  client: SupabaseClient,
  match: ScorecardParticipants & { competition_id: string },
  name: string,
) {
  const home = scorecardSide(match, "home");
  const away = scorecardSide(match, "away");
  if (!/^(Hodge Cup|Albery Cup) /.test(name)) return { home, away };

  const homeLead = match.team1_player1_id ?? match.player1_id;
  const awayLead = match.team2_player1_id ?? match.player2_id;
  const leads = [homeLead, awayLead].filter((id): id is string => Boolean(id));
  if (!leads.length) return { home, away };
  const { data, error } = await client.from("competition_entries").select("player_id,note")
    .eq("competition_id", match.competition_id).eq("status", "approved").in("player_id", leads);
  if (error) throw error;
  for (const entry of data ?? []) {
    let memberIds: unknown;
    try { memberIds = JSON.parse(entry.note ?? "{}")?.teamMemberIds; } catch { continue; }
    if (!Array.isArray(memberIds)) continue;
    const roster = entry.player_id === homeLead ? home : away;
    for (const id of memberIds) {
      if (typeof id === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) && !roster.includes(id)) roster.push(id);
    }
  }
  return { home, away };
}

import { validateCompleteLeagueScorecard, type ScorecardFrameForValidation } from "./league-scorecard-validation";

export type OfficerFrame = ScorecardFrameForValidation & {
  id: string; fixture_id: string;
  home_player1_id: string | null; home_player2_id: string | null;
  away_player1_id: string | null; away_player2_id: string | null;
  home_nominated?: boolean; away_nominated?: boolean;
  home_nominated_name?: string | null; away_nominated_name?: string | null;
};
export type OfficerBreak = { player_id: string | null; entered_player_name: string; break_value: string | number };

export function validateOfficerScorecard(frames: OfficerFrame[], breaks: OfficerBreak[], singles: number, doubles: number) {
  const errors: string[] = [];
  if (frames.length !== singles + doubles) errors.push(`Expected ${singles + doubles} frames.`);
  for (const frame of frames) {
    for (const side of ["home", "away"] as const) {
      const points = frame[`${side}_points_scored`];
      if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > 200) {
        errors.push(`Frame ${frame.slot_no}: enter ${side} points as a whole number from 0 to 200.`);
      }
      if (!frame[`${side}_forfeit`]) {
        if (frame[`${side}_nominated`]) {
          if (typeof frame[`${side}_nominated_name`] !== "string" || !frame[`${side}_nominated_name`]?.trim()) errors.push(`Frame ${frame.slot_no}: select the ${side} nominated player.`);
        } else if (!frame[`${side}_player1_id`]) errors.push(`Frame ${frame.slot_no}: select the ${side} player.`);
        if (frame.slot_type === "doubles" && (!frame[`${side}_player2_id`] || frame[`${side}_player1_id`] === frame[`${side}_player2_id`])) {
          errors.push(`Frame ${frame.slot_no}: select two different ${side} doubles players.`);
        }
      }
    }
    if ((frame.home_forfeit || frame.away_forfeit) && (frame.home_points_scored !== 0 || frame.away_points_scored !== 0)) {
      errors.push(`Frame ${frame.slot_no}: forfeited frames must have zero points for both sides.`);
    }
  }
  const complete = validateCompleteLeagueScorecard(frames, singles, doubles);
  if (!complete.valid) errors.push(complete.error);
  const cleanBreaks = breaks.filter(row => row.player_id || row.entered_player_name.trim() || String(row.break_value).trim());
  for (const [index, row] of cleanBreaks.entries()) {
    const value = Number(row.break_value);
    if (!Number.isInteger(value) || value < 30 || value > 200 || (!row.player_id && !row.entered_player_name.trim())) {
      errors.push(`Break ${index + 1}: select a player and enter a whole-number break of 30–200.`);
      continue;
    }
    if (row.player_id) {
      const scores = frames.flatMap(frame => ["home", "away"].flatMap(side => {
        const s = side as "home" | "away";
        return [frame[`${s}_player1_id`], frame[`${s}_player2_id`]].includes(row.player_id)
          ? [frame[`${s}_points_scored`] ?? 0] : [];
      }));
      if (!scores.length || value > Math.max(...scores)) errors.push(`Break ${index + 1}: the player must appear on the card and the break cannot exceed their frame points.`);
    }
  }
  return { errors, breaks: cleanBreaks.map(row => ({ player_id: row.player_id || null, entered_player_name: row.entered_player_name.trim() || null, break_value: Number(row.break_value) })) };
}

export type IndividualStatisticsFrame = {
  winner_side?: "home" | "away" | null;
  home_forfeit?: boolean | null;
  away_forfeit?: boolean | null;
  home_nominated?: boolean | null;
  away_nominated?: boolean | null;
};

export function countsForIndividualStatistics(frame: IndividualStatisticsFrame, side?: "home" | "away") {
  if (!frame.winner_side || frame.home_forfeit || frame.away_forfeit) return false;
  if (side === "home") return !frame.home_nominated;
  if (side === "away") return !frame.away_nominated;
  return !frame.home_nominated || !frame.away_nominated;
}

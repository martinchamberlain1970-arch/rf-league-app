export type IndividualStatisticsFrame = {
  winner_side?: "home" | "away" | null;
  home_forfeit?: boolean | null;
  away_forfeit?: boolean | null;
  home_nominated?: boolean | null;
  away_nominated?: boolean | null;
};

export function countsForIndividualStatistics(frame: IndividualStatisticsFrame) {
  return Boolean(
    frame.winner_side &&
      !frame.home_forfeit &&
      !frame.away_forfeit &&
      !frame.home_nominated &&
      !frame.away_nominated,
  );
}

export const MAX_SNOOKER_START = 40;

export function calculateSnookerHandicapStarts(playerOneHandicap: number | null | undefined, playerTwoHandicap: number | null | undefined) {
  const h1 = Number(playerOneHandicap ?? 0);
  const h2 = Number(playerTwoHandicap ?? 0);
  const baseline = Math.min(h1, h2);
  const rawTeam1 = h1 - baseline;
  const rawTeam2 = h2 - baseline;

  return {
    team1: Math.min(MAX_SNOOKER_START, rawTeam1),
    team2: Math.min(MAX_SNOOKER_START, rawTeam2),
  };
}

export function calculateAdjustedScoresWithCap(
  homeScore: number,
  awayScore: number,
  homeHandicap: number | null | undefined,
  awayHandicap: number | null | undefined
) {
  const starts = calculateSnookerHandicapStarts(homeHandicap, awayHandicap);
  return {
    homeStart: starts.team1,
    awayStart: starts.team2,
    homeAdjusted: homeScore + starts.team1,
    awayAdjusted: awayScore + starts.team2,
  };
}

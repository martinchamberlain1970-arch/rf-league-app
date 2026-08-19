export const MAX_SNOOKER_START = 40;
export type SnookerHandicapCap = number | null | undefined;

export function calculateSnookerHandicapStarts(
  playerOneHandicap: number | null | undefined,
  playerTwoHandicap: number | null | undefined,
  maxStart: SnookerHandicapCap = MAX_SNOOKER_START
) {
  const h1 = Number(playerOneHandicap ?? 0);
  const h2 = Number(playerTwoHandicap ?? 0);
  const baseline = Math.min(h1, h2);
  const rawTeam1 = h1 - baseline;
  const rawTeam2 = h2 - baseline;

  const cap = maxStart === null ? null : Math.max(0, Number(maxStart ?? MAX_SNOOKER_START));
  return { team1: cap === null ? rawTeam1 : Math.min(cap, rawTeam1), team2: cap === null ? rawTeam2 : Math.min(cap, rawTeam2) };
}

export function calculateAdjustedScoresWithCap(
  homeScore: number,
  awayScore: number,
  homeHandicap: number | null | undefined,
  awayHandicap: number | null | undefined,
  maxStart: SnookerHandicapCap = MAX_SNOOKER_START
) {
  const starts = calculateSnookerHandicapStarts(homeHandicap, awayHandicap, maxStart);
  return {
    homeStart: starts.team1,
    awayStart: starts.team2,
    homeAdjusted: homeScore + starts.team1,
    awayAdjusted: awayScore + starts.team2,
  };
}

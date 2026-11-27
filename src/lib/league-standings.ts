export function rankLeagueStandings<T extends { points: number; won: number }>(
  rows: readonly T[],
  teamName: (row: T) => string
): (T & { rank: number })[] {
  const ranked = [...rows].sort(
    (a, b) => b.points - a.points || b.won - a.won || teamName(a).localeCompare(teamName(b))
  );

  let rank = 0;
  return ranked.map((row, index) => {
    const previous = ranked[index - 1];
    if (!previous || row.points !== previous.points || row.won !== previous.won) {
      rank = index + 1;
    }
    return { ...row, rank };
  });
}

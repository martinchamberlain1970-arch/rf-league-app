type DrawEntry = { id: string; player_id: string; note?: string | null };

export function entryRoster(entry: DrawEntry): string[] {
  try {
    const partners: unknown = JSON.parse(entry.note ?? "{}")?.teamMemberIds;
    return [entry.player_id, ...(Array.isArray(partners) ? partners.filter((id): id is string => typeof id === "string" && id.length > 0) : [])];
  } catch {
    return [entry.player_id];
  }
}

export function knockoutRosterProblems<T extends DrawEntry>(entries: readonly T[], required: number) {
  const rosters = entries.map(entryRoster);
  const players = rosters.flat();
  return {
    incomplete: entries.filter((_, index) => rosters[index].length !== required),
    duplicated: new Set(players).size !== players.length,
  };
}

export function knockoutRoundLabel(round: number, total: number) {
  return ["Final", "Semi-finals", "Quarter-finals", "Last 16", "Last 32"][total - round] ?? `Round ${round}`;
}

export function knockoutSize(entries: number) {
  if (entries < 2) return { rounds: 0, byes: 0, matches: 0 };
  const rounds = Math.ceil(Math.log2(entries));
  const slots = 2 ** rounds;
  return { rounds, byes: slots - entries, matches: entries - slots / 2 };
}

// The league cups require the winner to play a round before the final.
export const isLeagueCup = (name: string) =>
  /^(Albery Cup|Cross Cup|Fred Osbourne|Gary Webb|Hamilton Cup|Handicap Doubles|Henry Fidge|Hodge Cup|Jack Harvey|Lee Ford)(?:\b|$)/i.test(name);

export function knockoutOpeningRound<T>(ordered: readonly T[]) {
  const { rounds, byes, matches } = knockoutSize(ordered.length);
  if (!rounds) return [];
  const paired = Array.from({ length: matches }, (_, index) => ({
    home: ordered[byes + index * 2],
    away: ordered[byes + index * 2 + 1],
  }));
  if (!byes) return paired;
  // Put a played tie by a bye wherever possible, spreading byes in the bracket.
  const ties: Array<{ home: T; away: T | null }> = paired;
  for (let i = byes - 1; i >= 0; i -= 1) {
    ties.splice(Math.floor(i * matches / byes), 0, { home: ordered[i], away: null });
  }
  return ties;
}

export function shuffleDraw<T>(entries: readonly T[], random = Math.random) {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

type RoundSettings = { round1?: number; semi_final?: number; final?: number } | null | undefined;
export function knockoutBestOf(settings: RoundSettings, fallback: number, round: number, total: number) {
  if (round >= total) return settings?.final ?? fallback;
  if (round === total - 1) return settings?.semi_final ?? fallback;
  return settings?.round1 ?? fallback;
}

type MatchSideFields = {
  player1_id?: string | null;
  player2_id?: string | null;
  team1_player1_id?: string | null;
  team1_player2_id?: string | null;
  team2_player1_id?: string | null;
  team2_player2_id?: string | null;
};

export function knockoutMatchSides(match: MatchSideFields) {
  return {
    home: match.team1_player1_id
      ? [match.team1_player1_id, match.team1_player2_id].filter((id): id is string => Boolean(id))
      : match.player1_id ? [match.player1_id] : [],
    away: match.team2_player1_id
      ? [match.team2_player1_id, match.team2_player2_id].filter((id): id is string => Boolean(id))
      : match.player2_id ? [match.player2_id] : [],
  };
}

export function knockoutMatchFields(home: readonly string[], away: readonly string[], teams: boolean) {
  return {
    match_mode: teams ? "doubles" as const : "singles" as const,
    player1_id: teams ? null : home[0],
    player2_id: teams ? null : away[0] ?? null,
    // Three-player events use the lead player's competition entry for the full roster.
    team1_player1_id: teams ? home[0] : null,
    team1_player2_id: teams ? home[1] : null,
    team2_player1_id: teams ? away[0] ?? null : null,
    team2_player2_id: teams ? away[1] ?? null : null,
  };
}

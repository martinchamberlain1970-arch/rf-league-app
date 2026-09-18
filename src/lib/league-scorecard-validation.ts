export type ScorecardFrameForValidation = {
  slot_no: number;
  slot_type?: "singles" | "doubles";
  winner_side?: "home" | "away" | null;
  home_forfeit?: boolean;
  away_forfeit?: boolean;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
};

export function expectedLeagueScorecardFrames(singlesCount: number, doublesCount: number) {
  const singles = Math.max(0, Math.trunc(singlesCount));
  const doubles = Math.max(0, Math.trunc(doublesCount));
  return [
    ...Array.from({ length: singles }, (_, index) => ({ slot_no: index + 1, slot_type: "singles" as const })),
    ...Array.from({ length: doubles }, (_, index) => ({ slot_no: singles + index + 1, slot_type: "doubles" as const })),
  ];
}

function frameLabel(slotNo: number, slotType: "singles" | "doubles") {
  return `Frame ${slotNo} · ${slotType === "doubles" ? "Doubles" : "Singles"}`;
}

export function validateCompleteLeagueScorecard(
  frames: ScorecardFrameForValidation[],
  singlesCount: number,
  doublesCount: number
) {
  const expected = expectedLeagueScorecardFrames(singlesCount, doublesCount);
  const rowsBySlot = new Map<number, ScorecardFrameForValidation[]>();
  for (const row of frames) {
    const rows = rowsBySlot.get(row.slot_no) ?? [];
    rows.push(row);
    rowsBySlot.set(row.slot_no, rows);
  }

  const duplicated = [...rowsBySlot.entries()].filter(([, rows]) => rows.length > 1).map(([slotNo]) => `Frame ${slotNo}`);
  if (duplicated.length > 0) {
    return { valid: false as const, error: `The scorecard contains duplicate frames: ${duplicated.join(", ")}. Refresh it before submitting.` };
  }

  const missing = expected.filter(({ slot_no, slot_type }) => {
    const row = rowsBySlot.get(slot_no)?.[0];
    return !row || row.slot_type !== slot_type;
  });
  if (missing.length > 0) {
    return {
      valid: false as const,
      error: `The scorecard is incomplete. Complete all ${expected.length} frames before submitting. Missing: ${missing.map((row) => frameLabel(row.slot_no, row.slot_type)).join(", ")}.`,
    };
  }

  const incomplete = expected.filter(({ slot_no }) => {
    const row = rowsBySlot.get(slot_no)?.[0];
    return !row?.winner_side && !row?.home_forfeit && !row?.away_forfeit;
  });
  if (incomplete.length > 0) {
    return {
      valid: false as const,
      error: `Not all frames have been played or recorded. Complete ${incomplete.map((row) => frameLabel(row.slot_no, row.slot_type)).join(", ")} before submitting.`,
    };
  }

  const scoreContradictions = expected.filter(({ slot_no }) => {
    const row = rowsBySlot.get(slot_no)?.[0];
    if (!row || row.home_forfeit || row.away_forfeit) return false;
    if (
      typeof row.home_points_scored !== "number" ||
      typeof row.away_points_scored !== "number"
    ) {
      return false;
    }
    if (row.home_points_scored === row.away_points_scored) return true;
    const scoreWinner = row.home_points_scored > row.away_points_scored ? "home" : "away";
    return row.winner_side !== scoreWinner;
  });
  if (scoreContradictions.length > 0) {
    return {
      valid: false as const,
      error: `The selected winner does not match the final scoreboard points for ${scoreContradictions.map((row) => frameLabel(row.slot_no, row.slot_type)).join(", ")}. Enter the final points after any handicap start has been included.`,
    };
  }

  return { valid: true as const, error: null };
}

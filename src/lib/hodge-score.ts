export const isHodgeCup = (name?: string | null) => /^Hodge Cup \(Triples\)( - |$)/.test(name ?? "");

export type HodgeSide = "home" | "away";

export function scoreHodgeCup(
  frames: ReadonlyArray<{ home: number; away: number }>,
  blackWinners: ReadonlyArray<HodgeSide | null> = [],
) {
  if (frames.length < 1 || frames.length > 6 || frames.some(({ home, away }) =>
    !Number.isSafeInteger(home) || !Number.isSafeInteger(away) || home < 0 || away < 0 || home === away
  )) {
    return { error: "Enter both scores for each frame played. Individual frames cannot be tied." } as const;
  }

  let home = frames.filter((frame) => frame.home > frame.away).length;
  let away = frames.length - home;
  for (let index = 0; index < frames.length - 3; index += 1) {
    const first = frames[index];
    const second = frames[index + 3];
    const aggregate = first.home + second.home - first.away - second.away;
    const bonusWinner = aggregate > 0 ? "home" : aggregate < 0 ? "away" : blackWinners[index];
    if (bonusWinner !== "home" && bonusWinner !== "away") {
      return { error: `Frames ${index + 1} and ${index + 4} are level on aggregate. Select who won the respotted black.` } as const;
    }
    if (bonusWinner === "home") home += 1;
    else away += 1;
  }

  if (Math.max(home, away) < 5) return { error: "Enter more frames until one team reaches five points." } as const;

  return { home, away, winnerSide: home > away ? "home" : "away" } as const;
}

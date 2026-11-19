export function matchSubmissionConfirmation(
  home: string,
  away: string,
  frames: Array<{ winner_side: "home" | "away" | null }>,
  breaks: Array<{ slot?: number | null; name: string; value: number }>,
) {
  const homeWins = frames.filter((frame) => frame.winner_side === "home").length;
  const awayWins = frames.filter((frame) => frame.winner_side === "away").length;
  const breakSummary = breaks.length
    ? breaks.map((entry) => `${entry.slot ? `Frame ${entry.slot}: ` : ""}${entry.name} — ${entry.value}`).join("\n")
    : "None recorded";
  return {
    title: "Confirm match result",
    description: `${home} ${homeWins}–${awayWins} ${away}\n\n30+ breaks:\n${breakSummary}\n\nAre the scores and 30+ breaks correct? Submit this result for league-officer approval.`,
    confirmLabel: "Yes, submit",
    cancelLabel: "Go back and check",
  };
}

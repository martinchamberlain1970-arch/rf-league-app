export const fixedHandicapCompetitionNames = [
  "Lee Ford (Singles Handicap) - 2026/2027",
  "Handicap Doubles - 2026/2027",
] as const;

export const usesFixedCompetitionHandicaps = (name?: string | null) =>
  fixedHandicapCompetitionNames.some((competition) => competition === name);

export function competitionDeadlineLabel(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    ...(value.length === 10 ? {} : { timeStyle: "short" }),
    timeZone: "Europe/London",
  }).format(date);
}

export function competitionEntriesOpen(deadline: string | null | undefined, now = new Date()) {
  if (!deadline) return true;
  if (deadline.length === 10) {
    return deadline >= now.toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
  }
  const deadlineMs = Date.parse(deadline);
  return Number.isFinite(deadlineMs) && now.getTime() <= deadlineMs;
}

export type PublicCompetition = { id: string; name: string; match_mode: string; signup_deadline?: string | null };
export type PublicCompetitionEntry = { entryId: string; playerIds: string[]; entrantDateOfBirth: string };
export type PublicCompetitionSelection = { competitionId: string; decision: "pending" | "enter" | "no_entry"; entries: PublicCompetitionEntry[] };

export const entrantsRequired = (competition: Pick<PublicCompetition, "name" | "match_mode">) =>
  /Hodge Cup \(Triples\)|Albery Cup \(Billiards 3-Man Team\)/i.test(competition.name) ? 3 : competition.match_mode === "doubles" ? 2 : 1;

export type CompetitionAgeRule = { minimum: number | null; maximum: number | null };

export const competitionAgeRule = (name: string): CompetitionAgeRule => {
  const lower = name.toLowerCase();
  if (lower.includes("over 60")) return { minimum: 60, maximum: null };
  if (lower.includes("over 50")) return { minimum: 50, maximum: null };
  if (lower.includes("under 25") || lower.includes("henry fidge")) return { minimum: null, maximum: 24 };
  return { minimum: null, maximum: null };
};

export const minimumAge = (name: string) => competitionAgeRule(name).minimum;
export const maximumAge = (name: string) => competitionAgeRule(name).maximum;

export const ageFromDob = (value: string) => {
  const dob = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
};

export function validatePublicSelections(selections: PublicCompetitionSelection[], competitions: PublicCompetition[], playerIds: Set<string>, final: boolean) {
  const byId = new Map(selections.map((selection) => [selection.competitionId, selection]));
  for (const competition of competitions) {
    const selection = byId.get(competition.id);
    if (!selection || selection.decision === "pending") {
      if (final) return `Complete ${competition.name} or choose No entry.`;
      continue;
    }
    if (selection.decision === "no_entry") continue;
    if (!selection.entries.length) return `Add an entry for ${competition.name}.`;
    const used = new Set<string>();
    for (const entry of selection.entries) {
      const selected = entry.playerIds.filter(Boolean);
      const required = entrantsRequired(competition);
      if (selected.length !== required) return `${competition.name} needs ${required} player${required === 1 ? "" : "s"} per entry.`;
      if (new Set(selected).size !== selected.length || selected.some((id) => used.has(id))) return `A player is repeated in ${competition.name}.`;
      if (selected.some((id) => !playerIds.has(id))) return `${competition.name} contains a player outside the selected team.`;
      selected.forEach((id) => used.add(id));
      const { minimum: min, maximum: max } = competitionAgeRule(competition.name);
      if (min !== null || max !== null) {
        const age = ageFromDob(entry.entrantDateOfBirth);
        if (age === null) return `Enter a valid date of birth for ${competition.name}.`;
        if (min !== null && age < min) return `An entrant in ${competition.name} is under the minimum age of ${min}.`;
        if (max !== null && age > max) return `An entrant in ${competition.name} must be under 25.`;
      }
    }
  }
  return null;
}

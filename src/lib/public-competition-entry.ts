export type PublicCompetition = { id: string; name: string; match_mode: string; signup_deadline?: string | null };
export type PublicCompetitionPlayer = {
  id: string;
  name: string;
  ageEligibility: Record<string, "eligible" | "ineligible">;
};

export type PublicCompetitionPartner = { id: string; name: string; teamNames: string[] };

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dob = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== value) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
};

export const meetsCompetitionAgeRule = (age: number, { minimum, maximum }: CompetitionAgeRule) =>
  (minimum === null || age >= minimum) && (maximum === null || age <= maximum);

export function validatePublicSelections(
  selections: PublicCompetitionSelection[],
  competitions: PublicCompetition[],
  teamPlayerIds: ReadonlySet<string>,
  clubPlayerIds: ReadonlySet<string>,
  final: boolean,
  registeredDobs: ReadonlyMap<string, string>,
) {
  const byId = new Map(selections.map((selection) => [selection.competitionId, selection]));
  if (byId.size !== selections.length) return "Each competition must appear only once on the form.";
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
      const selected = entry.playerIds;
      const required = entrantsRequired(competition);
      if (selected.length !== required || selected.some((id) => !id)) return `${competition.name} needs ${required} player${required === 1 ? "" : "s"} per entry.`;
      if (new Set(selected).size !== selected.length || selected.some((id) => used.has(id))) return `A player is repeated in ${competition.name}.`;
      if (!teamPlayerIds.has(selected[0])) return `Choose the first player in ${competition.name} from the selected team.`;
      if (selected.slice(1).some((id) => !clubPlayerIds.has(id))) return `Choose partners in ${competition.name} from the same club.`;
      selected.forEach((id) => used.add(id));
      const { minimum: min, maximum: max } = competitionAgeRule(competition.name);
      if (min !== null || max !== null) {
        const age = ageFromDob(registeredDobs.get(selected[0]) ?? entry.entrantDateOfBirth);
        if (age === null) return `Enter a valid date of birth for ${competition.name}.`;
        if (min !== null && age < min) return `An entrant in ${competition.name} is under the minimum age of ${min}.`;
        if (max !== null && age > max) return `An entrant in ${competition.name} must be under 25.`;
      }
    }
  }
  return null;
}

export type PublicCompetitionReceipt = {
  teamName: string;
  submittedAt: string | null;
  competitions: Array<{
    name: string;
    groups: string[][];
  }>;
};

export function competitionEntryReceipt(
  teamName: string,
  submittedAt: string | null,
  selections: PublicCompetitionSelection[],
  competitionNames: ReadonlyMap<string, string>,
  playerNames: ReadonlyMap<string, string>,
): PublicCompetitionReceipt {
  return {
    teamName,
    submittedAt,
    competitions: selections
      .filter(({ decision }) => decision === "enter" || decision === "no_entry")
      .map(({ competitionId, decision, entries }) => ({
        name: competitionNames.get(competitionId) ?? "Competition details unavailable",
        groups: decision === "enter"
          ? entries.map(({ playerIds }) => playerIds.map((id) => playerNames.get(id) ?? "Player name unavailable"))
          : [],
      })),
  };
}

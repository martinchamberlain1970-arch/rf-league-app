export type LeagueEntryPackPlayer = {
  rowId: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isJunior: boolean;
  juniorAgeBand: "" | "under_13" | "13_15" | "16_17";
  guardianName: string;
  guardianPhone: string;
  competitionIds: string[];
};

export type LeagueEntryPackPayload = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  players: LeagueEntryPackPlayer[];
  competitionNotes: string;
  generalNotes: string;
  phoneSharingConfirmed: boolean;
  accuracyConfirmed: boolean;
};

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export function normalizePhone(value: unknown) {
  return clean(value, 40).replace(/[^0-9+()\-\s]/g, "");
}

export function normalizeEntryPackPayload(value: unknown): LeagueEntryPackPayload {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawPlayers = Array.isArray(body.players) ? body.players.slice(0, 60) : [];
  const players = rawPlayers.map((raw, index) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const juniorAgeBand: LeagueEntryPackPlayer["juniorAgeBand"] =
      row.juniorAgeBand === "under_13" || row.juniorAgeBand === "13_15" || row.juniorAgeBand === "16_17" ? row.juniorAgeBand : "";
    return {
      rowId: clean(row.rowId, 80) || `row-${index + 1}`,
      fullName: clean(row.fullName, 140),
      phoneNumber: normalizePhone(row.phoneNumber),
      email: clean(row.email, 254).toLowerCase(),
      isCaptain: Boolean(row.isCaptain),
      isViceCaptain: Boolean(row.isViceCaptain),
      isJunior: Boolean(row.isJunior),
      juniorAgeBand,
      guardianName: clean(row.guardianName, 140),
      guardianPhone: normalizePhone(row.guardianPhone),
      competitionIds: Array.isArray(row.competitionIds)
        ? Array.from(new Set(row.competitionIds.map((id) => clean(id, 80)).filter(Boolean))).slice(0, 30)
        : [],
    };
  });
  return {
    contactName: clean(body.contactName, 140),
    contactEmail: clean(body.contactEmail, 254).toLowerCase(),
    contactPhone: normalizePhone(body.contactPhone),
    players,
    competitionNotes: clean(body.competitionNotes, 4000),
    generalNotes: clean(body.generalNotes, 4000),
    phoneSharingConfirmed: Boolean(body.phoneSharingConfirmed),
    accuracyConfirmed: Boolean(body.accuracyConfirmed),
  };
}

export function validateEntryPackPayload(payload: LeagueEntryPackPayload, forSubmission: boolean) {
  if (!forSubmission) {
    const draftNames = new Set<string>();
    for (const player of payload.players) {
      const nameKey = player.fullName.toLowerCase();
      if (nameKey && draftNames.has(nameKey)) return `${player.fullName} appears more than once in the roster.`;
      if (nameKey) draftNames.add(nameKey);
    }
    return null;
  }
  if (payload.players.length === 0) return "Add at least one player to the team roster.";

  const names = new Set<string>();
  let captainCount = 0;
  let viceCount = 0;
  for (const [index, player] of payload.players.entries()) {
    if (!player.fullName || (!player.isJunior && player.fullName.split(/\s+/).filter(Boolean).length < 2)) {
      return player.isJunior ? `Junior player ${index + 1} needs a first name or recognised playing name.` : `Player ${index + 1} needs a full first and second name.`;
    }
    const nameKey = player.fullName.toLowerCase();
    if (names.has(nameKey)) return `${player.fullName} appears more than once in the roster.`;
    names.add(nameKey);
    if (player.isCaptain) captainCount += 1;
    if (player.isViceCaptain) viceCount += 1;
    if (player.isCaptain && player.isViceCaptain) return `${player.fullName} cannot be both captain and vice-captain.`;
    if (player.isJunior && !player.guardianName) return `Enter a parent or guardian name for junior player ${player.fullName}.`;
    if (player.isJunior && !player.juniorAgeBand) return `Select an age band for junior player ${player.fullName}.`;
  }
  if (captainCount !== 1) return "Select exactly one team captain.";
  if (viceCount !== 1) return "Select exactly one team vice-captain.";
  if (!payload.accuracyConfirmed) return "Confirm that the league roster and captain roles are accurate.";
  return null;
}

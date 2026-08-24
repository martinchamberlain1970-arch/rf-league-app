export type InvoiceSeason = { id: string; name: string; is_active?: boolean | null; is_published?: boolean | null };
export type InvoiceTeam = { id: string; season_id: string; location_id: string | null; name: string; is_active?: boolean | null };
export type InvoiceLocation = { id: string; name: string };
export type InvoicePlayer = { id: string; display_name: string; full_name: string | null; location_id: string | null };
export type InvoiceMember = { team_id: string; player_id: string; is_captain: boolean; is_vice_captain?: boolean | null };
export type InvoiceCompetition = { id: string; name: string; signup_open: boolean; signup_deadline?: string | null; is_archived?: boolean | null; is_completed?: boolean | null };
export type InvoiceCompetitionEntry = { id: string; competition_id: string; player_id: string | null; status: "pending" | "approved" | "rejected" | "withdrawn"; note?: string | null };

export type LeagueInvoiceItem = {
  kind: "league_team" | "individual_competition" | "mick_white_team";
  description: string;
  detail: string;
  quantity: number;
  unitPence: number;
  totalPence: number;
  sourceIds: string[];
};

export type LeagueInvoicePreview = {
  locationId: string;
  clubName: string;
  recipientNames: string[];
  teamNames: string[];
  items: LeagueInvoiceItem[];
  totalPence: number;
};

export type LeagueInvoiceSummaryEntry = {
  entryId: string;
  competitionName: string;
  entrantNames: string[];
  status: "pending" | "approved";
  amountPence: number;
};

export type LeagueInvoiceClubSummary = {
  locationId: string;
  clubName: string;
  teamNames: string[];
  competitionEntries: LeagueInvoiceSummaryEntry[];
  approvedCompetitionEntries: number;
  pendingCompetitionEntries: number;
  approvedChargesPence: number;
};

export type LeagueInvoicePreviewResult = {
  invoices: LeagueInvoicePreview[];
  clubSummary: LeagueInvoiceClubSummary[];
  warnings: string[];
  blockers: string[];
  totals: { clubs: number; teams: number; competitionEntries: number; amountPence: number };
};

type BuildInvoicePreviewInput = {
  selectedSeasonIds: string[];
  selectedCompetitionIds: string[];
  teamFeePence: number;
  individualFeePence: number;
  mickWhiteTeamFeePence: number;
  seasons: InvoiceSeason[];
  teams: InvoiceTeam[];
  locations: InvoiceLocation[];
  players: InvoicePlayer[];
  members: InvoiceMember[];
  competitions: InvoiceCompetition[];
  entries: InvoiceCompetitionEntry[];
};

type EntryNote = {
  teamId?: string;
  locationId?: string;
  teamMemberIds?: string[];
  teamMemberNames?: string[];
};

const playerName = (player: InvoicePlayer | undefined) => player?.full_name?.trim() || player?.display_name || "Unknown player";
const isMickWhite = (name: string) => /\bmick\s+white\b/i.test(name);

function parseEntryNote(note: string | null | undefined): EntryNote {
  if (!note) return {};
  try {
    const value = JSON.parse(note) as EntryNote;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function buildLeagueInvoicePreview(input: BuildInvoicePreviewInput): LeagueInvoicePreviewResult {
  const selectedSeasonIds = new Set(input.selectedSeasonIds);
  const selectedCompetitionIds = new Set(input.selectedCompetitionIds);
  const locationById = new Map(input.locations.map((location) => [location.id, location]));
  const teamById = new Map(input.teams.map((team) => [team.id, team]));
  const playerById = new Map(input.players.map((player) => [player.id, player]));
  const competitionById = new Map(input.competitions.map((competition) => [competition.id, competition]));
  const invoiceByLocation = new Map<string, LeagueInvoicePreview>();
  const summaryByLocation = new Map<string, LeagueInvoiceClubSummary>();
  const warnings: string[] = [];
  const blockers: string[] = [];

  const getInvoice = (locationId: string) => {
    const existing = invoiceByLocation.get(locationId);
    if (existing) return existing;
    const created: LeagueInvoicePreview = {
      locationId,
      clubName: locationById.get(locationId)?.name ?? "Unknown club",
      recipientNames: [],
      teamNames: [],
      items: [],
      totalPence: 0,
    };
    invoiceByLocation.set(locationId, created);
    return created;
  };

  const getClubSummary = (locationId: string) => {
    const existing = summaryByLocation.get(locationId);
    if (existing) return existing;
    const created: LeagueInvoiceClubSummary = {
      locationId,
      clubName: locationById.get(locationId)?.name ?? "Unknown club",
      teamNames: [],
      competitionEntries: [],
      approvedCompetitionEntries: 0,
      pendingCompetitionEntries: 0,
      approvedChargesPence: 0,
    };
    summaryByLocation.set(locationId, created);
    return created;
  };

  const selectedTeams = input.teams
    .filter((team) => selectedSeasonIds.has(team.season_id) && team.is_active !== false)
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const team of selectedTeams) {
    if (!team.location_id) {
      blockers.push(`${team.name} has no club assigned, so its £${(input.teamFeePence / 100).toFixed(2)} team fee cannot be invoiced.`);
      continue;
    }
    const invoice = getInvoice(team.location_id);
    invoice.teamNames.push(team.name);
    getClubSummary(team.location_id).teamNames.push(team.name);
  }

  const captainNamesByLocation = new Map<string, Set<string>>();
  for (const member of input.members) {
    if (!member.is_captain && !member.is_vice_captain) continue;
    const team = teamById.get(member.team_id);
    if (!team?.location_id || !selectedSeasonIds.has(team.season_id)) continue;
    const label = playerName(playerById.get(member.player_id));
    if (label === "Unknown player") continue;
    const names = captainNamesByLocation.get(team.location_id) ?? new Set<string>();
    names.add(label);
    captainNamesByLocation.set(team.location_id, names);
  }

  for (const invoice of invoiceByLocation.values()) {
    invoice.teamNames.sort((left, right) => left.localeCompare(right));
    invoice.recipientNames = Array.from(captainNamesByLocation.get(invoice.locationId) ?? []).sort((left, right) => left.localeCompare(right));
    if (invoice.teamNames.length > 0) {
      invoice.items.push({
        kind: "league_team",
        description: "Winter league team entry",
        detail: invoice.teamNames.join(", "),
        quantity: invoice.teamNames.length,
        unitPence: input.teamFeePence,
        totalPence: invoice.teamNames.length * input.teamFeePence,
        sourceIds: selectedTeams.filter((team) => team.location_id === invoice.locationId).map((team) => team.id),
      });
    }
  }

  const selectedCompetitions = input.competitions.filter((competition) => selectedCompetitionIds.has(competition.id));
  const openCompetitionNames = selectedCompetitions.filter((competition) => competition.signup_open).map((competition) => competition.name);
  if (openCompetitionNames.length) blockers.push(`Close entries before generating invoices: ${openCompetitionNames.join(", ")}.`);

  const selectedEntries = input.entries.filter((entry) => selectedCompetitionIds.has(entry.competition_id));
  const pendingEntries = selectedEntries.filter((entry) => entry.status === "pending");
  if (pendingEntries.length) blockers.push(`${pendingEntries.length} selected competition entr${pendingEntries.length === 1 ? "y is" : "ies are"} still awaiting approval.`);
  const approvedEntries = selectedEntries.filter((entry) => entry.status === "approved");

  for (const entry of selectedEntries.filter((candidate) => candidate.status === "approved" || candidate.status === "pending")) {
    const competition = competitionById.get(entry.competition_id);
    if (!competition) continue;
    const note = parseEntryNote(entry.note);
    const primaryPlayer = entry.player_id ? playerById.get(entry.player_id) : undefined;
    const locationId = (note.teamId ? teamById.get(note.teamId)?.location_id : null) || note.locationId || primaryPlayer?.location_id || null;
    if (!locationId || !locationById.has(locationId)) {
      blockers.push(`${competition.name} entry ${entry.id} cannot be linked to a club.`);
      continue;
    }
    const invoice = getInvoice(locationId);
    if (!invoice.recipientNames.length) invoice.recipientNames = Array.from(captainNamesByLocation.get(locationId) ?? []).sort((left, right) => left.localeCompare(right));
    const teammateNamesFromIds = (note.teamMemberIds ?? []).map((id) => playerName(playerById.get(id))).filter((name) => name !== "Unknown player");
    const teammates = teammateNamesFromIds.length ? teammateNamesFromIds : (note.teamMemberNames ?? []).filter(Boolean);
    const entrantNames = Array.from(new Set([playerName(primaryPlayer), ...teammates].filter((name) => name !== "Unknown player")));
    if (!entrantNames.length) warnings.push(`${competition.name} entry ${entry.id} has no entrant names in its saved record.`);
    const amountPence = isMickWhite(competition.name)
      ? input.mickWhiteTeamFeePence
      : Math.max(1, entrantNames.length) * input.individualFeePence;
    const clubSummary = getClubSummary(locationId);
    clubSummary.competitionEntries.push({
      entryId: entry.id,
      competitionName: competition.name,
      entrantNames,
      status: entry.status === "approved" ? "approved" : "pending",
      amountPence,
    });
    if (entry.status === "pending") {
      clubSummary.pendingCompetitionEntries += 1;
      continue;
    }
    clubSummary.approvedCompetitionEntries += 1;
    clubSummary.approvedChargesPence += amountPence;
    if (isMickWhite(competition.name)) {
      invoice.items.push({
        kind: "mick_white_team",
        description: competition.name,
        detail: entrantNames.join(", ") || "Team entry",
        quantity: 1,
        unitPence: input.mickWhiteTeamFeePence,
        totalPence: input.mickWhiteTeamFeePence,
        sourceIds: [entry.id],
      });
    } else {
      const quantity = Math.max(1, entrantNames.length);
      invoice.items.push({
        kind: "individual_competition",
        description: competition.name,
        detail: entrantNames.join(", ") || "Individual entry",
        quantity,
        unitPence: input.individualFeePence,
        totalPence: quantity * input.individualFeePence,
        sourceIds: [entry.id],
      });
    }
  }

  const invoices = Array.from(invoiceByLocation.values())
    .map((invoice) => ({ ...invoice, totalPence: invoice.items.reduce((sum, item) => sum + item.totalPence, 0) }))
    .filter((invoice) => invoice.totalPence > 0)
    .sort((left, right) => left.clubName.localeCompare(right.clubName));
  const clubSummary = Array.from(summaryByLocation.values())
    .map((summary) => ({
      ...summary,
      teamNames: Array.from(new Set(summary.teamNames)).sort((left, right) => left.localeCompare(right)),
      competitionEntries: [...summary.competitionEntries].sort(
        (left, right) => left.competitionName.localeCompare(right.competitionName) || left.entrantNames.join(" ").localeCompare(right.entrantNames.join(" "))
      ),
      approvedChargesPence: summary.approvedChargesPence + summary.teamNames.length * input.teamFeePence,
    }))
    .sort((left, right) => left.clubName.localeCompare(right.clubName));
  if (!invoices.length) blockers.push("No billable league teams or approved competition entries were found for the selected records.");
  return {
    invoices,
    clubSummary,
    warnings: Array.from(new Set(warnings)),
    blockers: Array.from(new Set(blockers)),
    totals: {
      clubs: invoices.length,
      teams: selectedTeams.length,
      competitionEntries: approvedEntries.length,
      amountPence: invoices.reduce((sum, invoice) => sum + invoice.totalPence, 0),
    },
  };
}

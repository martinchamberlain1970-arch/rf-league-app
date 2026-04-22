"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import useAdminStatus from "@/components/useAdminStatus";
import MessageModal from "@/components/MessageModal";
import InfoModal from "@/components/InfoModal";
import ConfirmModal from "@/components/ConfirmModal";
import { supabase } from "@/lib/supabase";
import { calculateAdjustedScoresWithCap, MAX_SNOOKER_START } from "@/lib/snooker-handicap";

type Location = {
  id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};
type Player = {
  id: string;
  display_name: string;
  full_name: string | null;
  location_id?: string | null;
  rating_snooker?: number | null;
  snooker_handicap?: number | null;
  snooker_handicap_base?: number | null;
};
type Season = {
  id: string;
  name: string;
  location_id: string;
  is_active: boolean;
  is_published?: boolean | null;
  published_at?: string | null;
  created_at: string;
  handicap_enabled?: boolean | null;
  singles_count?: number | null;
  doubles_count?: number | null;
};
type Team = { id: string; season_id: string; location_id: string; name: string; is_active: boolean };
type TeamMember = { id: string; season_id: string; team_id: string; player_id: string; is_captain: boolean; is_vice_captain: boolean };
type RegisteredTeam = { id: string; name: string; location_id: string | null };
type RegisteredTeamMember = { id: string; team_id: string; player_id: string; is_captain: boolean; is_vice_captain: boolean };
type Fixture = {
  id: string;
  season_id: string;
  location_id: string;
  week_no: number | null;
  fixture_date: string | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
  home_points: number;
  away_points: number;
};
type FixtureChangeRequest = {
  id: string;
  fixture_id: string;
  request_type: "play_early" | "play_late";
  original_fixture_date: string | null;
  agreed_fixture_date?: string | null;
  status: "pending" | "approved_outstanding" | "rescheduled" | "rejected";
  created_at: string;
};
type FrameSlot = {
  id: string;
  fixture_id: string;
  slot_no: number;
  slot_type: "singles" | "doubles";
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_nominated: boolean;
  away_nominated: boolean;
  home_forfeit: boolean;
  away_forfeit: boolean;
  winner_side: "home" | "away" | null;
  home_nominated_name?: string | null;
  away_nominated_name?: string | null;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
};
type LeagueBreak = {
  id?: string;
  fixture_id?: string;
  player_id: string | null;
  entered_player_name: string;
  break_value: string;
};
type TableRow = {
  team_id: string;
  team_name: string;
  played: number;
  points: number;
  frames_for: number;
  frames_against: number;
  frame_diff: number;
};
type PlayerTableRow = {
  player_id: string;
  player_name: string;
  team_name: string;
  appearances: number;
  played: number;
  won: number;
  lost: number;
  win_pct: number;
};
type SubmissionBreakEntry = {
  player_id: string | null;
  entered_player_name: string | null;
  break_value: number;
};
type SubmissionFrameResult = {
  slot_no: number;
  slot_type?: "singles" | "doubles";
  winner_side: "home" | "away" | null;
  home_player1_id?: string | null;
  home_player2_id?: string | null;
  away_player1_id?: string | null;
  away_player2_id?: string | null;
  home_nominated?: boolean;
  away_nominated?: boolean;
  home_forfeit?: boolean;
  away_forfeit?: boolean;
  home_nominated_name?: string | null;
  away_nominated_name?: string | null;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
  break_entries?: SubmissionBreakEntry[];
};
type LeagueSubmission = {
  id: string;
  fixture_id: string;
  season_id: string;
  location_id: string;
  submitted_by_user_id: string;
  submitter_team_id: string | null;
  frame_results: SubmissionFrameResult[];
  scorecard_photo_url: string | null;
  status: "pending" | "approved" | "rejected" | "needs_correction";
  rejection_reason: string | null;
  created_at: string;
};
type HandicapHistoryEntry = {
  id: string;
  player_id: string;
  season_id: string | null;
  fixture_id: string | null;
  change_type: "auto_result" | "manual_adjustment" | "manual_override" | "baseline_override";
  delta: number;
  previous_handicap: number;
  new_handicap: number;
  reason: string | null;
  changed_by_user_id: string | null;
  created_at: string;
};
type LeagueCompetition = {
  id: string;
  name: string;
  sport_type: "snooker" | "billiards";
  competition_format: "knockout" | "league";
  match_mode: "singles" | "doubles";
  best_of: number;
  knockout_round_best_of?: {
    round1?: number;
    semi_final?: number;
    final?: number;
  } | null;
  signup_open: boolean;
  signup_deadline: string | null;
  final_scheduled_at: string | null;
  final_venue_location_id: string | null;
  max_entries: number | null;
  is_archived: boolean;
  is_completed: boolean;
  created_at: string;
};
type LeagueCompetitionEntry = {
  id: string;
  competition_id: string;
  requester_user_id: string;
  player_id: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  created_at: string;
};
type CompetitionRoundDeadline = {
  id: string;
  competition_id: string;
  round_no: number;
  deadline_at: string;
  created_at: string;
};

const named = (p?: Player | null) => (p ? (p.full_name?.trim() ? p.full_name : p.display_name) : "Unknown");
const sortLabelByFirstName = (a: string, b: string) => {
  const aParts = a.trim().split(/\s+/);
  const bParts = b.trim().split(/\s+/);
  const firstCompare = (aParts[0] ?? "").localeCompare(bParts[0] ?? "");
  if (firstCompare !== 0) return firstCompare;
  return a.localeCompare(b);
};
const statusLabel = (s: Fixture["status"]) =>
  s === "in_progress" ? "in progress" : s === "pending" ? "scheduled" : "complete";
const LEAGUE_BODY_NAME = "Gravesend & District Indoor Games League";
const LEAGUE_TEMPLATES = {
  winter: { label: "Winter League", singlesCount: 4, doublesCount: 1 },
  summer: { label: "Summer League", singlesCount: 6, doublesCount: 0 },
} as const;
const LEAGUE_KNOCKOUT_TEMPLATES = [
  { key: "gary_webb", name: "Gary Webb (Singles Scratch)", match_mode: "singles", best_of: 3 },
  { key: "lee_ford", name: "Lee Ford (Singles Handicap)", match_mode: "singles", best_of: 3 },
  { key: "cross_cup", name: "Cross Cup (Doubles Scratch)", match_mode: "doubles", best_of: 3 },
  { key: "handicap_doubles", name: "Handicap Doubles", match_mode: "doubles", best_of: 3 },
  { key: "jack_harvey", name: "Jack Harvey (Over 50s)", match_mode: "singles", best_of: 3 },
  { key: "fred_osbourne", name: "Fred Osbourne (Over 60s)", match_mode: "singles", best_of: 3 },
  { key: "hamilton_cup", name: "Hamilton Cup (Singles Billiards)", match_mode: "singles", best_of: 1 },
  { key: "albery_cup", name: "Albery Cup (Billiards 3-Man Team)", match_mode: "doubles", best_of: 1 },
  { key: "hodge_cup", name: "Hodge Cup (Triples)", match_mode: "doubles", best_of: 9 },
] as const;
const LEAGUE_KNOCKOUT_NAMES = LEAGUE_KNOCKOUT_TEMPLATES.map((t) => t.name);
const isLeagueKnockoutName = (name: string) =>
  LEAGUE_KNOCKOUT_NAMES.some((base) => name === base || name.startsWith(`${base} - `));
const isHodgeCompetitionName = (name: string) =>
  name === "Hodge Cup (Triples)" || name.startsWith("Hodge Cup (Triples) - ");
const isHamiltonCompetitionName = (name: string) =>
  name === "Hamilton Cup (Singles Billiards)" ||
  name.startsWith("Hamilton Cup (Singles Billiards) - ") ||
  name === "Hamilton Cup (Billiards Singles)" ||
  name.startsWith("Hamilton Cup (Billiards Singles) - ");
const isAlberyCompetitionName = (name: string) =>
  name === "Albery Cup (Billiards 3-Man Team)" || name.startsWith("Albery Cup (Billiards 3-Man Team) - ");
type LeagueTemplateKey = keyof typeof LEAGUE_TEMPLATES;
const seasonDisplayLabel = (season: Pick<Season, "name" | "handicap_enabled">) =>
  `${season.name}${season.handicap_enabled ? " (Handicap)" : " (Non-handicap)"}`;
const extractSeasonYearLabel = (name: string) => {
  const m = name.match(/(20\d{2}(?:\/20\d{2})?)/);
  return m ? m[1] : name.trim();
};
const toLocalDateTimeInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const localDateTimeInputToIso = (value: string) => {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};
const seasonRange = (startYear: number) => `${startYear}/${startYear + 1}`;
const endOfMonthIso = (date: Date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 0));
  return d.toISOString();
};
const deriveRoundDeadlinesFromFirst = (firstRoundIso: string) => {
  const start = new Date(firstRoundIso);
  if (Number.isNaN(start.getTime())) return [] as Array<{ round_no: number; deadline_at: string }>;
  const r1 = start.toISOString();
  const month2 = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const month3 = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 1));
  return [
    { round_no: 1, deadline_at: r1 },
    { round_no: 2, deadline_at: endOfMonthIso(month2) },
    { round_no: 3, deadline_at: endOfMonthIso(month3) },
  ];
};
const roundDeadlineStatus = (deadlineIso: string) => {
  const ms = Date.parse(deadlineIso) - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  if (Number.isNaN(days)) return { label: "Unknown", className: "border-slate-200 bg-slate-50 text-slate-700" };
  if (days < 0) return { label: "Overdue", className: "border-rose-200 bg-rose-50 text-rose-800" };
  if (days <= 7) return { label: "Due <=7d", className: "border-amber-200 bg-amber-50 text-amber-800" };
  if (days <= 14) return { label: "Due <=14d", className: "border-indigo-200 bg-indigo-50 text-indigo-800" };
  return { label: "On track", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
};
const NON_VENUE_LOCATION_NAMES = new Set(["gravesend snooker league"]);
const locationLabel = (name: string) => {
  if (name.trim().toLowerCase() === "traders & northfleey association") {
    return "Northfleet & District Traders Association";
  }
  return name;
};
const isFixtureDueNow = (fixtureDate: string | null) => {
  if (!fixtureDate) return true;
  const today = new Date();
  const fixtureLocal = new Date(`${fixtureDate}T12:00:00`);
  return fixtureLocal <= new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
};
const formatFixtureDateLong = (fixtureDate: string | null) =>
  fixtureDate
    ? new Date(`${fixtureDate}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
const describeFixtureReschedule = (request?: FixtureChangeRequest | null) => {
  if (!request || request.status !== "rescheduled" || !request.original_fixture_date || !request.agreed_fixture_date) return null;
  const movedEarlier = request.agreed_fixture_date < request.original_fixture_date;
  return {
    chip: movedEarlier ? "Brought forward" : "Rescheduled",
    detail: `Originally ${formatFixtureDateLong(request.original_fixture_date)} · now ${formatFixtureDateLong(request.agreed_fixture_date)}`,
  };
};

export default function LeaguePage() {
  const admin = useAdminStatus();
  const [guidedTarget, setGuidedTarget] = useState<null | "create-league" | "add-league-teams" | "assign-players" | "generate-fixtures" | "publish-league">(null);
  const [highlightedGuidedTarget, setHighlightedGuidedTarget] = useState<null | "create-league" | "add-league-teams" | "assign-players" | "generate-fixtures" | "publish-league">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; description: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [registeredTeams, setRegisteredTeams] = useState<RegisteredTeam[]>([]);
  const [registeredMembers, setRegisteredMembers] = useState<RegisteredTeamMember[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [slots, setSlots] = useState<FrameSlot[]>([]);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [submissions, setSubmissions] = useState<LeagueSubmission[]>([]);
  const [fixtureChangeRequests, setFixtureChangeRequests] = useState<FixtureChangeRequest[]>([]);
  const [leagueCompetitions, setLeagueCompetitions] = useState<LeagueCompetition[]>([]);
  const [leagueCompetitionEntries, setLeagueCompetitionEntries] = useState<LeagueCompetitionEntry[]>([]);
  const [competitionRoundDeadlines, setCompetitionRoundDeadlines] = useState<CompetitionRoundDeadline[]>([]);
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistoryEntry[]>([]);

  const [adminLocationId, setAdminLocationId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserPlayerId, setCurrentUserPlayerId] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState("");

  const [seasonName, setSeasonName] = useState("");
  const [seasonTemplate, setSeasonTemplate] = useState<LeagueTemplateKey>("winter");
  const [seasonHandicapEnabled, setSeasonHandicapEnabled] = useState(false);
  const [knockoutTemplateKey, setKnockoutTemplateKey] = useState<"" | (typeof LEAGUE_KNOCKOUT_TEMPLATES)[number]["key"]>("");
  const [knockoutSeasonLabel, setKnockoutSeasonLabel] = useState("");
  const [knockoutRound1Deadline, setKnockoutRound1Deadline] = useState("");
  const [knockoutDeadlineDraftByCompetitionId, setKnockoutDeadlineDraftByCompetitionId] = useState<Record<string, string>>({});
  const [knockoutFinalDateDraftByCompetitionId, setKnockoutFinalDateDraftByCompetitionId] = useState<Record<string, string>>({});
  const [knockoutFinalVenueDraftByCompetitionId, setKnockoutFinalVenueDraftByCompetitionId] = useState<Record<string, string>>({});
  const [knockoutBestOfDraftByCompetitionId, setKnockoutBestOfDraftByCompetitionId] = useState<Record<string, string>>({});
  const [knockoutRoundBestOfDraftByCompetitionId, setKnockoutRoundBestOfDraftByCompetitionId] = useState<
    Record<string, { round1: string; semi_final: string; final: string }>
  >({});
  const [activeView, setActiveView] = useState<"guide" | "teamManagement" | "venues" | "profiles" | "setup" | "knockouts" | "fixtures" | "table" | "playerTable" | "handicaps">("guide");

  const [selectedLeagueTeamNames, setSelectedLeagueTeamNames] = useState<string[]>([]);
  const [registryTeamName, setRegistryTeamName] = useState("");
  const [registryVenueId, setRegistryVenueId] = useState("");
  const [newVenueName, setNewVenueName] = useState("");
  const [registryTeamId, setRegistryTeamId] = useState("");
  const [showStep2Teams, setShowStep2Teams] = useState(true);
  const [showStep3Players, setShowStep3Players] = useState(true);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState("");
  const [newPlayerSecondName, setNewPlayerSecondName] = useState("");
  const [bulkPlayersText, setBulkPlayersText] = useState("");
  const [newPlayerLocationId, setNewPlayerLocationId] = useState("");
  const [transferPlayerId, setTransferPlayerId] = useState("");
  const [transferFromVenueId, setTransferFromVenueId] = useState("");
  const [transferVenueId, setTransferVenueId] = useState("");
  const [transferDestinationTeamId, setTransferDestinationTeamId] = useState("");
  const [manageVenueId, setManageVenueId] = useState("");
  const [manageVenueName, setManageVenueName] = useState("");
  const [manageVenueAddress, setManageVenueAddress] = useState("");
  const [manageVenuePostcode, setManageVenuePostcode] = useState("");
  const [manageVenuePhone, setManageVenuePhone] = useState("");
  const [manageVenueEmail, setManageVenueEmail] = useState("");
  const [venuePlayerSearch, setVenuePlayerSearch] = useState("");
  const [expandedVenueTeams, setExpandedVenueTeams] = useState<Record<string, boolean>>({});
  const [showAllVenueTeamMembers, setShowAllVenueTeamMembers] = useState<Record<string, boolean>>({});
  const [showUnassignedPlayers, setShowUnassignedPlayers] = useState(false);
  const [showAllRegisteredVenues, setShowAllRegisteredVenues] = useState(false);
  const [profileVenueFilterId, setProfileVenueFilterId] = useState("");
  const [seasonRosterTeamId, setSeasonRosterTeamId] = useState("");
  const [seasonRosterPlayerId, setSeasonRosterPlayerId] = useState("");
  const [seasonRosterBulkPlayerIds, setSeasonRosterBulkPlayerIds] = useState<string[]>([]);

  const [fixtureWeek, setFixtureWeek] = useState("");
  const [fixtureWeekFilter, setFixtureWeekFilter] = useState("");
  const [fixtureTeamFilter, setFixtureTeamFilter] = useState("");
  const [fixtureDate, setFixtureDate] = useState("");
  const [fixtureHome, setFixtureHome] = useState("");
  const [fixtureAway, setFixtureAway] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [resultEntryOpen, setResultEntryOpen] = useState(false);
  const [scorecardPhotoUrl, setScorecardPhotoUrl] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [genStartDate, setGenStartDate] = useState("");
  const [genDoubleRound, setGenDoubleRound] = useState(true);
  const [genClearExisting, setGenClearExisting] = useState(true);
  const [breakDateInput, setBreakDateInput] = useState("");
  const [breakDates, setBreakDates] = useState<string[]>([]);
  const [nominatedNames, setNominatedNames] = useState<Record<string, string>>({});
  const [fixtureBreaks, setFixtureBreaks] = useState<LeagueBreak[]>([
    { player_id: null, entered_player_name: "", break_value: "" },
    { player_id: null, entered_player_name: "", break_value: "" },
    { player_id: null, entered_player_name: "", break_value: "" },
    { player_id: null, entered_player_name: "", break_value: "" },
  ]);
  const [breaksFeatureAvailable, setBreaksFeatureAvailable] = useState(true);
  const [statusBackfillSeasonId, setStatusBackfillSeasonId] = useState<string | null>(null);
  const [selectedTableTeamId, setSelectedTableTeamId] = useState<string | null>(null);
  const [selectedTeamResultFixtureId, setSelectedTeamResultFixtureId] = useState<string | null>(null);
  const [handicapPlayerId, setHandicapPlayerId] = useState("");
  const [handicapVenueId, setHandicapVenueId] = useState("");
  const [handicapTeamId, setHandicapTeamId] = useState("");
  const [handicapTargetValue, setHandicapTargetValue] = useState("");
  const [handicapReason, setHandicapReason] = useState("");
  const [recalculatingHandicaps, setRecalculatingHandicaps] = useState(false);
  const [savingHandicap, setSavingHandicap] = useState(false);

  const canManage = admin.isSuper;
  const canViewLeague = !admin.loading;

  const currentSeason = useMemo(() => seasons.find((s) => s.id === seasonId) ?? null, [seasons, seasonId]);
  const visibleSeasons = useMemo(
    () => (canManage ? seasons : seasons.filter((s) => Boolean(s.is_published))),
    [canManage, seasons]
  );
  const seasonById = useMemo(() => new Map(seasons.map((s) => [s.id, s])), [seasons]);
  const currentSeasonSinglesCount = Math.max(1, Math.min(10, currentSeason?.singles_count ?? 4));
  const currentSeasonDoublesCount = Math.max(0, Math.min(4, currentSeason?.doubles_count ?? 1));
  const currentSeasonTotalFrames = currentSeasonSinglesCount + currentSeasonDoublesCount;
  const isWinterFormat = currentSeasonSinglesCount === 4 && currentSeasonDoublesCount === 1;
  const isSummerFormat = currentSeasonSinglesCount === 6 && currentSeasonDoublesCount === 0;
  const isHodgeTriplesFormat =
    currentSeasonSinglesCount === 6 &&
    currentSeasonDoublesCount === 0 &&
    (currentSeason?.name?.toLowerCase().includes("hodge") ?? false);
  const singlesMaxPerPlayer = currentSeasonSinglesCount === 6 && currentSeasonDoublesCount === 0 ? 2 : 1;
  const venueLocations = useMemo(
    () =>
      locations
        .filter((l) => !NON_VENUE_LOCATION_NAMES.has(l.name.trim().toLowerCase()))
        .sort((a, b) => locationLabel(a.name).localeCompare(locationLabel(b.name))),
    [locations]
  );
  const registeredTeamOptions = useMemo(() => {
    if (registeredTeams.length > 0) return registeredTeams;
    const map = new Map<string, RegisteredTeam>();
    for (const t of teams) {
      const key = `${(t.name ?? "").trim().toLowerCase()}::${t.location_id ?? ""}`;
      if (!map.has(key)) {
        map.set(key, { id: `derived-${key}`, name: t.name, location_id: t.location_id });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [registeredTeams, teams]);
  const registeredTeamByNormalizedName = useMemo(
    () => new Map(registeredTeams.map((team) => [team.name.trim().toLowerCase(), team])),
    [registeredTeams]
  );
  const selectedVenue = useMemo(
    () => locations.find((l) => l.id === manageVenueId) ?? null,
    [locations, manageVenueId]
  );
  const selectedVenuePlayers = useMemo(
    () =>
      players
        .filter((p) => p.location_id === manageVenueId)
        .sort((a, b) => named(a).localeCompare(named(b))),
    [players, manageVenueId]
  );
  const selectedVenueTeams = useMemo(
    () =>
      registeredTeams
        .filter((t) => t.location_id === manageVenueId)
        .map((t) => t.name)
        .sort((a, b) => a.localeCompare(b)),
    [registeredTeams, manageVenueId]
  );
  const seasonTeams = useMemo(() => teams.filter((t) => t.season_id === seasonId), [teams, seasonId]);
  const seasonFixtures = useMemo(() => fixtures.filter((f) => f.season_id === seasonId), [fixtures, seasonId]);
  const fixtureById = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const selectedSeasonRosterTeam = useMemo(
    () => seasonTeams.find((team) => team.id === seasonRosterTeamId) ?? null,
    [seasonTeams, seasonRosterTeamId]
  );
  const selectedSeasonRosterVenueId = useMemo(() => {
    if (!selectedSeasonRosterTeam) return null;
    const templateTeam = registeredTeamByNormalizedName.get(selectedSeasonRosterTeam.name.trim().toLowerCase());
    return templateTeam?.location_id ?? selectedSeasonRosterTeam.location_id ?? null;
  }, [registeredTeamByNormalizedName, selectedSeasonRosterTeam]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const knockoutCompetitions = useMemo(
    () =>
      leagueCompetitions
        .filter((c) => c.competition_format === "knockout" && !c.is_archived && isLeagueKnockoutName(c.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [leagueCompetitions]
  );
  const seasonYearOptions = useMemo(() => {
    const fromLeagues = seasons
      .map((s) => extractSeasonYearLabel(s.name))
      .filter((v) => /^\d{4}\/\d{4}$/.test(v));
    const thisYear = new Date().getFullYear();
    const defaults = Array.from({ length: 6 }, (_, i) => seasonRange(thisYear + i));
    return Array.from(new Set([...fromLeagues, ...defaults])).sort((a, b) => a.localeCompare(b));
  }, [seasons]);
  const competitionEntriesByCompetitionId = useMemo(() => {
    const map = new Map<string, LeagueCompetitionEntry[]>();
    for (const e of leagueCompetitionEntries) {
      const prev = map.get(e.competition_id) ?? [];
      prev.push(e);
      map.set(e.competition_id, prev);
    }
    return map;
  }, [leagueCompetitionEntries]);
  const roundDeadlinesByCompetitionId = useMemo(() => {
    const map = new Map<string, CompetitionRoundDeadline[]>();
    for (const d of competitionRoundDeadlines) {
      const prev = map.get(d.competition_id) ?? [];
      prev.push(d);
      map.set(d.competition_id, prev);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.round_no - b.round_no);
    return map;
  }, [competitionRoundDeadlines]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const teamMembersByTeam = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      const prev = map.get(m.team_id) ?? [];
      prev.push(m.player_id);
      map.set(m.team_id, prev);
    }
    return map;
  }, [members]);
  const registeredMembersByTeam = useMemo(() => {
    const map = new Map<string, RegisteredTeamMember[]>();
    for (const m of registeredMembers) {
      const prev = map.get(m.team_id) ?? [];
      prev.push(m);
      map.set(m.team_id, prev);
    }
    return map;
  }, [registeredMembers]);
  const seasonMembershipByPlayer = useMemo(() => {
    const map = new Map<string, TeamMember[]>();
    for (const member of members.filter((member) => member.season_id === seasonId)) {
      const prev = map.get(member.player_id) ?? [];
      prev.push(member);
      map.set(member.player_id, prev);
    }
    return map;
  }, [members, seasonId]);
  const fallbackRosterByLeagueTeamId = useMemo(() => {
    const map = new Map<string, string[]>();
    const regTeamByKey = new Map(
      registeredTeams.map((t) => [`${(t.name ?? "").trim().toLowerCase()}::${t.location_id ?? ""}`, t.id])
    );
    for (const team of seasonTeams) {
      const direct = teamMembersByTeam.get(team.id) ?? [];
      if (direct.length) {
        map.set(team.id, direct);
        continue;
      }
      const key = `${(team.name ?? "").trim().toLowerCase()}::${team.location_id ?? ""}`;
      const regTeamId = regTeamByKey.get(key);
      const fallback = regTeamId ? (registeredMembersByTeam.get(regTeamId) ?? []).map((m) => m.player_id) : [];
      map.set(team.id, fallback);
    }
    return map;
  }, [registeredTeams, registeredMembersByTeam, seasonTeams, teamMembersByTeam]);
  const selectedVenueTeamRoster = useMemo(() => {
    const teamsAtVenue = registeredTeams
      .filter((t) => t.location_id === manageVenueId)
      .sort((a, b) => a.name.localeCompare(b.name));
    return teamsAtVenue.map((team) => {
      const teamMembers = (registeredMembersByTeam.get(team.id) ?? [])
        .map((m) => ({
          ...m,
          player: playerById.get(m.player_id) ?? null,
        }))
        .filter((m) => m.player)
        .sort((a, b) => named(a.player).localeCompare(named(b.player)));
      return {
        id: team.id,
        name: team.name,
        members: teamMembers,
      };
    });
  }, [registeredTeams, registeredMembersByTeam, playerById, manageVenueId]);
  const selectedVenueUnassignedPlayers = useMemo(() => {
    const assignedPlayerIds = new Set(
      selectedVenueTeamRoster.flatMap((team) => team.members.map((m) => m.player_id))
    );
    return selectedVenuePlayers.filter((p) => !assignedPlayerIds.has(p.id));
  }, [selectedVenueTeamRoster, selectedVenuePlayers]);
  const selectedSeasonRosterMembers = useMemo(() => {
    if (!selectedSeasonRosterTeam) return [] as Array<TeamMember & { player: Player | null }>;
    return members
      .filter((member) => member.season_id === seasonId && member.team_id === selectedSeasonRosterTeam.id)
      .map((member) => ({ ...member, player: playerById.get(member.player_id) ?? null }))
      .sort((a, b) => named(a.player).localeCompare(named(b.player)));
  }, [members, playerById, seasonId, selectedSeasonRosterTeam]);
  const availableSeasonRosterPlayers = useMemo(() => {
    if (!selectedSeasonRosterTeam || !selectedSeasonRosterVenueId) return [] as Player[];
    const currentTeamPlayerIds = new Set(selectedSeasonRosterMembers.map((member) => member.player_id));
    return players
      .filter((player) => player.location_id === selectedSeasonRosterVenueId)
      .filter((player) => !currentTeamPlayerIds.has(player.id))
      .filter((player) => {
        const seasonMemberships = seasonMembershipByPlayer.get(player.id) ?? [];
        return seasonMemberships.every((membership) => membership.team_id === selectedSeasonRosterTeam.id);
      })
      .sort((a, b) => named(a).localeCompare(named(b)));
  }, [players, seasonMembershipByPlayer, selectedSeasonRosterMembers, selectedSeasonRosterTeam, selectedSeasonRosterVenueId]);
  const filteredSelectedVenueTeamRoster = useMemo(() => {
    const query = venuePlayerSearch.trim().toLowerCase();
    if (!query) return selectedVenueTeamRoster;
    return selectedVenueTeamRoster
      .map((team) => ({
        ...team,
        members: team.members.filter((m) => named(m.player).toLowerCase().includes(query)),
      }))
      .filter((team) => team.members.length > 0);
  }, [selectedVenueTeamRoster, venuePlayerSearch]);
  const visiblePlayerProfiles = useMemo(() => {
    const filtered = profileVenueFilterId
      ? players.filter((p) => p.location_id === profileVenueFilterId)
      : players;
    return filtered
      .slice()
      .sort((a, b) => named(a).localeCompare(named(b)))
      .map((p) => ({
        id: p.id,
        name: named(p),
        venue: locationLabel(locations.find((l) => l.id === p.location_id)?.name ?? "Unknown venue"),
        currentHandicap: Number(p.snooker_handicap ?? 0),
        baselineHandicap: Number(p.snooker_handicap_base ?? p.snooker_handicap ?? 0),
        rating: Math.round(Number((p as Player & { rating_snooker?: number | null }).rating_snooker ?? 1000)),
      }));
  }, [players, profileVenueFilterId, locations]);
  const selectedRegistryTeam = useMemo(
    () => registeredTeams.find((t) => t.id === registryTeamId) ?? null,
    [registeredTeams, registryTeamId]
  );
  const registeredTeamNamesByPlayer = useMemo(() => {
    const teamNameById = new Map(registeredTeams.map((t) => [t.id, t.name]));
    const map = new Map<string, string[]>();
    for (const member of registeredMembers) {
      const prev = map.get(member.player_id) ?? [];
      const teamName = teamNameById.get(member.team_id);
      if (teamName) prev.push(teamName);
      map.set(member.player_id, prev);
    }
    for (const [playerId, names] of map.entries()) {
      map.set(playerId, Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
    }
    return map;
  }, [registeredMembers, registeredTeams]);
  const describeExistingPlayerPlacement = (player: Player | null | undefined) => {
    if (!player) return "Existing player record found.";
    const venueName = player.location_id ? locationById.get(player.location_id)?.name ?? "Unknown club" : "Unknown club";
    const teamNames = registeredTeamNamesByPlayer.get(player.id) ?? [];
    const teamText = teamNames.length > 0 ? ` Team${teamNames.length === 1 ? "" : "s"}: ${teamNames.join(", ")}.` : " Not currently assigned to a team.";
    return `${named(player)} already exists at ${venueName}.${teamText}`;
  };
  const findExistingPlayerRecord = (fullName: string) => {
    const normalizedFullName = fullName.trim().toLowerCase();
    return (
      players.find((player) => (player.full_name ?? "").trim().toLowerCase() === normalizedFullName) ??
      null
    );
  };
  const handicapRows = useMemo(
    () =>
      players
        .slice()
        .sort((a, b) => named(a).localeCompare(named(b)))
        .map((p) => ({
          ...p,
          teams: registeredTeamNamesByPlayer.get(p.id) ?? [],
        })),
    [players, registeredTeamNamesByPlayer]
  );
  const handicapTeamsForVenue = useMemo(
    () =>
      registeredTeams
        .filter((t) => (handicapVenueId ? t.location_id === handicapVenueId : true))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [registeredTeams, handicapVenueId]
  );
  const handicapPlayersFiltered = useMemo(() => {
    if (!handicapVenueId || !handicapTeamId) return [];
    const teamMemberIds = new Set((registeredMembersByTeam.get(handicapTeamId) ?? []).map((m) => m.player_id));
    return handicapRows.filter((p) => p.location_id === handicapVenueId && teamMemberIds.has(p.id));
  }, [handicapRows, handicapVenueId, handicapTeamId, registeredMembersByTeam]);
  const handicapHistoryFiltered = useMemo(
    () =>
      handicapHistory.filter((h) => (handicapPlayerId ? h.player_id === handicapPlayerId : true)),
    [handicapHistory, handicapPlayerId]
  );
  const handicapBroadcastText = useMemo(() => {
    const rows = handicapPlayersFiltered
      .map((row) => ({
        club: locationLabel(locations.find((l) => l.id === row.location_id)?.name ?? "Unassigned club"),
        team: row.teams[0] ?? "No team",
        player: named(row),
        handicap: Number(row.snooker_handicap ?? 0),
      }))
      .sort((a, b) => a.club.localeCompare(b.club) || a.team.localeCompare(b.team) || a.player.localeCompare(b.player));
    if (rows.length === 0) return "";
    const lines: string[] = ["Current Snooker Handicaps", ""];
    let currentClub = "";
    let currentTeam = "";
    for (const row of rows) {
      if (row.club !== currentClub) {
        currentClub = row.club;
        currentTeam = "";
        if (lines[lines.length - 1] !== "") lines.push("");
        lines.push(currentClub);
      }
      if (row.team !== currentTeam) {
        currentTeam = row.team;
        lines.push(currentTeam);
      }
      lines.push(`${row.player} ${row.handicap > 0 ? `+${row.handicap}` : row.handicap}`);
    }
    return lines.join("\n");
  }, [handicapPlayersFiltered, locations]);
  const eloHandicapGuideRows = useMemo(
    () => [
      { elo: "1160", handicap: "-32" },
      { elo: "1140", handicap: "-28" },
      { elo: "1120", handicap: "-24" },
      { elo: "1100", handicap: "-20" },
      { elo: "1080", handicap: "-16" },
      { elo: "1060", handicap: "-12" },
      { elo: "1040", handicap: "-8" },
      { elo: "1020", handicap: "-4" },
      { elo: "1000", handicap: "0" },
      { elo: "980", handicap: "+4" },
      { elo: "960", handicap: "+8" },
      { elo: "940", handicap: "+12" },
      { elo: "920", handicap: "+16" },
      { elo: "900", handicap: "+20" },
      { elo: "880", handicap: "+24" },
      { elo: "860", handicap: "+28" },
      { elo: "840", handicap: "+32" },
    ],
    []
  );
  const playersAtSourceVenue = useMemo(() => {
    if (!transferFromVenueId) return [];
    return players
      .filter((p) => p.location_id === transferFromVenueId)
      .sort((a, b) => named(a).localeCompare(named(b)));
  }, [players, transferFromVenueId]);
  const destinationTeams = useMemo(() => {
    if (!transferVenueId) return [];
    return registeredTeams
      .filter((t) => t.location_id === transferVenueId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [registeredTeams, transferVenueId]);
  const fixtureSlots = useMemo(() => slots.filter((s) => s.fixture_id === fixtureId).sort((a, b) => a.slot_no - b.slot_no), [slots, fixtureId]);
  const fixtureSlotsByFixtureId = useMemo(() => {
    const map = new Map<string, FrameSlot[]>();
    for (const s of slots) {
      const prev = map.get(s.fixture_id) ?? [];
      prev.push(s);
      map.set(s.fixture_id, prev);
    }
    for (const [key, value] of map.entries()) {
      map.set(key, value.sort((a, b) => a.slot_no - b.slot_no));
    }
    return map;
  }, [slots]);
  const pendingSubmissionByFixtureId = useMemo(() => {
    const map = new Map<string, LeagueSubmission>();
    for (const s of submissions) {
      if (s.status !== "pending") continue;
      if (!map.has(s.fixture_id)) map.set(s.fixture_id, s);
    }
    return map;
  }, [submissions]);
  const fixtureParticipantPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of fixtureSlots) {
      if (s.home_player1_id) ids.add(s.home_player1_id);
      if (s.home_player2_id) ids.add(s.home_player2_id);
      if (s.away_player1_id) ids.add(s.away_player1_id);
      if (s.away_player2_id) ids.add(s.away_player2_id);
    }
    return Array.from(ids);
  }, [fixtureSlots]);
  const fixtureChangeByFixtureId = useMemo(() => {
    const map = new Map<string, FixtureChangeRequest>();
    for (const request of fixtureChangeRequests) {
      if (!map.has(request.fixture_id) || request.status === "rescheduled") {
        map.set(request.fixture_id, request);
      }
    }
    return map;
  }, [fixtureChangeRequests]);
  const currentFixture = useMemo(() => fixtures.find((f) => f.id === fixtureId) ?? null, [fixtures, fixtureId]);
  const currentFixtureReschedule = useMemo(
    () => describeFixtureReschedule(currentFixture ? fixtureChangeByFixtureId.get(currentFixture.id) : null),
    [currentFixture, fixtureChangeByFixtureId]
  );
  const fixtureRosterPlayerIds = useMemo(() => {
    if (!currentFixture) return [] as string[];
    const ids = new Set<string>();
    const home = fallbackRosterByLeagueTeamId.get(currentFixture.home_team_id) ?? [];
    const away = fallbackRosterByLeagueTeamId.get(currentFixture.away_team_id) ?? [];
    for (const id of home) ids.add(id);
    for (const id of away) ids.add(id);
    return Array.from(ids);
  }, [currentFixture, fallbackRosterByLeagueTeamId]);
  const fixturePlayerOptions = useMemo(() => {
    const ids = new Set<string>([...fixtureParticipantPlayerIds, ...fixtureRosterPlayerIds]);
    return Array.from(ids)
      .map((id) => ({ id, label: named(playerById.get(id)) }))
      .sort((a, b) => sortLabelByFirstName(a.label, b.label));
  }, [fixtureParticipantPlayerIds, fixtureRosterPlayerIds, playerById]);
  const sortRosterIds = (ids: string[]) =>
    ids
      .slice()
      .sort((a, b) => sortLabelByFirstName(named(playerById.get(a)), named(playerById.get(b))));
  const captainTeamIds = useMemo(() => {
    if (!currentUserPlayerId) return new Set<string>();
    const ids = members
      .filter((m) => m.player_id === currentUserPlayerId && (m.is_captain || Boolean(m.is_vice_captain)))
      .map((m) => m.team_id);
    return new Set(ids);
  }, [members, currentUserPlayerId]);
  useEffect(() => {
    if (!handicapTeamId) return;
    const exists = handicapTeamsForVenue.some((t) => t.id === handicapTeamId);
    if (!exists) setHandicapTeamId("");
  }, [handicapTeamId, handicapTeamsForVenue]);
  useEffect(() => {
    if (!handicapPlayerId) return;
    const exists = handicapPlayersFiltered.some((p) => p.id === handicapPlayerId);
    if (!exists) setHandicapPlayerId("");
  }, [handicapPlayerId, handicapPlayersFiltered]);
  const canSubmitCurrentFixture = useMemo(() => {
    if (!currentFixture) return false;
    if (canManage) return true;
    return captainTeamIds.has(currentFixture.home_team_id) || captainTeamIds.has(currentFixture.away_team_id);
  }, [canManage, captainTeamIds, currentFixture]);
  const isCurrentFixtureLocked = currentFixture?.status === "complete";

  useEffect(() => {
    if (!admin.loading && !canManage && ["guide", "teamManagement", "venues", "profiles", "setup", "handicaps"].includes(activeView)) {
      setActiveView("fixtures");
    }
  }, [admin.loading, canManage, activeView]);
  const pendingFixtureSubmission = useMemo(
    () => submissions.find((s) => s.fixture_id === fixtureId && s.status === "pending") ?? null,
    [submissions, fixtureId]
  );
  const allPendingSubmissions = useMemo(
    () =>
      submissions
        .filter((s) => s.status === "pending")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [submissions]
  );

  const getSeasonFrameConfig = (season?: Season | null) => {
    const singles = Math.max(1, Math.min(10, season?.singles_count ?? 4));
    const doubles = Math.max(0, Math.min(4, season?.doubles_count ?? 1));
    const seasonName = (season?.name ?? "").toLowerCase();
    const isHodgeTriples = singles === 6 && doubles === 0 && seasonName.includes("hodge");
    return { singles, doubles, total: singles + doubles, isHodgeTriples };
  };
  const calculateHodgeBonus = (
    frameRows: Array<{
      slot_no: number;
      home_points_scored?: number | null;
      away_points_scored?: number | null;
    }>
  ) => {
    const pairs: Array<[number, number]> = [
      [1, 4],
      [2, 5],
      [3, 6],
    ];
    let homeBonus = 0;
    let awayBonus = 0;
    for (const [a, b] of pairs) {
      const ra = frameRows.find((r) => r.slot_no === a);
      const rb = frameRows.find((r) => r.slot_no === b);
      if (!ra && !rb) continue;
      const homeTotal =
        (typeof ra?.home_points_scored === "number" ? ra.home_points_scored : 0) +
        (typeof rb?.home_points_scored === "number" ? rb.home_points_scored : 0);
      const awayTotal =
        (typeof ra?.away_points_scored === "number" ? ra.away_points_scored : 0) +
        (typeof rb?.away_points_scored === "number" ? rb.away_points_scored : 0);
      // Respotted black means aggregate ties should not occur.
      if (homeTotal > awayTotal) homeBonus += 1;
      else if (awayTotal > homeTotal) awayBonus += 1;
    }
    return { homeBonus, awayBonus };
  };
  const calculateFixturePoints = (
    frameRows: Array<{
      slot_no: number;
      winner_side: "home" | "away" | null;
      home_points_scored?: number | null;
      away_points_scored?: number | null;
    }>,
    season?: Season | null
  ) => {
    let homePoints = frameRows.filter((r) => r.winner_side === "home").length;
    let awayPoints = frameRows.filter((r) => r.winner_side === "away").length;
    const cfg = getSeasonFrameConfig(season);
    if (cfg.isHodgeTriples) {
      const bonus = calculateHodgeBonus(frameRows);
      homePoints += bonus.homeBonus;
      awayPoints += bonus.awayBonus;
    }
    return { homePoints, awayPoints };
  };
  const formatLabel = (singles: number, doubles: number) =>
    doubles > 0 ? `${singles} singles + ${doubles} doubles` : `${singles} singles`;
  const slotLabel = (slotNo: number, season?: Season | null) => {
    const cfg = getSeasonFrameConfig(season ?? currentSeason);
    if (slotNo <= cfg.singles) return `Singles ${slotNo}`;
    if (cfg.doubles <= 0) return `Frame ${slotNo}`;
    const doublesNo = slotNo - cfg.singles;
    return cfg.doubles === 1 ? "Doubles" : `Doubles ${doublesNo}`;
  };
  const leagueTabClass = (view: "guide" | "teamManagement" | "venues" | "profiles" | "setup" | "knockouts" | "fixtures" | "table" | "playerTable" | "handicaps") => {
    const active = activeView === view;
    const base = "w-full rounded-full border px-3 py-2 text-center text-sm font-semibold transition";
    if (view === "guide") return `${base} ${active ? "border-slate-800 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;
    if (view === "teamManagement") return `${base} ${active ? "border-indigo-700 bg-indigo-700 text-white" : "border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"}`;
    if (view === "venues") return `${base} ${active ? "border-teal-700 bg-teal-700 text-white" : "border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100"}`;
    if (view === "profiles") return `${base} ${active ? "border-sky-700 bg-sky-700 text-white" : "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"}`;
    if (view === "setup") return `${base} ${active ? "border-cyan-700 bg-cyan-700 text-white" : "border-cyan-300 bg-cyan-50 text-cyan-900 hover:bg-cyan-100"}`;
    if (view === "knockouts") return `${base} ${active ? "border-fuchsia-700 bg-fuchsia-700 text-white" : "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 hover:bg-fuchsia-100"}`;
    if (view === "handicaps") return `${base} ${active ? "border-violet-700 bg-violet-700 text-white" : "border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100"}`;
    if (view === "fixtures") return `${base} ${active ? "border-amber-700 bg-amber-700 text-white" : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"}`;
    if (view === "table") return `${base} ${active ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"}`;
    return `${base} ${active ? "border-fuchsia-700 bg-fuchsia-700 text-white" : "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 hover:bg-fuchsia-100"}`;
  };
  const activeViewDescription =
    activeView === "guide"
      ? "League-wide summary and operating overview."
      : activeView === "teamManagement"
        ? "Register teams and players, assign captains, and handle transfers."
        : activeView === "venues"
          ? "Register venues and maintain venue contact details."
          : activeView === "profiles"
            ? "View player profiles and linked team/venue details."
            : activeView === "setup"
              ? "Create leagues and add teams into selected leagues."
              : activeView === "knockouts"
                ? "Create and manage knockout cups, sign-up windows, and approved entries."
              : activeView === "fixtures"
                ? "View fixtures, enter results, and review submissions."
                : activeView === "table"
                  ? "Current league standings and recent team form."
                  : activeView === "playerTable"
                    ? "Singles, doubles, and total player performance."
                    : "Manage and review snooker handicaps.";
  const guideForView = (
    view: "guide" | "teamManagement" | "venues" | "profiles" | "setup" | "knockouts" | "fixtures" | "table" | "playerTable" | "handicaps"
  ) => {
    if (view === "guide") {
      return {
        title: "League Manager Summary",
        points: [
          "Use the Guided setup panel to work in league-creation order without jumping between tabs.",
          "Use Team Management first to register teams, players, and captain/vice-captain assignments.",
          "Use Venues to maintain club records and contact details.",
          "Use League Setup to create a league season and attach teams.",
          "Use Fixtures to generate, review, and operate weekly league matches.",
          "Use League Table and Player Table to publish standings and performance.",
          "Use Knockout Cups for competition creation, entry windows, approvals, and draws.",
          "Use Handicaps to review Elo-driven changes, export the current handicap list, and apply Super User overrides when required.",
        ],
      };
    }
    if (view === "teamManagement") {
      return {
        title: "Team Management Guide",
        points: [
          "Step 1: Register teams against a venue.",
          "Step 2: Add existing players to teams or bulk-register new players.",
          "Step 3: Assign and update captain/vice-captain roles.",
          "Step 4: Transfer players between teams/venues when squads change.",
          "Use this tab before building leagues so team rosters are ready.",
        ],
      };
    }
    if (view === "venues") {
      return {
        title: "Venues Guide",
        points: [
          "Register and edit venue names and contact details.",
          "Open each venue card to inspect linked teams and players.",
          "Use this area as the master source of league clubs.",
        ],
      };
    }
    if (view === "profiles") {
      return {
        title: "Player Profiles Guide",
        points: [
          "Review player profile data, team links, and venue links.",
          "Open full profile pages for deeper stats and history.",
          "Use this tab for league-level checks before season launch.",
        ],
      };
    }
    if (view === "setup") {
      return {
        title: "League Setup Guide",
        points: [
          "Create seasonal leagues (for example Winter or Summer).",
          "Winter League = 4 singles + 1 doubles. Summer League = 6 singles only.",
          "Summer League players can appear in up to 2 singles frames; frames 5 and 6 allow No Show if a side is short.",
          "Set handicap mode when creating the league.",
          "Add registered teams to the selected league season.",
          "Publish only after setup and fixtures are ready for members.",
        ],
      };
    }
    if (view === "knockouts") {
      return {
        title: "Knockout Cups Guide",
        points: [
          "Create league competitions by cup name and season.",
          "Open/close entry windows and set entry deadlines.",
          "Approve/reject entries and generate draws.",
          "Adjust round formats where cup rules require it.",
        ],
      };
    }
    if (view === "fixtures") {
      return {
        title: "Fixtures Guide",
        points: [
          "Generate fixture list and manage break weeks.",
          "Open result entry for Super User operation.",
          "Summer League uses 6 singles only, with a maximum of 2 singles per player.",
          "If a side only has 2 players available, use No Show in frames 5 and 6.",
          "Review captain submissions and approve/reject where configured.",
          "Track fixture status: pending, in-progress, and complete.",
        ],
      };
    }
    if (view === "table") {
      return {
        title: "League Table Guide",
        points: [
          "Read current standings from approved fixture results.",
          "Inspect form/streak indicators and team summaries.",
          "Use team drill-down for historical match context.",
        ],
      };
    }
    if (view === "playerTable") {
      return {
        title: "Player Table Guide",
        points: [
          "Review singles ranking and team-linked player metrics.",
          "Compare appearances, won/lost, and win percentage.",
          "Use this as the season performance view for registered players.",
        ],
      };
    }
    return {
      title: "Handicaps Guide",
      points: [
        "Snooker Elo updates after every valid competitive frame, but handicaps do not move automatically after each win or loss.",
        "Use Recalculate from Elo when you want to review handicaps for the current week. Each review moves a player by a maximum of 4 points toward their Elo-based target handicap.",
        "Filter by club/team/player to review current values quickly, or use the copy-ready handicap list to send a full update by WhatsApp or email.",
        "Use override controls for league-corrective changes and open history to trace when and why each change was made.",
      ],
    };
  };
  const activeGuide = guideForView(activeView);

  const loadAll = async () => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    setLoading(true);
    const [
      authRes,
      locRes,
      playersRes,
      seasonsRes,
      teamsRes,
      membersRes,
      fixturesRes,
      slotsRes,
      tableRes,
      submissionsRes,
      handicapHistoryRes,
      competitionsRes,
      competitionEntriesRes,
      roundDeadlinesRes,
    ] = await Promise.all([
      client.auth.getUser(),
      client.from("locations").select("id,name,address,contact_phone,contact_email").order("name"),
      client
        .from("players")
        .select("id,display_name,full_name,location_id,rating_snooker,snooker_handicap,snooker_handicap_base")
        .eq("is_archived", false),
      client
        .from("league_seasons")
        .select("id,name,location_id,is_active,is_published,published_at,created_at,handicap_enabled,singles_count,doubles_count")
        .order("created_at", { ascending: false }),
      client.from("league_teams").select("id,season_id,location_id,name,is_active"),
      client.from("league_team_members").select("id,season_id,team_id,player_id,is_captain,is_vice_captain"),
      client.from("league_fixtures").select("id,season_id,location_id,week_no,fixture_date,home_team_id,away_team_id,status,home_points,away_points").order("fixture_date", { ascending: true }),
      client.from("league_fixture_frames").select("id,fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated,away_nominated,home_forfeit,away_forfeit,winner_side,home_nominated_name,away_nominated_name,home_points_scored,away_points_scored"),
      client.from("league_table").select("team_id,team_name,played,points,frames_for,frames_against,frame_diff"),
      client
        .from("league_result_submissions")
        .select("id,fixture_id,season_id,location_id,submitted_by_user_id,submitter_team_id,frame_results,scorecard_photo_url,status,rejection_reason,created_at")
        .order("created_at", { ascending: false }),
      client
        .from("league_handicap_history")
        .select("id,player_id,season_id,fixture_id,change_type,delta,previous_handicap,new_handicap,reason,changed_by_user_id,created_at")
        .order("created_at", { ascending: false })
        .limit(800),
      client
        .from("competitions")
        .select("id,name,sport_type,competition_format,match_mode,best_of,knockout_round_best_of,signup_open,signup_deadline,final_scheduled_at,final_venue_location_id,max_entries,is_archived,is_completed,created_at")
        .order("created_at", { ascending: false }),
      client
        .from("competition_entries")
        .select("id,competition_id,requester_user_id,player_id,status,created_at")
        .order("created_at", { ascending: false }),
      client
        .from("competition_round_deadlines")
        .select("id,competition_id,round_no,deadline_at,created_at")
        .order("competition_id", { ascending: true })
        .order("round_no", { ascending: true }),
    ]);
    const regTeamsRes = await client.from("league_registered_teams").select("id,name,location_id").order("name");
    const regMembersRes = await client.from("league_registered_team_members").select("id,team_id,player_id,is_captain,is_vice_captain");

    const userId = authRes.data.user?.id ?? null;
    setCurrentUserId(userId);

    if (!admin.isSuper) {
      if (userId) {
        const appUserRes = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
        const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
        setCurrentUserPlayerId(linkedPlayerId);
        const myPlayer = linkedPlayerId
          ? await client.from("players").select("location_id").eq("id", linkedPlayerId).maybeSingle()
          : await client.from("players").select("location_id").eq("claimed_by", userId).maybeSingle();
        if (!myPlayer.error) setAdminLocationId(myPlayer.data?.location_id ?? null);
      }
    } else {
      const appUserRes = userId ? await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle() : null;
      setCurrentUserPlayerId((appUserRes?.data?.linked_player_id as string | null) ?? null);
    }

    let locationRows = locRes.data ?? [];
    let locationErrorMessage = locRes.error?.message ?? null;
    if (locRes.error && (locRes.error.message.toLowerCase().includes("address") || locRes.error.message.toLowerCase().includes("contact_"))) {
      const fallbackLocs = await client.from("locations").select("id,name").order("name");
      if (!fallbackLocs.error) {
        locationRows = (fallbackLocs.data ?? []).map((l) => ({
          id: l.id as string,
          name: l.name as string,
          address: null,
          contact_phone: null,
          contact_email: null,
        }));
        locationErrorMessage = null;
      }
    }

    let playerRows = playersRes.data ?? [];
    let playerErrorMessage = playersRes.error?.message ?? null;
    if (playersRes.error && playersRes.error.message.toLowerCase().includes("is_archived")) {
      const fallbackPlayers = await client.from("players").select("id,display_name,full_name,location_id");
      if (!fallbackPlayers.error) {
        playerRows = (fallbackPlayers.data ?? []).map((p) => ({
          ...p,
          rating_snooker: null,
          snooker_handicap: null,
          snooker_handicap_base: null,
        }));
        playerErrorMessage = null;
      }
    }

    let seasonRows = seasonsRes.data ?? [];
    let seasonErrorMessage = seasonsRes.error?.message ?? null;
    if (
      seasonsRes.error &&
      (seasonsRes.error.message.toLowerCase().includes("handicap_enabled") ||
        seasonsRes.error.message.toLowerCase().includes("singles_count") ||
        seasonsRes.error.message.toLowerCase().includes("doubles_count"))
    ) {
      const fallbackSeasons = await client
        .from("league_seasons")
        .select("id,name,location_id,is_active,created_at")
        .order("created_at", { ascending: false });
      if (!fallbackSeasons.error) {
        seasonRows = (fallbackSeasons.data ?? []).map((s) => ({
          ...s,
          is_published: true,
          published_at: null,
          handicap_enabled: false,
          singles_count: 5,
          doubles_count: 1,
        }));
        seasonErrorMessage = null;
      }
    }

    const firstError =
      locationErrorMessage ||
      playerErrorMessage ||
      seasonErrorMessage ||
      teamsRes.error?.message ||
      membersRes.error?.message ||
      fixturesRes.error?.message ||
      slotsRes.error?.message ||
      tableRes.error?.message ||
      submissionsRes.error?.message ||
      competitionsRes.error?.message ||
      competitionEntriesRes.error?.message ||
      (roundDeadlinesRes.error && !roundDeadlinesRes.error.message.toLowerCase().includes("competition_round_deadlines")
        ? roundDeadlinesRes.error.message
        : null) ||
      (handicapHistoryRes.error && !handicapHistoryRes.error.message.toLowerCase().includes("league_handicap_history")
        ? handicapHistoryRes.error.message
        : null) ||
      regTeamsRes.error?.message ||
      regMembersRes.error?.message ||
      null;

    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (token) {
      const requestRes = await fetch("/api/league/fixture-change-requests?scope=published", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await requestRes.json().catch(() => ({}))) as { error?: string; rows?: FixtureChangeRequest[] };
      if (requestRes.ok) {
        setFixtureChangeRequests(payload.rows ?? []);
      } else if (!firstError) {
        setMessage(payload.error ?? "Failed to load fixture date requests.");
      }
    } else {
      setFixtureChangeRequests([]);
    }

    if (firstError) {
      setMessage(`Partial load: ${firstError}`);
    }

    setLocations((locationRows ?? []) as Location[]);
    setPlayers(playerRows as Player[]);
    setSeasons(seasonRows as Season[]);
    setTeams((teamsRes.data ?? []) as Team[]);
    setMembers((membersRes.data ?? []) as TeamMember[]);
    setRegisteredTeams(regTeamsRes.error ? [] : ((regTeamsRes.data ?? []) as RegisteredTeam[]));
    setRegisteredMembers(regMembersRes.error ? [] : ((regMembersRes.data ?? []) as RegisteredTeamMember[]));
    setFixtures((fixturesRes.data ?? []) as Fixture[]);
    setSlots((slotsRes.data ?? []) as FrameSlot[]);
    setTableRows((tableRes.data ?? []) as TableRow[]);
    setSubmissions((submissionsRes.data ?? []) as LeagueSubmission[]);
    let competitionRows = (competitionsRes.data ?? []) as LeagueCompetition[];
    if (canManage && competitionRows.length > 0) {
      const leagueRows = competitionRows.filter((c) => isLeagueKnockoutName(c.name));
      for (const row of leagueRows) {
        const roundCfg = row.knockout_round_best_of ?? {};
        if (isHodgeCompetitionName(row.name)) {
          const needsFix =
            row.best_of !== 9 ||
            row.match_mode !== "doubles" ||
            roundCfg.round1 !== 9 ||
            roundCfg.semi_final !== 9 ||
            roundCfg.final !== 9;
          if (!needsFix) continue;
          await client
            .from("competitions")
            .update({
              best_of: 9,
              match_mode: "doubles",
              knockout_round_best_of: { round1: 9, semi_final: 9, final: 9 },
            })
            .eq("id", row.id);
          continue;
        }
        if (isHamiltonCompetitionName(row.name)) {
          const needsFix = row.sport_type !== "billiards";
          if (!needsFix) continue;
          await client
            .from("competitions")
            .update({
              sport_type: "billiards",
            })
            .eq("id", row.id);
          continue;
        }
        if (isAlberyCompetitionName(row.name)) {
          const needsFix = row.sport_type !== "billiards" || row.best_of !== 1;
          if (!needsFix) continue;
          await client
            .from("competitions")
            .update({
              sport_type: "billiards",
              best_of: 1,
              match_mode: "doubles",
              knockout_round_best_of: null,
            })
            .eq("id", row.id);
          continue;
        }
        const needsFix =
          row.best_of !== 3 ||
          roundCfg.round1 !== 3 ||
          roundCfg.semi_final !== 3 ||
          roundCfg.final !== 3;
        if (!needsFix) continue;
        await client
          .from("competitions")
          .update({
            best_of: 3,
            knockout_round_best_of: { round1: 3, semi_final: 3, final: 3 },
          })
          .eq("id", row.id);
      }
      if (leagueRows.length > 0) {
        const refresh = await client
          .from("competitions")
          .select("id,name,sport_type,competition_format,match_mode,best_of,knockout_round_best_of,signup_open,signup_deadline,final_scheduled_at,final_venue_location_id,max_entries,is_archived,is_completed,created_at")
          .order("created_at", { ascending: false });
        if (!refresh.error && refresh.data) {
          competitionRows = refresh.data as LeagueCompetition[];
        }
      }
    }
    setLeagueCompetitions(competitionRows);
    setLeagueCompetitionEntries((competitionEntriesRes.data ?? []) as LeagueCompetitionEntry[]);
    setCompetitionRoundDeadlines(
      roundDeadlinesRes.error ? [] : ((roundDeadlinesRes.data ?? []) as CompetitionRoundDeadline[])
    );
    setHandicapHistory(
      handicapHistoryRes.error
        ? []
        : ((handicapHistoryRes.data ?? []) as HandicapHistoryEntry[])
    );

    setLoading(false);
  };

  useEffect(() => {
    if (!fixtureSlots.length) {
      setNominatedNames({});
      return;
    }
    const nominatedInit: Record<string, string> = {};
    for (const slot of fixtureSlots) {
      if (slot.home_nominated_name) nominatedInit[`${slot.id}:home`] = slot.home_nominated_name;
      if (slot.away_nominated_name) nominatedInit[`${slot.id}:away`] = slot.away_nominated_name;
    }
    setNominatedNames(nominatedInit);
  }, [fixtureSlots, fixtureId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !fixtureId) return;
    let active = true;
    const run = async () => {
      const res = await client
        .from("league_fixture_breaks")
        .select("id,fixture_id,player_id,entered_player_name,break_value")
        .eq("fixture_id", fixtureId)
        .order("break_value", { ascending: false });
      if (!active) return;
      if (res.error) {
        if (res.error.message?.toLowerCase().includes("does not exist")) {
          setBreaksFeatureAvailable(false);
        } else {
          setMessage(res.error.message);
        }
        return;
      }
      setBreaksFeatureAvailable(true);
      const rows = (res.data ?? []).map((r) => ({
        id: r.id as string,
        fixture_id: r.fixture_id as string,
        player_id: (r.player_id as string | null) ?? null,
        entered_player_name: (r.entered_player_name as string | null) ?? "",
        break_value: String(r.break_value ?? ""),
      }));
      const padded: LeagueBreak[] = [...rows];
      while (padded.length < 4) padded.push({ player_id: null, entered_player_name: "", break_value: "" });
      setFixtureBreaks(padded);
    };
    void run();
    return () => {
      active = false;
    };
  }, [fixtureId]);

  useEffect(() => {
    if (!admin.loading) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.loading]);

  useEffect(() => {
    if (!visibleSeasons.length) {
      if (seasonId) setSeasonId("");
      return;
    }
    if (!canManage && currentUserPlayerId) {
      const memberSeasonIds = new Set(
        members.filter((m) => m.player_id === currentUserPlayerId).map((m) => m.season_id)
      );
      const preferredSeason = visibleSeasons.find((s) => memberSeasonIds.has(s.id));
      if (preferredSeason && preferredSeason.id !== seasonId) {
        setSeasonId(preferredSeason.id);
        return;
      }
    }
    if (!visibleSeasons.some((s) => s.id === seasonId)) {
      setSeasonId(visibleSeasons[0].id);
    }
  }, [visibleSeasons, seasonId, canManage, currentUserPlayerId, members]);

  useEffect(() => {
    if (!seasonTeams.length) {
      if (seasonRosterTeamId) setSeasonRosterTeamId("");
      if (seasonRosterPlayerId) setSeasonRosterPlayerId("");
      if (seasonRosterBulkPlayerIds.length > 0) setSeasonRosterBulkPlayerIds([]);
      return;
    }
    if (!seasonTeams.some((team) => team.id === seasonRosterTeamId)) {
      setSeasonRosterTeamId(seasonTeams[0]?.id ?? "");
      setSeasonRosterPlayerId("");
      setSeasonRosterBulkPlayerIds([]);
    }
  }, [seasonRosterBulkPlayerIds.length, seasonRosterPlayerId, seasonRosterTeamId, seasonTeams]);

  useEffect(() => {
    if (seasonRosterBulkPlayerIds.length === 0) return;
    const allowed = new Set(availableSeasonRosterPlayers.map((player) => player.id));
    setSeasonRosterBulkPlayerIds((prev) => prev.filter((playerId) => allowed.has(playerId)));
  }, [availableSeasonRosterPlayers, seasonRosterBulkPlayerIds.length]);

  useEffect(() => {
    if (admin.loading || canManage) return;
    if (activeView === "guide") setActiveView("fixtures");
  }, [admin.loading, canManage, activeView]);

  useEffect(() => {
    if (!resultEntryOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [resultEntryOpen]);

  useEffect(() => {
    setSelectedLeagueTeamNames([]);
  }, [seasonId]);

  useEffect(() => {
    if (knockoutSeasonLabel.trim()) return;
    if (!currentSeason?.name) return;
    setKnockoutSeasonLabel(extractSeasonYearLabel(currentSeason.name));
  }, [currentSeason?.name, knockoutSeasonLabel]);

  useEffect(() => {
    const venue = locations.find((l) => l.id === manageVenueId);
    if (!venue) return;
    setManageVenueName(venue.name ?? "");
    const rawAddress = venue.address ?? "";
    const [addressLine, postcode] = rawAddress.split(" | ");
    setManageVenueAddress(addressLine ?? "");
    setManageVenuePostcode(postcode ?? "");
    setManageVenuePhone(venue.contact_phone ?? "");
    setManageVenueEmail(venue.contact_email ?? "");
    setVenuePlayerSearch("");
    setExpandedVenueTeams({});
    setShowAllVenueTeamMembers({});
    setShowUnassignedPlayers(false);
  }, [locations, manageVenueId]);

  const createSeason = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can manage league setup.");
      return;
    }
    const fallbackLocation = venueLocations[0]?.id ?? locations[0]?.id ?? null;
    if (!fallbackLocation) {
      setMessage("Cannot create league yet. First register at least one venue in Team Management (Step 1), then register teams (Step 2).");
      return;
    }
    const authRes = await client.auth.getUser();
    const creatorId = authRes.data.user?.id ?? null;
    const template = LEAGUE_TEMPLATES[seasonTemplate];
    const suffix = seasonName.trim();
    const computedSeasonName = `${LEAGUE_BODY_NAME} - ${template.label}${suffix ? ` ${suffix}` : ""}`;
    let ins = await client.from("league_seasons").insert({
      name: computedSeasonName,
      location_id: fallbackLocation,
      created_by_user_id: creatorId,
      is_published: false,
      handicap_enabled: seasonHandicapEnabled,
      sport_type: "snooker",
      points_per_frame: 1,
      singles_count: template.singlesCount,
      doubles_count: template.doublesCount,
      max_night_squad: 6,
      is_active: true,
    }).select("id").single();
    if (ins.error && ins.error.message.toLowerCase().includes("handicap_enabled")) {
      ins = await client
        .from("league_seasons")
        .insert({
          name: computedSeasonName,
          location_id: fallbackLocation,
          created_by_user_id: creatorId,
          is_published: false,
          sport_type: "snooker",
          points_per_frame: 1,
          singles_count: template.singlesCount,
          doubles_count: template.doublesCount,
          max_night_squad: 6,
          is_active: true,
        })
        .select("id")
        .single();
    }
    if (ins.error) {
      setMessage(ins.error.message);
      return;
    }
    setSeasonName("");
    setSeasonTemplate("winter");
    setSeasonHandicapEnabled(false);
    setSeasonId(ins.data.id);
    await loadAll();
    setInfoModal({
      title: "League Created",
      description: seasonHandicapEnabled
        ? `League created successfully. Handicap mode is enabled with a maximum start of ${MAX_SNOOKER_START}.`
        : "League created successfully. Handicap mode is disabled.",
    });
  };

  const copyRegisteredRosterToLeagueTeam = async (
    leagueTeamId: string,
    teamName: string,
    seasonIdValue: string
  ): Promise<string | null> => {
    const client = supabase;
    if (!client) return "Supabase is not configured.";
    if (!canManage) return "Only Super User can modify league teams.";
    const registeredTeam = registeredTeams.find((t) => t.name.toLowerCase() === teamName.toLowerCase());
    if (!registeredTeam) return null;
    const roster = registeredMembers.filter((m) => m.team_id === registeredTeam.id);
    if (roster.length === 0) return null;
    const conflicts = roster
      .map((member) => {
        const existingSeasonMemberships = (seasonMembershipByPlayer.get(member.player_id) ?? []).filter(
          (existing) => existing.team_id !== leagueTeamId && existing.season_id === seasonIdValue
        );
        if (existingSeasonMemberships.length === 0) return null;
        const playerName = named(playerById.get(member.player_id));
        const existingTeams = Array.from(
          new Set(existingSeasonMemberships.map((existing) => teamById.get(existing.team_id)?.name).filter(Boolean) as string[])
        ).sort((a, b) => a.localeCompare(b));
        return `${playerName} is already assigned in this season to ${existingTeams.join(", ")}`;
      })
      .filter((value): value is string => Boolean(value));
    const eligibleRoster = roster.filter((member) => {
      const existingSeasonMemberships = (seasonMembershipByPlayer.get(member.player_id) ?? []).filter(
        (existing) => existing.team_id !== leagueTeamId && existing.season_id === seasonIdValue
      );
      return existingSeasonMemberships.length === 0;
    });
    if (eligibleRoster.length === 0) {
      return conflicts.join(" | ");
    }
    const copyRes = await client.from("league_team_members").upsert(
      eligibleRoster.map((m) => ({
        season_id: seasonIdValue,
        team_id: leagueTeamId,
        player_id: m.player_id,
        is_captain: m.is_captain,
        is_vice_captain: m.is_vice_captain ?? false,
      })),
      { onConflict: "season_id,team_id,player_id" }
    );
    if (copyRes.error?.message) return copyRes.error.message;
    return conflicts.length > 0 ? conflicts.join(" | ") : null;
  };

  const addTeamsToLeague = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can manage league teams.");
      return;
    }
    if (!seasonId) {
      setMessage("Select a league first.");
      return;
    }
    const picked = Array.from(new Set(selectedLeagueTeamNames.map((t) => t.trim()).filter(Boolean)));
    if (picked.length === 0) {
      setMessage("Select at least one registered team.");
      return;
    }
    const season = seasons.find((s) => s.id === seasonId);
    if (!season) return;
    const existingNames = new Set(seasonTeams.map((t) => t.name.trim().toLowerCase()));
    const toAdd = picked.filter((name) => !existingNames.has(name.toLowerCase()));
    if (toAdd.length === 0) {
      setMessage("All selected teams are already in this league.");
      return;
    }
    let added = 0;
    const failed: string[] = [];
    const warnings: string[] = [];
    for (const teamName of toAdd) {
      const registeredTeam = registeredTeamByNormalizedName.get(teamName.trim().toLowerCase());
      const ins = await client
        .from("league_teams")
        .insert({
          season_id: seasonId,
          location_id: registeredTeam?.location_id ?? season.location_id,
          name: teamName,
          is_active: true,
        })
        .select("id,name")
        .single();
      if (ins.error || !ins.data) {
        failed.push(`${teamName}${ins.error?.message ? `: ${ins.error.message}` : ""}`);
        continue;
      }
      const rosterError = await copyRegisteredRosterToLeagueTeam(ins.data.id, teamName, seasonId);
      if (rosterError) {
        warnings.push(`${teamName}: ${rosterError}`);
      }
      added += 1;
    }
    setSelectedLeagueTeamNames([]);
    await loadAll();
    if (failed.length > 0) {
      setMessage(`Added ${added} team(s). Some failed: ${failed.join(" | ")}`);
      return;
    }
    setInfoModal({
      title: "Teams Added",
      description:
        warnings.length > 0
          ? `Added ${added} team(s) to the selected league.\n\nSeason roster warnings:\n- ${warnings.slice(0, 5).join("\n- ")}${warnings.length > 5 ? `\n- ${warnings.length - 5} more warning(s)` : ""}\n\nA player can only belong to one team in the same season, but can play for a different team in another season.`
          : `Added ${added} team(s) to the selected league.`,
    });
  };

  const deleteRegisteredTeam = async (teamId: string) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can delete registered teams.");
      return;
    }
    const team = registeredTeams.find((t) => t.id === teamId);
    if (!team) return;
    const inLeague = teams.some((t) => t.name.trim().toLowerCase() === team.name.trim().toLowerCase());
    if (inLeague) {
      setMessage(`Cannot delete "${team.name}" because it is already used in a league.`);
      return;
    }
    const ok = window.confirm(`Delete registered team "${team.name}"? This will remove team-player assignments.`);
    if (!ok) return;
    const delMembers = await client.from("league_registered_team_members").delete().eq("team_id", teamId);
    if (delMembers.error) {
      setMessage(delMembers.error.message);
      return;
    }
    const delTeam = await client.from("league_registered_teams").delete().eq("id", teamId);
    if (delTeam.error) {
      setMessage(delTeam.error.message);
      return;
    }
    if (registryTeamId === teamId) setRegistryTeamId("");
    await loadAll();
    setInfoModal({ title: "Team Deleted", description: `"${team.name}" was removed from registered teams.` });
  };

  const registerPlayersBulk = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can register players here.");
      return;
    }
    const locationId = newPlayerLocationId;
    if (!locationId) {
      setMessage("Select a location first.");
      return;
    }
    const lines = bulkPlayersText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setMessage("Enter at least one player name (one per line).");
      return;
    }
    const parsed = lines
      .map((line) => {
        const cleaned = line.replace(/\s+/g, " ").trim();
        const commaParts = cleaned.split(",").map((x) => x.trim()).filter(Boolean);
        if (commaParts.length >= 2) return { first: commaParts[0], second: commaParts.slice(1).join(" ") };
        const words = cleaned.split(" ").filter(Boolean);
        if (words.length < 2) return null;
        return { first: words[0], second: words.slice(1).join(" ") };
      })
      .filter(Boolean) as { first: string; second: string }[];
    if (parsed.length === 0) {
      setMessage("Use one player per line: First Last (or First,Last).");
      return;
    }
    let created = 0;
    let addedToTeam = 0;
    const issues: string[] = [];
    const seenFullNames = new Set<string>();
    for (const row of parsed) {
      const fullName = `${row.first.trim()} ${row.second.trim()}`.trim();
      const displayName = fullName;
      const normalizedFullName = fullName.toLowerCase();
      if (seenFullNames.has(normalizedFullName)) {
        issues.push(`${fullName}: entered more than once in this batch`);
        continue;
      }
      seenFullNames.add(normalizedFullName);
      const existingPlayer = findExistingPlayerRecord(fullName);
      if (existingPlayer) {
        issues.push(describeExistingPlayerPlacement(existingPlayer));
        continue;
      }
      const playerInsert = await client
        .from("players")
        .insert({
          display_name: displayName,
          first_name: row.first.trim(),
          nickname: null,
          full_name: fullName,
          is_archived: false,
          location_id: locationId,
        })
        .select("id")
        .single();
      if (playerInsert.error || !playerInsert.data) {
        if (playerInsert.error?.message.includes("players_display_name_lower_uniq")) {
          issues.push(`${fullName}: a player record using that display name already exists. Search for the existing player and add them to the team instead.`);
        } else {
          issues.push(`${fullName}: ${playerInsert.error?.message ?? "create failed"}`);
        }
        continue;
      }
      created += 1;
      if (registryTeamId) {
        const memberInsert = await client.from("league_registered_team_members").insert({
          team_id: registryTeamId,
          player_id: playerInsert.data.id,
          is_captain: false,
          is_vice_captain: false,
        });
        if (memberInsert.error) {
          issues.push(`${fullName}: created, team add failed`);
        } else {
          addedToTeam += 1;
        }
      }
    }
    await loadAll();
    setBulkPlayersText("");
    setInfoModal({
      title: "Bulk Player Register Complete",
      description:
        issues.length > 0
          ? `Created ${created}. Added to team ${addedToTeam}.\n\nThe following names were not created:\n- ${issues.slice(0, 5).join("\n- ")}${issues.length > 5 ? `\n- ${issues.length - 5} more issue(s)` : ""}\n\nIf a player already exists, use the existing player record and add them to the required team.`
          : `Created ${created} player(s)${registryTeamId ? ` and added ${addedToTeam} to selected team` : ""}.`,
    });
  };

  const createRegisteredTeam = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can create teams.");
      return;
    }
    if (!registryVenueId) {
      setMessage("Select a venue.");
      return;
    }
    if (!registryTeamName.trim()) {
      setMessage("Enter a team name.");
      return;
    }
    const { error } = await client.from("league_registered_teams").insert({
      name: registryTeamName.trim(),
      location_id: registryVenueId,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setRegistryTeamName("");
    setRegistryVenueId("");
    await loadAll();
  };

  const createVenue = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can create venues.");
      return;
    }
    const name = newVenueName.trim();
    if (!name) {
      setMessage("Enter a venue name.");
      return;
    }
    const { data, error } = await client.from("locations").insert({ name }).select("id").single();
    if (error) {
      if (error.message?.includes("locations_name_key")) {
        setInfoModal({
          title: "Venue Already Exists",
          description: `"${name}" is already registered. Select it from the venue list below.`,
        });
      } else {
        setMessage(error.message);
      }
      return;
    }
    setNewVenueName("");
    setRegistryVenueId(data.id);
    setNewPlayerLocationId(data.id);
    await loadAll();
    setInfoModal({ title: "Venue Registered", description: `${name} was added.` });
  };

  const saveVenueDetails = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can update venue details.");
      return;
    }
    if (!manageVenueId) {
      setMessage("Select a venue first.");
      return;
    }
    const cleanName = manageVenueName.trim();
    if (!cleanName) {
      setMessage("Venue name is required.");
      return;
    }
    const { error } = await client
      .from("locations")
      .update({
        name: cleanName,
        address: [manageVenueAddress.trim(), manageVenuePostcode.trim()].filter(Boolean).join(" | ") || null,
        contact_phone: manageVenuePhone.trim() || null,
        contact_email: manageVenueEmail.trim() || null,
      })
      .eq("id", manageVenueId);
    if (error) {
      if (error.message?.includes("locations_name_key")) {
        setInfoModal({
          title: "Venue Already Exists",
          description: `"${cleanName}" already exists. Use a different venue name.`,
        });
      } else {
        setMessage(error.message);
      }
      return;
    }
    await loadAll();
    setInfoModal({ title: "Venue Updated", description: "Venue details saved." });
  };

  const removeRegisteredMember = async (memberId: string) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can remove team players.");
      return;
    }
    const { error } = await client.from("league_registered_team_members").delete().eq("id", memberId);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
  };

  const registerPlayerForClub = async (addToSelectedTeam: boolean) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can register players.");
      return;
    }
    const first = newPlayerFirstName.trim();
    const second = newPlayerSecondName.trim();
    if (!first || !second) {
      setMessage("Enter first and second name.");
      return;
    }
    if (!newPlayerLocationId) {
      setMessage("Select a location for the new player.");
      return;
    }
    const fullName = `${first} ${second}`;
    const displayName = fullName;
    const existingPlayer = findExistingPlayerRecord(fullName);
    if (existingPlayer) {
      setInfoModal({
        title: "Player Already Exists",
        description: `${describeExistingPlayerPlacement(existingPlayer)} Use the existing player record instead of creating a new one.`,
      });
      return;
    }
    const playerInsert = await client
      .from("players")
      .insert({
        display_name: displayName,
        first_name: first,
        nickname: null,
        full_name: fullName,
        is_archived: false,
        location_id: newPlayerLocationId,
      })
      .select("id")
      .single();
    if (playerInsert.error) {
      if (playerInsert.error.message.includes("players_display_name_lower_uniq")) {
        setInfoModal({
          title: "Player Already Exists",
          description: `A player record using the name "${displayName}" already exists. Search for the existing player and add them to the team instead of creating a new player.`,
        });
        return;
      }
      setMessage(`Failed to register player: ${playerInsert.error.message}`);
      return;
    }
    if (addToSelectedTeam) {
      if (!registryTeamId) {
        setMessage("Player created for club. Select a team to add them.");
        await loadAll();
        return;
      }
      const selectedTeam = registeredTeams.find((t) => t.id === registryTeamId);
      if (!selectedTeam || selectedTeam.location_id !== newPlayerLocationId) {
        setMessage("Selected team must be at the same venue as the player.");
        await loadAll();
        return;
      }
      const memberInsert = await client.from("league_registered_team_members").insert({
        team_id: registryTeamId,
        player_id: playerInsert.data.id,
        is_captain: false,
        is_vice_captain: false,
      });
      if (memberInsert.error) {
        setMessage(`Player was created, but could not be added to team: ${memberInsert.error.message}`);
        return;
      }
    }
    setNewPlayerFirstName("");
    setNewPlayerSecondName("");
    setNewPlayerLocationId("");
    await loadAll();
    setInfoModal({
      title: "Player Registered",
      description: addToSelectedTeam
        ? `${fullName} was created for the club and added to the selected team.`
        : `${fullName} was created for the selected club.`,
    });
  };

  const transferPlayerClubTeam = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can transfer players.");
      return;
    }
    if (!transferFromVenueId) {
      setMessage("Select current venue first.");
      return;
    }
    if (!transferPlayerId) {
      setMessage("Select a player to transfer.");
      return;
    }
    if (!transferVenueId) {
      setMessage("Select the destination venue.");
      return;
    }
    if (!transferDestinationTeamId) {
      setMessage("Select the destination team.");
      return;
    }
    const selectedTeam = registeredTeams.find((t) => t.id === transferDestinationTeamId);
    if (!selectedTeam || selectedTeam.location_id !== transferVenueId) {
      setMessage("Destination team must belong to the selected destination venue.");
      return;
    }
    if (transferFromVenueId !== transferVenueId) {
      const updatePlayer = await client.from("players").update({ location_id: transferVenueId }).eq("id", transferPlayerId);
      if (updatePlayer.error) {
        setMessage(`Failed to update player venue: ${updatePlayer.error.message}`);
        return;
      }
    }
    const removeFromTeams = await client.from("league_registered_team_members").delete().eq("player_id", transferPlayerId);
    if (removeFromTeams.error) {
      setMessage(`Venue updated, but failed to remove old team links: ${removeFromTeams.error.message}`);
      return;
    }
    const addToDestinationTeam = await client
      .from("league_registered_team_members")
      .insert({
        team_id: transferDestinationTeamId,
        player_id: transferPlayerId,
        is_captain: false,
        is_vice_captain: false,
      });
    if (addToDestinationTeam.error) {
      setMessage(`Club/venue updated, but failed to add to destination team: ${addToDestinationTeam.error.message}`);
      return;
    }
    await loadAll();
    const playerName = named(playerById.get(transferPlayerId));
    const venueName = locationLabel(locations.find((l) => l.id === transferVenueId)?.name ?? "selected venue");
    const teamName = registeredTeams.find((t) => t.id === transferDestinationTeamId)?.name ?? "selected team";
    setInfoModal({
      title: "Transfer Complete",
      description: `${playerName} moved to ${venueName} and was assigned to ${teamName} in the registered-team template. Existing published season team memberships were not changed.`,
    });
    setTransferFromVenueId("");
    setTransferPlayerId("");
    setTransferVenueId("");
    setTransferDestinationTeamId("");
  };

  const createFixture = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can manage fixtures.");
      return;
    }
    if (!seasonId || !fixtureHome || !fixtureAway) {
      setMessage("Select league, home team, and away team.");
      return;
    }
    if (fixtureHome === fixtureAway) {
      setMessage("Home and away teams must be different.");
      return;
    }
    const season = seasons.find((s) => s.id === seasonId);
    if (!season) return;
    const ins = await client
      .from("league_fixtures")
      .insert({
        season_id: seasonId,
        location_id: season.location_id,
        week_no: fixtureWeek ? Number.parseInt(fixtureWeek, 10) : null,
        fixture_date: fixtureDate || null,
        home_team_id: fixtureHome,
        away_team_id: fixtureAway,
      })
      .select("id")
      .single();
    if (ins.error) {
      setMessage(ins.error.message);
      return;
    }
    setFixtureWeek("");
    setFixtureDate("");
    setFixtureHome("");
    setFixtureAway("");
    setFixtureId(ins.data.id);
    await loadAll();
  };

  const generateFixtures = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can generate fixtures.");
      return;
    }
    if (!seasonId) {
      setMessage("Select a league first.");
      return;
    }
    const getBreakWeeksFromDates = (): number[] => {
      if (!genStartDate || breakDates.length === 0) return [];
      const start = new Date(`${genStartDate}T12:00:00`);
      const values = new Set<number>();
      for (const d of breakDates) {
        const dt = new Date(`${d}T12:00:00`);
        const diffDays = Math.floor((dt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const weekNo = Math.floor(diffDays / 7) + 1;
        if (Number.isInteger(weekNo) && weekNo > 0) values.add(weekNo);
      }
      return Array.from(values).sort((a, b) => a - b);
    };
    if (!genStartDate && breakDates.length > 0) {
      setMessage("Select a start date before adding reserved weeks.");
      return;
    }
    const { data, error } = await client.rpc("generate_league_fixtures", {
      p_season_id: seasonId,
      p_start_date: genStartDate || null,
      p_double_round: genDoubleRound,
      p_clear_existing: genClearExisting,
      p_break_weeks: getBreakWeeksFromDates(),
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
    setInfoModal({
      title: "Fixtures Generated",
      description: `Generated ${Number(data ?? 0)} fixtures for the selected league.`,
    });
  };

  const applyBreakWeeksToExisting = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can update fixture dates.");
      return;
    }
    if (!seasonId) {
      setMessage("Select a league first.");
      return;
    }
    if (!genStartDate) {
      setMessage("Enter a start date first.");
      return;
    }
    const start = new Date(`${genStartDate}T12:00:00`);
    const values = new Set<number>();
    for (const d of breakDates) {
      const dt = new Date(`${d}T12:00:00`);
      const diffDays = Math.floor((dt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const weekNo = Math.floor(diffDays / 7) + 1;
      if (Number.isInteger(weekNo) && weekNo > 0) values.add(weekNo);
    }
    const breakWeeks = Array.from(values).sort((a, b) => a - b);
    const { data, error } = await client.rpc("recalculate_league_fixture_dates", {
      p_season_id: seasonId,
      p_start_date: genStartDate,
      p_break_weeks: breakWeeks,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
    setInfoModal({
      title: "Fixture Dates Updated",
      description: `Updated ${Number(data ?? 0)} fixtures.`,
    });
  };

  const addBreakDate = () => {
    if (!breakDateInput) return;
    if (!genStartDate) {
      setMessage("Select a start date before adding reserved weeks.");
      return;
    }
    if (breakDates.includes(breakDateInput)) return;
    setBreakDates((prev) => [...prev, breakDateInput].sort((a, b) => a.localeCompare(b)));
    setBreakDateInput("");
  };

  const removeBreakDate = (dateValue: string) => {
    setBreakDates((prev) => prev.filter((d) => d !== dateValue));
  };

  const deriveWinnerFromFrame = (row: FrameSlot): "home" | "away" | null => {
    if (row.home_forfeit && row.away_forfeit) return null;
    if (row.home_forfeit && !row.away_forfeit) return "away";
    if (row.away_forfeit && !row.home_forfeit) return "home";

    if (row.slot_type === "doubles") {
      const homeReady = Boolean(row.home_player1_id) && Boolean(row.home_player2_id);
      const awayReady = Boolean(row.away_player1_id) && Boolean(row.away_player2_id);
      if (!homeReady || !awayReady) return null;
    } else {
      const homeReady = row.home_nominated ? true : Boolean(row.home_player1_id);
      const awayReady = row.away_nominated ? true : Boolean(row.away_player1_id);
      if (!homeReady || !awayReady) return null;
    }

    const homePts = typeof row.home_points_scored === "number" ? row.home_points_scored : null;
    const awayPts = typeof row.away_points_scored === "number" ? row.away_points_scored : null;
    if (homePts === null || awayPts === null) return null;
    if (row.slot_type === "doubles") {
      const fixture = fixtureById.get(row.fixture_id);
      const season = fixture ? seasonById.get(fixture.season_id) : null;
      if (season?.handicap_enabled) {
        const playerHcp = (playerId: string | null | undefined) => Number(playerById.get(playerId ?? "")?.snooker_handicap ?? 0);
        const homeHandicap = (playerHcp(row.home_player1_id) + playerHcp(row.home_player2_id)) / 2;
        const awayHandicap = (playerHcp(row.away_player1_id) + playerHcp(row.away_player2_id)) / 2;
        const adjusted = calculateAdjustedScoresWithCap(homePts, awayPts, homeHandicap, awayHandicap);
        if (adjusted.homeAdjusted > adjusted.awayAdjusted) return "home";
        if (adjusted.awayAdjusted > adjusted.homeAdjusted) return "away";
        return null;
      }
    }
    if (homePts > awayPts) return "home";
    if (awayPts > homePts) return "away";
    return null;
  };

  const doublesHandicapLabel = (slot: FrameSlot) => {
    const playerHcp = (playerId: string | null | undefined) => Number(playerById.get(playerId ?? "")?.snooker_handicap ?? 0);
    const home = (playerHcp(slot.home_player1_id) + playerHcp(slot.home_player2_id)) / 2;
    const away = (playerHcp(slot.away_player1_id) + playerHcp(slot.away_player2_id)) / 2;
    const starts = calculateAdjustedScoresWithCap(0, 0, home, away);
    if (starts.homeStart > 0) return `Doubles handicap: Home receives ${starts.homeStart} start`;
    if (starts.awayStart > 0) return `Doubles handicap: Away receives ${starts.awayStart} start`;
    return "Doubles handicap: Level start";
  };

  const updateFrameWithDerivedWinner = async (slot: FrameSlot, patch: Partial<FrameSlot>) => {
    if (!canManage && !canSubmitCurrentFixture) {
      setMessage("You can only update fixtures for your own team.");
      return;
    }
    if (!canManage && currentFixture && slot.fixture_id !== currentFixture.id) {
      setMessage("Select the current fixture before editing.");
      return;
    }
    const merged = { ...slot, ...patch } as FrameSlot;
    await updateSlot(slot.id, { ...patch, winner_side: deriveWinnerFromFrame(merged) }, { localOnly: !canManage });
  };

  const getSinglesSelectionValue = (slot: FrameSlot, side: "home" | "away") => {
    const playerId = side === "home" ? slot.home_player1_id : slot.away_player1_id;
    const nominated = side === "home" ? slot.home_nominated : slot.away_nominated;
    const forfeit = side === "home" ? slot.home_forfeit : slot.away_forfeit;
    if (forfeit) return "__NO_SHOW__";
    if (nominated) return "__NOMINATED__";
    return playerId ?? "";
  };

  const applySinglesSelection = async (
    slot: FrameSlot,
    side: "home" | "away",
    selection: string
  ) => {
    const sidePrefix = side === "home" ? "home" : "away";
    const nameKey = side === "home" ? "home_nominated_name" : "away_nominated_name";
    if (selection === "__NO_SHOW__") {
      setNominatedNames((prev) => ({ ...prev, [`${slot.id}:${side}`]: "" }));
      await updateFrameWithDerivedWinner(slot, {
        [`${sidePrefix}_player1_id`]: null,
        [`${sidePrefix}_nominated`]: false,
        [`${sidePrefix}_forfeit`]: true,
        [`${sidePrefix}_points_scored`]: 0,
        [side === "home" ? "away_points_scored" : "home_points_scored"]: 0,
        [nameKey]: null,
      } as Partial<FrameSlot>);
      return;
    }
    if (selection === "__NOMINATED__") {
      await updateFrameWithDerivedWinner(slot, {
        [`${sidePrefix}_player1_id`]: null,
        [`${sidePrefix}_nominated`]: true,
        [`${sidePrefix}_forfeit`]: false,
      } as Partial<FrameSlot>);
      return;
    }
    setNominatedNames((prev) => ({ ...prev, [`${slot.id}:${side}`]: "" }));
    await updateFrameWithDerivedWinner(slot, {
      [`${sidePrefix}_player1_id`]: selection || null,
      [`${sidePrefix}_nominated`]: false,
      [`${sidePrefix}_forfeit`]: false,
      [nameKey]: null,
    } as Partial<FrameSlot>);
  };

  const updateFramePoints = async (slot: FrameSlot, side: "home" | "away", rawValue: string) => {
    const parsedRaw = rawValue === "" ? null : Number.parseInt(rawValue, 10);
    const parsed = parsedRaw === null || Number.isNaN(parsedRaw) ? null : Math.min(200, Math.max(0, parsedRaw));
    const field = side === "home" ? "home_points_scored" : "away_points_scored";
    await updateFrameWithDerivedWinner(slot, { [field]: slot.home_forfeit || slot.away_forfeit ? 0 : parsed } as Partial<FrameSlot>);
  };

  const updateNominatedName = async (slot: FrameSlot, side: "home" | "away", value: string) => {
    if (!canManage && !canSubmitCurrentFixture) {
      setMessage("You can only update fixtures for your own team.");
      return;
    }
    const key = `${slot.id}:${side}`;
    setNominatedNames((prev) => ({ ...prev, [key]: value }));
    const column = side === "home" ? "home_nominated_name" : "away_nominated_name";
    if (!canManage) {
      await updateSlot(slot.id, { [column]: value.trim() || null } as Partial<FrameSlot>, { localOnly: true });
      return;
    }
    const client = supabase;
    if (!client) return;
    const { error } = await client
      .from("league_fixture_frames")
      .update({ [column]: value.trim() || null } as Record<string, string | null>)
      .eq("id", slot.id);
    if (error) {
      setMessage(error.message);
    }
  };

  const setBreakField = (idx: number, patch: Partial<LeagueBreak>) => {
    setFixtureBreaks((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addBreakRow = () => {
    setFixtureBreaks((prev) => [...prev, { player_id: null, entered_player_name: "", break_value: "" }]);
  };

  const getValidatedBreakRows = () => {
    const valid = fixtureBreaks
      .map((r) => ({
        player_id: r.player_id || null,
        entered_player_name: r.entered_player_name.trim() || null,
        break_value: Number(r.break_value || 0),
      }))
      .filter((r) => Number.isFinite(r.break_value) && r.break_value >= 30 && (r.player_id || r.entered_player_name));

    const pointsByPlayer = new Map<string, number>();
    for (const slot of fixtureSlots) {
      const homePoints = typeof slot.home_points_scored === "number" ? slot.home_points_scored : 0;
      const awayPoints = typeof slot.away_points_scored === "number" ? slot.away_points_scored : 0;
      const homePlayers = [slot.home_player1_id, slot.home_player2_id].filter(Boolean) as string[];
      const awayPlayers = [slot.away_player1_id, slot.away_player2_id].filter(Boolean) as string[];
      for (const id of homePlayers) pointsByPlayer.set(id, Math.max(pointsByPlayer.get(id) ?? 0, homePoints));
      for (const id of awayPlayers) pointsByPlayer.set(id, Math.max(pointsByPlayer.get(id) ?? 0, awayPoints));
    }
    for (const row of valid) {
      if (!row.player_id) continue;
      const maxFramePoints = pointsByPlayer.get(row.player_id);
      if (maxFramePoints === undefined) {
        return { error: "Break entry failed: selected player is not part of this fixture.", rows: [] as SubmissionBreakEntry[] };
      }
      if (row.break_value > maxFramePoints) {
        return {
          error: `Break entry failed: ${row.break_value} exceeds the player's frame points (${maxFramePoints}).`,
          rows: [] as SubmissionBreakEntry[],
        };
      }
    }
    return { error: null, rows: valid as SubmissionBreakEntry[] };
  };

  const saveFixtureBreaks = async () => {
    const client = supabase;
    if (!client || !fixtureId) return;
    const activeFixture = seasonFixtures.find((f) => f.id === fixtureId) ?? null;
    if (activeFixture?.status === "complete") {
      setMessage("This fixture is locked because it is complete.");
      return;
    }
    if (!breaksFeatureAvailable) {
      setMessage("Breaks 30+ table is not available yet. Run the league breaks SQL migration.");
      return;
    }
    const breakRows = getValidatedBreakRows();
    if (breakRows.error) {
      setMessage(breakRows.error);
      return;
    }
    if (!canManage) {
      setInfoModal({ title: "Breaks Staged", description: "Break entries will be included when you submit for approval." });
      return;
    }

    const del = await client.from("league_fixture_breaks").delete().eq("fixture_id", fixtureId);
    if (del.error) {
      setMessage(del.error.message);
      return;
    }
    if (breakRows.rows.length) {
      const ins = await client.from("league_fixture_breaks").insert(
        breakRows.rows.map((r) => ({
          fixture_id: fixtureId,
          player_id: r.player_id,
          entered_player_name: r.entered_player_name,
          break_value: r.break_value,
        }))
      );
      if (ins.error) {
        setMessage(ins.error.message);
        return;
      }
    }
    await loadAll();
    setInfoModal({ title: "Breaks Saved", description: "Breaks 30+ have been recorded for this fixture." });
  };

  const recalculateSnookerHandicapsFromElo = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can recalculate handicaps.");
      return;
    }
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token ?? null;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setRecalculatingHandicaps(true);
    let res: Response;
    try {
      res = await fetch("/api/league/recalculate-handicaps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      setRecalculatingHandicaps(false);
      setMessage("Network error while recalculating handicaps.");
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string; reviewed?: number; changed?: number };
    setRecalculatingHandicaps(false);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to recalculate handicaps.");
      return;
    }
    setInfoModal({
      title: "Handicaps Recalculated",
      description: `${payload.changed ?? 0} player handicaps updated from current Elo ratings.`,
    });
    await loadAll();
  };

  const recomputeFixtureScore = async (fixtureTargetId: string) => {
    const client = supabase;
    if (!client) return;
    const previousFixture = fixtures.find((f) => f.id === fixtureTargetId) ?? null;
    const framesRes = await client
      .from("league_fixture_frames")
      .select("slot_no,winner_side,home_forfeit,away_forfeit,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_points_scored,away_points_scored")
      .eq("fixture_id", fixtureTargetId);
    if (framesRes.error) {
      setMessage(framesRes.error.message);
      return;
    }
    const frameRows = (framesRes.data ?? []) as Array<{
      slot_no: number;
      winner_side: "home" | "away" | null;
      home_forfeit: boolean;
      away_forfeit: boolean;
      home_player1_id: string | null;
      home_player2_id: string | null;
      away_player1_id: string | null;
      away_player2_id: string | null;
      home_points_scored?: number | null;
      away_points_scored?: number | null;
    }>;
    const fixtureSeasonId = fixtures.find((f) => f.id === fixtureTargetId)?.season_id ?? null;
    const season = fixtureSeasonId ? seasonById.get(fixtureSeasonId) : null;
    const cfg = getSeasonFrameConfig(season);
    const { homePoints, awayPoints } = calculateFixturePoints(frameRows, season);
    const expectedSlotNos = new Set(
      frameRows
        .map((r) => r.slot_no)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.total)
    );
    const completedSlotNos = new Set(
      frameRows
        .filter((r) => r.winner_side !== null || r.home_forfeit || r.away_forfeit)
        .map((r) => r.slot_no)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.total)
    );
    const expectedCount = expectedSlotNos.size || cfg.total;
    const completedCount = completedSlotNos.size;
    const status: Fixture["status"] =
      completedCount === 0 ? "pending" : completedCount >= expectedCount ? "complete" : "in_progress";
    const { data: fixtureRow, error: fixtureErr } = await client
      .from("league_fixtures")
      .update({ home_points: homePoints, away_points: awayPoints, status })
      .eq("id", fixtureTargetId)
      .select("id,season_id,location_id,week_no,fixture_date,home_team_id,away_team_id,status,home_points,away_points")
      .single();
    if (fixtureErr) {
      setMessage(fixtureErr.message);
      return;
    }
    setFixtures((prev) => prev.map((f) => (f.id === fixtureTargetId ? ({ ...f, ...(fixtureRow as Fixture) }) : f)));
    };

  const computeFixtureProgress = (fixtureValue: Fixture) => {
    const frameRows = fixtureSlotsByFixtureId.get(fixtureValue.id) ?? [];
    const season = seasonById.get(fixtureValue.season_id);
    const cfg = getSeasonFrameConfig(season);
    const { homePoints, awayPoints } = calculateFixturePoints(frameRows, season);
    const expectedSlotNos = new Set(
      frameRows
        .map((r) => r.slot_no)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.total)
    );
    const completedSlotNos = new Set(
      frameRows
        .filter((r) => r.winner_side !== null || r.home_forfeit || r.away_forfeit)
        .map((r) => r.slot_no)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= cfg.total)
    );
    const expectedCount = expectedSlotNos.size || cfg.total;
    const completedCount = completedSlotNos.size;
    const status: Fixture["status"] =
      completedCount === 0 ? "pending" : completedCount >= expectedCount ? "complete" : "in_progress";
    return { homePoints, awayPoints, status, completedCount, expectedCount };
  };

  useEffect(() => {
    const client = supabase;
    if (!client || !canManage || activeView !== "fixtures" || !seasonId || statusBackfillSeasonId === seasonId) return;
    let cancelled = false;
    const run = async () => {
      const targets = seasonFixtures.filter((f) => {
        const computed = computeFixtureProgress(f);
        return (
          f.status !== computed.status ||
          f.home_points !== computed.homePoints ||
          f.away_points !== computed.awayPoints
        );
      });
      for (const f of targets) {
        if (cancelled) return;
        const computed = computeFixtureProgress(f);
        const { error } = await client
          .from("league_fixtures")
          .update({
            status: computed.status,
            home_points: computed.homePoints,
            away_points: computed.awayPoints,
          })
          .eq("id", f.id);
        if (error) {
          setMessage(error.message);
          return;
        }
      }
      setStatusBackfillSeasonId(seasonId);
      if (!cancelled && targets.length > 0) await loadAll();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeView, canManage, seasonId, statusBackfillSeasonId, seasonFixtures, fixtureSlotsByFixtureId]);

  const updateSlot = async (slotId: string, patch: Partial<FrameSlot>, opts?: { localOnly?: boolean }) => {
    const existingSlot = slots.find((s) => s.id === slotId) ?? null;
    const targetFixtureId = existingSlot?.fixture_id ?? null;
    const targetFixture = targetFixtureId ? seasonFixtures.find((f) => f.id === targetFixtureId) ?? null : null;
    if (targetFixture?.status === "complete") {
      setMessage("This fixture is locked because it is complete.");
      return;
    }
    if (opts?.localOnly) {
      setSlots((prev) => prev.map((s) => (s.id === slotId ? ({ ...s, ...patch }) : s)));
      return;
    }
    const client = supabase;
    if (!client) return;
    const { data, error } = await client
      .from("league_fixture_frames")
      .update(patch)
      .eq("id", slotId)
      .select("id,fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated,away_nominated,home_forfeit,away_forfeit,winner_side,home_nominated_name,away_nominated_name,home_points_scored,away_points_scored")
      .single();
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data) {
      setSlots((prev) => prev.map((s) => (s.id === slotId ? ({ ...s, ...(data as FrameSlot) }) : s)));
      await recomputeFixtureScore((data as FrameSlot).fixture_id);
    }
  };

  const syncRegisteredRoleToLeagueTeams = async (
    member: RegisteredTeamMember,
    patch: { is_captain: boolean; is_vice_captain: boolean },
    clearField: "is_captain" | "is_vice_captain" | null
  ) => {
    const client = supabase;
    if (!client) return null;
    const registeredTeam = registeredTeams.find((team) => team.id === member.team_id);
    if (!registeredTeam) return null;
    const matchingLeagueTeams = teams.filter((team) => team.name.trim().toLowerCase() === registeredTeam.name.trim().toLowerCase());
    if (matchingLeagueTeams.length === 0) return null;
    const leagueTeamIds = matchingLeagueTeams.map((team) => team.id);
    if (clearField) {
      const clearRes = await client.from("league_team_members").update({ [clearField]: false }).in("team_id", leagueTeamIds);
      if (clearRes.error) return clearRes.error.message;
    }
    const updateRes = await client
      .from("league_team_members")
      .update(patch)
      .eq("player_id", member.player_id)
      .in("team_id", leagueTeamIds);
    return updateRes.error?.message ?? null;
  };

  const setRegisteredCaptain = async (member: RegisteredTeamMember, next: boolean) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can set captain roles.");
      return;
    }
    if (next) {
      const clear = await client.from("league_registered_team_members").update({ is_captain: false }).eq("team_id", member.team_id);
      if (clear.error) {
        setMessage(clear.error.message);
        return;
      }
    }
    const { error } = await client
      .from("league_registered_team_members")
      .update({ is_captain: next, is_vice_captain: next ? false : member.is_vice_captain })
      .eq("id", member.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    const liveSyncError = await syncRegisteredRoleToLeagueTeams(
      member,
      { is_captain: next, is_vice_captain: next ? false : member.is_vice_captain },
      next ? "is_captain" : null
    );
    if (liveSyncError) {
      setMessage(liveSyncError);
      return;
    }
    await loadAll();
  };

  const setRegisteredViceCaptain = async (member: RegisteredTeamMember, next: boolean) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can set vice-captain roles.");
      return;
    }
    if (next) {
      const clear = await client.from("league_registered_team_members").update({ is_vice_captain: false }).eq("team_id", member.team_id);
      if (clear.error) {
        setMessage(clear.error.message);
        return;
      }
    }
    const { error } = await client
      .from("league_registered_team_members")
      .update({ is_vice_captain: next, is_captain: next ? false : member.is_captain })
      .eq("id", member.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    const liveSyncError = await syncRegisteredRoleToLeagueTeams(
      member,
      { is_vice_captain: next, is_captain: next ? false : member.is_captain },
      next ? "is_vice_captain" : null
    );
    if (liveSyncError) {
      setMessage(liveSyncError);
      return;
    }
    await loadAll();
  };

  const addPlayersToSeasonRoster = async (playerIds: string[]) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can edit season rosters.");
      return;
    }
    if (!seasonId || !seasonRosterTeamId) {
      setMessage("Select a league and team first.");
      return;
    }
    if (playerIds.length === 0) {
      setMessage("Select at least one player to add to the season roster.");
      return;
    }
    const conflicts = playerIds
      .map((playerId) => {
        const existingMemberships = (seasonMembershipByPlayer.get(playerId) ?? []).filter(
          (member) => member.team_id !== seasonRosterTeamId
        );
        if (existingMemberships.length === 0) return null;
        const teamNames = Array.from(
          new Set(existingMemberships.map((member) => teamById.get(member.team_id)?.name).filter(Boolean) as string[])
        ).sort((a, b) => a.localeCompare(b));
        return `${named(playerById.get(playerId))} is already assigned in this league season to ${teamNames.join(", ")}.`;
      })
      .filter((value): value is string => Boolean(value));
    if (conflicts.length > 0) {
      setInfoModal({
        title: "Season Roster Conflict",
        description: conflicts.slice(0, 5).join("\n"),
      });
      return;
    }
    const insert = await client.from("league_team_members").insert(
      playerIds.map((playerId) => ({
        season_id: seasonId,
        team_id: seasonRosterTeamId,
        player_id: playerId,
        is_captain: false,
        is_vice_captain: false,
      }))
    );
    if (insert.error) {
      setMessage(insert.error.message);
      return;
    }
    await loadAll();
    setSeasonRosterPlayerId("");
    setSeasonRosterBulkPlayerIds([]);
  };

  const addSeasonRosterPlayer = async () => {
    if (!seasonRosterPlayerId) {
      setMessage("Select a player to add to the season roster.");
      return;
    }
    await addPlayersToSeasonRoster([seasonRosterPlayerId]);
  };

  const addSeasonRosterPlayersBulk = async () => {
    await addPlayersToSeasonRoster(seasonRosterBulkPlayerIds);
  };

  const removeSeasonRosterMember = async (memberId: string) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can edit season rosters.");
      return;
    }
    const { error } = await client.from("league_team_members").delete().eq("id", memberId);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
  };

  const setSeasonRosterRole = async (
    member: TeamMember,
    patch: { is_captain: boolean; is_vice_captain: boolean },
    clearField: "is_captain" | "is_vice_captain" | null
  ) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can set season roster roles.");
      return;
    }
    if (clearField) {
      const clear = await client.from("league_team_members").update({ [clearField]: false }).eq("team_id", member.team_id);
      if (clear.error) {
        setMessage(clear.error.message);
        return;
      }
    }
    const update = await client.from("league_team_members").update(patch).eq("id", member.id);
    if (update.error) {
      setMessage(update.error.message);
      return;
    }
    await loadAll();
  };

  const updateHandicap = async (mode: "set_current" | "set_base_and_current" | "adjust_current", explicitValue?: number) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) return setMessage("Only Super User can update handicaps.");
    if (!handicapPlayerId) return setMessage("Select a player first.");
    const numeric = Number.isFinite(explicitValue ?? Number.NaN) ? Number(explicitValue) : Number(handicapTargetValue);
    if (!Number.isFinite(numeric)) return setMessage("Enter a valid handicap value.");
    setSavingHandicap(true);
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token ?? null;
    if (!token) {
      setSavingHandicap(false);
      return setMessage("Session expired. Please sign in again.");
    }
    let res: Response;
    try {
      res = await fetch("/api/league/handicap-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          playerId: handicapPlayerId,
          mode,
          value: numeric,
          reason: handicapReason.trim() || null,
        }),
      });
    } catch {
      setSavingHandicap(false);
      return setMessage("Network error while updating handicap.");
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setSavingHandicap(false);
    if (!res.ok) return setMessage(payload.error ?? "Failed to update handicap.");
    setInfoModal({ title: "Handicap Updated", description: "Player handicap was updated and logged in history." });
    setHandicapReason("");
    await loadAll();
  };

  const submitFixtureResult = async () => {
    const client = supabase;
    if (!client) return;
    if (canManage) {
      setMessage("Super User updates fixtures directly. No submission is required.");
      return;
    }
    if (!currentFixture || !currentUserId) {
      setMessage("Select fixture first.");
      return;
    }
    if (!canSubmitCurrentFixture) {
      setMessage("You can submit only fixtures for your own team.");
      return;
    }
    if (pendingSubmissionByFixtureId.has(currentFixture.id)) {
      setMessage("A result submission is already pending for this fixture.");
      return;
    }
    const frameResults: SubmissionFrameResult[] = fixtureSlots.map((s) => ({
      slot_no: s.slot_no,
      slot_type: s.slot_type,
      winner_side: deriveWinnerFromFrame(s),
      home_player1_id: s.home_player1_id ?? null,
      home_player2_id: s.home_player2_id ?? null,
      away_player1_id: s.away_player1_id ?? null,
      away_player2_id: s.away_player2_id ?? null,
      home_nominated: Boolean(s.home_nominated),
      away_nominated: Boolean(s.away_nominated),
      home_forfeit: Boolean(s.home_forfeit),
      away_forfeit: Boolean(s.away_forfeit),
      home_nominated_name: s.home_nominated_name ?? null,
      away_nominated_name: s.away_nominated_name ?? null,
      home_points_scored: typeof s.home_points_scored === "number" ? s.home_points_scored : null,
      away_points_scored: typeof s.away_points_scored === "number" ? s.away_points_scored : null,
    }));
    const incomplete = frameResults.some((r) => !r.winner_side && !r.home_forfeit && !r.away_forfeit);
    if (incomplete) {
      setMessage("Complete all frames before submitting for approval.");
      return;
    }
    const breakRows = getValidatedBreakRows();
    if (breakRows.error) {
      setMessage(breakRows.error);
      return;
    }
    if (frameResults.length > 0) frameResults[0].break_entries = breakRows.rows;
    const submitterTeamId =
      currentFixture && captainTeamIds.has(currentFixture.home_team_id)
        ? currentFixture.home_team_id
        : currentFixture && captainTeamIds.has(currentFixture.away_team_id)
          ? currentFixture.away_team_id
          : null;
    const { error } = await client.from("league_result_submissions").insert({
      fixture_id: currentFixture.id,
      season_id: currentFixture.season_id,
      location_id: currentFixture.location_id,
      submitted_by_user_id: currentUserId,
      submitter_team_id: submitterTeamId,
      frame_results: frameResults,
      scorecard_photo_url: scorecardPhotoUrl.trim() || null,
      status: "pending",
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
    setInfoModal({ title: "Result Submitted", description: "Fixture result was submitted for approval." });
  };

  const reviewSubmission = async (submissionId: string, decision: "approved" | "rejected") => {
    const client = supabase;
    if (!client) return;
    if (!admin.isAdmin) {
      setMessage("Only Super User can review submissions.");
      return;
    }
    const submission = submissions.find((s) => s.id === submissionId);
    if (!submission) return;
    if (decision === "approved") {
      const pendingBreakRows: SubmissionBreakEntry[] = [];
      for (const item of submission.frame_results ?? []) {
        if (!item?.slot_no) continue;
        if (Array.isArray(item.break_entries)) {
          for (const br of item.break_entries) {
            const breakValue = Number(br?.break_value);
            if (!Number.isFinite(breakValue) || breakValue < 30) continue;
            pendingBreakRows.push({
              player_id: br?.player_id ?? null,
              entered_player_name: br?.entered_player_name ?? null,
              break_value: breakValue,
            });
          }
        }
        const slot = slots.find((s) => s.fixture_id === submission.fixture_id && s.slot_no === item.slot_no);
        if (!slot) continue;
        const patch: Partial<FrameSlot> = {};
        if (item.winner_side === "home" || item.winner_side === "away" || item.winner_side === null) patch.winner_side = item.winner_side;
        if ("home_player1_id" in item) patch.home_player1_id = item.home_player1_id ?? null;
        if ("home_player2_id" in item) patch.home_player2_id = item.home_player2_id ?? null;
        if ("away_player1_id" in item) patch.away_player1_id = item.away_player1_id ?? null;
        if ("away_player2_id" in item) patch.away_player2_id = item.away_player2_id ?? null;
        if ("home_nominated" in item) patch.home_nominated = Boolean(item.home_nominated);
        if ("away_nominated" in item) patch.away_nominated = Boolean(item.away_nominated);
        if ("home_forfeit" in item) patch.home_forfeit = Boolean(item.home_forfeit);
        if ("away_forfeit" in item) patch.away_forfeit = Boolean(item.away_forfeit);
        if ("home_nominated_name" in item) patch.home_nominated_name = item.home_nominated_name ?? null;
        if ("away_nominated_name" in item) patch.away_nominated_name = item.away_nominated_name ?? null;
        if ("home_points_scored" in item) patch.home_points_scored = typeof item.home_points_scored === "number" ? item.home_points_scored : null;
        if ("away_points_scored" in item) patch.away_points_scored = typeof item.away_points_scored === "number" ? item.away_points_scored : null;
        if (Object.keys(patch).length === 0) continue;
        const { error: slotErr } = await client
          .from("league_fixture_frames")
          .update(patch)
          .eq("id", slot.id);
        if (slotErr) {
          setMessage(slotErr.message);
          return;
        }
      }
      if (breaksFeatureAvailable) {
        const del = await client.from("league_fixture_breaks").delete().eq("fixture_id", submission.fixture_id);
        if (del.error) {
          setMessage(del.error.message);
          return;
        }
        if (pendingBreakRows.length > 0) {
          const ins = await client.from("league_fixture_breaks").insert(
            pendingBreakRows.map((br) => ({
              fixture_id: submission.fixture_id,
              player_id: br.player_id,
              entered_player_name: br.entered_player_name,
              break_value: br.break_value,
            }))
          );
          if (ins.error) {
            setMessage(ins.error.message);
            return;
          }
        }
      }
      await recomputeFixtureScore(submission.fixture_id);
    }
    const { error } = await client
      .from("league_result_submissions")
      .update({
        status: decision,
        rejection_reason: decision === "rejected" ? (reviewReason.trim() || "Rejected by reviewer") : null,
        reviewed_by_user_id: admin.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setReviewReason("");
    await loadAll();
    setInfoModal({ title: decision === "approved" ? "Submission Approved" : "Submission Rejected", description: "Review has been saved." });
  };

  const publishFixtures = async () => {
    const client = supabase;
    if (!client) return;
    if (!admin.isSuper || !seasonId || !currentSeason || !admin.userId) {
      setMessage("Only Super User can publish fixtures.");
      return;
    }
    const { error } = await client.from("league_fixture_publications").insert({
      season_id: seasonId,
      location_id: currentSeason.location_id,
      published_by_user_id: admin.userId,
      note: "Fixtures are now published. Captains can submit match-night results.",
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setInfoModal({ title: "Fixtures Published", description: "A notification is now available in user inboxes." });
  };

  const publishLeague = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage || !seasonId) {
      setMessage("Only Super User can publish a league.");
      return;
    }
    const { error } = await client
      .from("league_seasons")
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq("id", seasonId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setInfoModal({ title: "League Published", description: "This league is now visible to admins and users." });
    await loadAll();
  };

  const updateCompetitionSignupSettings = async (
    competitionId: string,
    patch: Partial<Pick<LeagueCompetition, "signup_open" | "signup_deadline" | "final_scheduled_at" | "final_venue_location_id">>
  ) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can manage knockout competitions.");
      return;
    }
    const res = await client.from("competitions").update(patch).eq("id", competitionId);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    await loadAll();
  };

  const updateCompetitionBestOf = async (competitionId: string, bestOfInput: string) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can manage knockout competitions.");
      return;
    }
    const parsed = Number.parseInt(bestOfInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setMessage("Best-of must be a whole number greater than 0.");
      return;
    }
    if (parsed % 2 === 0) {
      setMessage("Best-of must be an odd number (e.g. 1, 3, 5, 7).");
      return;
    }
    const res = await client.from("competitions").update({ best_of: parsed }).eq("id", competitionId);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    await loadAll();
    setInfoModal({ title: "Frames Updated", description: `Best-of updated to ${parsed}.` });
  };

  const updateCompetitionRoundBestOf = async (
    competitionId: string,
    draft: { round1: string; semi_final: string; final: string }
  ) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can manage knockout competitions.");
      return;
    }
    const round1 = Number.parseInt(draft.round1, 10);
    const semi = Number.parseInt(draft.semi_final, 10);
    const final = Number.parseInt(draft.final, 10);
    const values = [round1, semi, final];
    if (values.some((v) => !Number.isFinite(v) || v < 1 || v % 2 === 0)) {
      setMessage("Round best-of values must be odd numbers greater than 0.");
      return;
    }
    if (semi < round1) {
      setMessage("Semi-final best-of cannot be less than opening round.");
      return;
    }
    if (final < semi) {
      setMessage("Final best-of cannot be less than semi-final.");
      return;
    }
    const cfg = { round1, semi_final: semi, final };
    const updComp = await client.from("competitions").update({ best_of: round1, knockout_round_best_of: cfg }).eq("id", competitionId);
    if (updComp.error) {
      setMessage(updComp.error.message);
      return;
    }

    const roundsRes = await client
      .from("matches")
      .select("id,round_no")
      .eq("competition_id", competitionId)
      .order("round_no", { ascending: true });
    if (!roundsRes.error && roundsRes.data && roundsRes.data.length > 0) {
      const rows = roundsRes.data as Array<{ id: string; round_no: number | null }>;
      const totalRounds = Math.max(1, rows.reduce((max, r) => Math.max(max, r.round_no ?? 1), 1));
      const updates = rows.map((m) => {
        const roundNo = m.round_no ?? 1;
        const bestOf = roundNo >= totalRounds ? final : roundNo === totalRounds - 1 ? semi : round1;
        return client.from("matches").update({ best_of: bestOf }).eq("id", m.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        setMessage(failed.error.message);
        return;
      }
    }

    await loadAll();
    setInfoModal({ title: "Round Best-of Updated", description: "Opening, semi-final, and final frame lengths have been saved." });
  };

  const archiveKnockoutCompetition = async (competitionId: string, competitionName: string) => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can delete knockout competitions.");
      return;
    }
    if (!window.confirm(`Delete "${competitionName}"? This will remove it from active competitions.`)) return;
    const res = await client
      .from("competitions")
      .update({ is_archived: true, signup_open: false })
      .eq("id", competitionId);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    await loadAll();
    setInfoModal({ title: "Competition Deleted", description: `"${competitionName}" was removed from active competitions.` });
  };

  const archiveAllKnockoutCompetitions = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can delete knockout competitions.");
      return;
    }
    if (!knockoutCompetitions.length) {
      setInfoModal({ title: "No Competitions", description: "There are no active knockout competitions to delete." });
      return;
    }
    if (!window.confirm(`Delete all ${knockoutCompetitions.length} active knockout competitions?`)) return;
    const ids = knockoutCompetitions.map((c) => c.id);
    const res = await client
      .from("competitions")
      .update({ is_archived: true, signup_open: false })
      .in("id", ids);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    await loadAll();
    setInfoModal({ title: "Competitions Deleted", description: `${ids.length} knockout competitions were removed from active competitions.` });
  };

  const reviewCompetitionEntry = async (entryId: string, status: "approved" | "rejected") => {
    const client = supabase;
    if (!client || !admin.userId) return;
    if (!canManage) {
      setMessage("Only Super User can review entries.");
      return;
    }
    const res = await client
      .from("competition_entries")
      .update({ status, reviewed_by_user_id: admin.userId, reviewed_at: new Date().toISOString() })
      .eq("id", entryId);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    await loadAll();
  };
  const createLeagueKnockoutCompetition = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can create knockout competitions.");
      return;
    }
    const tpl = LEAGUE_KNOCKOUT_TEMPLATES.find((t) => t.key === knockoutTemplateKey);
    if (!tpl) {
      setMessage("Select a competition first.");
      return;
    }
    const seasonLabel = knockoutSeasonLabel.trim();
    if (!seasonLabel) {
      setMessage("Select or enter a season label first (e.g. 2026/2027).");
      return;
    }
    if (!knockoutRound1Deadline.trim()) {
      setMessage("Select the round-1 completion deadline first.");
      return;
    }
    const round1DeadlineIso = localDateTimeInputToIso(knockoutRound1Deadline);
    if (!round1DeadlineIso) {
      setMessage("Enter a valid round-1 completion deadline.");
      return;
    }
    const competitionName = `${tpl.name} - ${seasonLabel}`;

    const existingRes = await client
      .from("competitions")
      .select("id,name")
      .eq("name", competitionName)
      .eq("is_archived", false)
      .limit(1);
    if (existingRes.error) {
      setMessage(existingRes.error.message);
      return;
    }
    if ((existingRes.data ?? []).length > 0) {
      setInfoModal({ title: "Already Exists", description: `"${competitionName}" is already registered.` });
      return;
    }

    const insertRes = await client
      .from("competitions")
      .insert({
      name: competitionName,
      sport_type: tpl.key === "hamilton_cup" || tpl.key === "albery_cup" ? "billiards" : "snooker",
      competition_format: "knockout",
      match_mode: tpl.match_mode,
      best_of: tpl.best_of,
      knockout_round_best_of:
        tpl.key === "hodge_cup"
          ? { round1: 9, semi_final: 9, final: 9 }
          : tpl.key === "hamilton_cup" || tpl.key === "albery_cup"
            ? null
            : { round1: 3, semi_final: 3, final: 3 },
      signup_open: false,
      is_archived: false,
      is_completed: false,
      })
      .select("id")
      .single();
    if (insertRes.error) {
      setMessage(insertRes.error.message);
      return;
    }
    const competitionId = (insertRes.data as { id: string } | null)?.id;
    if (competitionId) {
      const deadlines = deriveRoundDeadlinesFromFirst(round1DeadlineIso);
      if (deadlines.length > 0) {
        const insDeadlines = await client.from("competition_round_deadlines").upsert(
          deadlines.map((d) => ({
            competition_id: competitionId,
            round_no: d.round_no,
            deadline_at: d.deadline_at,
          })),
          { onConflict: "competition_id,round_no" }
        );
        if (insDeadlines.error && !insDeadlines.error.message.toLowerCase().includes("competition_round_deadlines")) {
          setMessage(insDeadlines.error.message);
          return;
        }
      }
    }
    await loadAll();
    setInfoModal({ title: "Knockout Created", description: `"${competitionName}" has been created.` });
  };

  const deleteSeason = async () => {
    const client = supabase;
    if (!client) return;
    if (!canManage) {
      setMessage("Only Super User can delete leagues.");
      return;
    }
    if (!seasonId) {
      setMessage("Select a subdivision first.");
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteSeason = async () => {
    const client = supabase;
    if (!client || !seasonId) return;
    if (!canManage) {
      setMessage("Only Super User can delete leagues.");
      return;
    }
    const { error } = await client.from("league_seasons").delete().eq("id", seasonId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setConfirmDeleteOpen(false);
    setSeasonId("");
    await loadAll();
    setInfoModal({ title: "League Deleted", description: "League and related data were deleted." });
  };

  const seasonTable = useMemo(() => {
    type FormEntry = { sortKey: number; result: "W" | "L" | "D" };
    const stats = new Map<
      string,
      {
        team_id: string;
        team_name: string;
        played: number;
        won: number;
        lost: number;
        frames_for: number;
        frames_against: number;
        points: number;
        form: FormEntry[];
      }
    >();

    for (const t of seasonTeams) {
      stats.set(t.id, {
        team_id: t.id,
        team_name: t.name,
        played: 0,
        won: 0,
        lost: 0,
        frames_for: 0,
        frames_against: 0,
        points: 0,
        form: [],
      });
    }

    for (const f of seasonFixtures) {
      const computed = computeFixtureProgress(f);
      if (computed.status !== "complete") continue;
      const home = stats.get(f.home_team_id);
      const away = stats.get(f.away_team_id);
      if (!home || !away) continue;
      const dateSort = f.fixture_date ? new Date(`${f.fixture_date}T12:00:00`).getTime() : (f.week_no ?? 0) * 7 * 24 * 60 * 60 * 1000;
      const homePts = computed.homePoints;
      const awayPts = computed.awayPoints;

      home.played += 1;
      away.played += 1;
      home.frames_for += homePts;
      home.frames_against += awayPts;
      away.frames_for += awayPts;
      away.frames_against += homePts;
      home.points = home.frames_for;
      away.points = away.frames_for;

      if (homePts > awayPts) {
        home.won += 1;
        away.lost += 1;
        home.form.push({ sortKey: dateSort, result: "W" });
        away.form.push({ sortKey: dateSort, result: "L" });
      } else if (awayPts > homePts) {
        away.won += 1;
        home.lost += 1;
        away.form.push({ sortKey: dateSort, result: "W" });
        home.form.push({ sortKey: dateSort, result: "L" });
      } else {
        home.form.push({ sortKey: dateSort, result: "D" });
        away.form.push({ sortKey: dateSort, result: "D" });
      }
    }

    const rows = Array.from(stats.values()).map((row) => {
      const ordered = row.form.sort((a, b) => a.sortKey - b.sortKey);
      const lastFive = ordered.slice(-5).map((f) => f.result).join(" ");
      let streak = "-";
      if (ordered.length > 0) {
        const last = ordered[ordered.length - 1].result;
        let count = 1;
        for (let i = ordered.length - 2; i >= 0; i -= 1) {
          if (ordered[i].result !== last) break;
          count += 1;
        }
        streak = `${last}${count}`;
      }
      return {
        ...row,
        frame_diff: row.frames_for - row.frames_against,
        streak,
        last_five: lastFive || "-",
      };
    });

    return rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.frame_diff - a.frame_diff ||
        b.frames_for - a.frames_for ||
        a.team_name.localeCompare(b.team_name)
    );
  }, [seasonTeams, seasonFixtures]);
  const selectedTeamRoster = useMemo(() => {
    if (!selectedTableTeamId) return [] as Array<{ id: string; name: string; handicap: number | null; isCaptain: boolean; isViceCaptain: boolean }>;
    const directMembers = members.filter((member) => member.season_id === seasonId && member.team_id === selectedTableTeamId);
    if (directMembers.length > 0) {
      return directMembers
        .map((member) => ({
          id: member.player_id,
          name: named(playerById.get(member.player_id) ?? null),
          handicap: playerById.get(member.player_id)?.snooker_handicap ?? null,
          isCaptain: member.is_captain,
          isViceCaptain: member.is_vice_captain,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const selectedTeam = seasonTeams.find((team) => team.id === selectedTableTeamId) ?? null;
    if (!selectedTeam) return [] as Array<{ id: string; name: string; handicap: number | null; isCaptain: boolean; isViceCaptain: boolean }>;
    const matchingRegisteredTeam = registeredTeams.find(
      (team) =>
        (team.name ?? "").trim().toLowerCase() === (selectedTeam.name ?? "").trim().toLowerCase() &&
        (team.location_id ?? "") === (selectedTeam.location_id ?? "")
    );
    const fallbackMembers = matchingRegisteredTeam
      ? (registeredMembersByTeam.get(matchingRegisteredTeam.id) ?? []).map((member) => ({
          id: member.player_id,
          name: named(playerById.get(member.player_id) ?? null),
          handicap: playerById.get(member.player_id)?.snooker_handicap ?? null,
          isCaptain: member.is_captain,
          isViceCaptain: member.is_vice_captain,
        }))
      : [];
    return fallbackMembers.sort((a, b) => a.name.localeCompare(b.name));
  }, [members, playerById, registeredMembersByTeam, registeredTeams, seasonId, seasonTeams, selectedTableTeamId]);
  const selectedTeamResults = useMemo(() => {
    if (!selectedTableTeamId) return [];
    return seasonFixtures
      .filter((f) => f.home_team_id === selectedTableTeamId || f.away_team_id === selectedTableTeamId)
      .map((f) => {
        const computed = computeFixtureProgress(f);
        const isHome = f.home_team_id === selectedTableTeamId;
        const opponentId = isHome ? f.away_team_id : f.home_team_id;
        const teamScore = isHome ? computed.homePoints : computed.awayPoints;
        const oppScore = isHome ? computed.awayPoints : computed.homePoints;
        const result =
          computed.status === "complete"
            ? teamScore > oppScore
              ? "W"
              : teamScore < oppScore
                ? "L"
                : "D"
            : "-";
        const score = computed.status === "pending" ? "-" : `${teamScore}-${oppScore}`;
        return {
          id: f.id,
          week: f.week_no,
          date: f.fixture_date,
          opponent: teamById.get(opponentId)?.name ?? "Opponent",
          isHome,
          score,
          status: computed.status,
          result,
        };
      })
      .sort((a, b) => {
        const aSort = a.date ? new Date(`${a.date}T12:00:00`).getTime() : (a.week ?? 0);
        const bSort = b.date ? new Date(`${b.date}T12:00:00`).getTime() : (b.week ?? 0);
        return bSort - aSort;
      });
  }, [selectedTableTeamId, seasonFixtures, teamById]);
  const selectedTeamResultFixture = useMemo(
    () => (selectedTeamResultFixtureId ? seasonFixtures.find((f) => f.id === selectedTeamResultFixtureId) ?? null : null),
    [selectedTeamResultFixtureId, seasonFixtures]
  );
  const selectedTeamResultReschedule = useMemo(
    () => describeFixtureReschedule(selectedTeamResultFixture ? fixtureChangeByFixtureId.get(selectedTeamResultFixture.id) : null),
    [selectedTeamResultFixture, fixtureChangeByFixtureId]
  );
  const selectedTeamResultsSummary = useMemo(() => {
    const played = selectedTeamResults.filter((result) => result.status === "complete").length;
    const upcoming = selectedTeamResults.filter((result) => result.status === "pending").length;
    const inProgress = selectedTeamResults.filter((result) => result.status === "in_progress").length;
    return {
      total: selectedTeamResults.length,
      played,
      upcoming,
      inProgress,
    };
  }, [selectedTeamResults]);
  const selectedTeamResultSeason = useMemo(
    () => (selectedTeamResultFixture ? seasonById.get(selectedTeamResultFixture.season_id) ?? null : null),
    [selectedTeamResultFixture, seasonById]
  );
  const selectedTeamHodgeBreakdown = useMemo(() => {
    if (!selectedTeamResultFixture) return [] as Array<{
      pairNo: number;
      framesLabel: string;
      homeTotal: number;
      awayTotal: number;
      bonusWinner: "home" | "away" | null;
    }>;
    const cfg = getSeasonFrameConfig(selectedTeamResultSeason);
    if (!cfg.isHodgeTriples) return [];
    const rows = fixtureSlotsByFixtureId.get(selectedTeamResultFixture.id) ?? [];
    const pairs: Array<[number, number]> = [
      [1, 4],
      [2, 5],
      [3, 6],
    ];
    return pairs.map(([a, b], idx) => {
      const ra = rows.find((r) => r.slot_no === a);
      const rb = rows.find((r) => r.slot_no === b);
      const homeTotal =
        (typeof ra?.home_points_scored === "number" ? ra.home_points_scored : 0) +
        (typeof rb?.home_points_scored === "number" ? rb.home_points_scored : 0);
      const awayTotal =
        (typeof ra?.away_points_scored === "number" ? ra.away_points_scored : 0) +
        (typeof rb?.away_points_scored === "number" ? rb.away_points_scored : 0);
      return {
        pairNo: idx + 1,
        framesLabel: `${a}+${b}`,
        homeTotal,
        awayTotal,
        bonusWinner: homeTotal > awayTotal ? "home" : awayTotal > homeTotal ? "away" : null,
      };
    });
  }, [selectedTeamResultFixture, selectedTeamResultSeason, fixtureSlotsByFixtureId]);
  const selectedTeamResultFrames = useMemo(() => {
    if (!selectedTeamResultFixture) return [];
    const frameRows = fixtureSlotsByFixtureId.get(selectedTeamResultFixture.id) ?? [];
    const seasonForFixture = seasonById.get(selectedTeamResultFixture.season_id) ?? null;
    const seasonCfg = getSeasonFrameConfig(seasonForFixture);
    const useWinterNoShowRules = seasonCfg.singles === 5 && seasonCfg.doubles === 1;
    return frameRows.map((slot) => {
      const homePoints = typeof slot.home_points_scored === "number" ? slot.home_points_scored : 0;
      const awayPoints = typeof slot.away_points_scored === "number" ? slot.away_points_scored : 0;
      const score =
        typeof slot.home_points_scored === "number" || typeof slot.away_points_scored === "number"
          ? `${homePoints}-${awayPoints}`
          : "-";
      let handicapNote: string | null = null;
      if (slot.slot_type === "doubles" && seasonForFixture?.handicap_enabled) {
        const playerHcp = (playerId: string | null | undefined) => Number(playerById.get(playerId ?? "")?.snooker_handicap ?? 0);
        const homeHcp = (playerHcp(slot.home_player1_id) + playerHcp(slot.home_player2_id)) / 2;
        const awayHcp = (playerHcp(slot.away_player1_id) + playerHcp(slot.away_player2_id)) / 2;
        const adjusted = calculateAdjustedScoresWithCap(homePoints, awayPoints, homeHcp, awayHcp);
        handicapNote =
          adjusted.homeStart > 0
            ? `HCP Home receives ${adjusted.homeStart} · Adjusted ${adjusted.homeAdjusted}-${adjusted.awayAdjusted}`
            : adjusted.awayStart > 0
              ? `HCP Away receives ${adjusted.awayStart} · Adjusted ${adjusted.homeAdjusted}-${adjusted.awayAdjusted}`
              : `HCP Level start · Adjusted ${adjusted.homeAdjusted}-${adjusted.awayAdjusted}`;
      }
      const homePlayers =
        slot.slot_type === "doubles"
          ? [slot.home_player1_id, slot.home_player2_id]
              .filter(Boolean)
              .map((id) => named(playerById.get(id as string)))
              .join(" / ")
          : slot.home_forfeit
            ? "No Show"
            : slot.home_nominated
              ? slot.home_nominated_name?.trim() || "Nominated Player"
              : slot.home_player1_id
                ? named(playerById.get(slot.home_player1_id))
                : useWinterNoShowRules && slot.slot_no === 4
                  ? "No Show"
                  : useWinterNoShowRules && slot.slot_no === 3
                    ? "Nominated Player"
                    : "Not recorded";
      const awayPlayers =
        slot.slot_type === "doubles"
          ? [slot.away_player1_id, slot.away_player2_id]
              .filter(Boolean)
              .map((id) => named(playerById.get(id as string)))
              .join(" / ")
          : slot.away_forfeit
            ? "No Show"
            : slot.away_nominated
              ? slot.away_nominated_name?.trim() || "Nominated Player"
              : slot.away_player1_id
                ? named(playerById.get(slot.away_player1_id))
                : useWinterNoShowRules && slot.slot_no === 4
                  ? "No Show"
                  : useWinterNoShowRules && slot.slot_no === 3
                    ? "Nominated Player"
                    : "Not recorded";
      return {
        id: slot.id,
        label: slotLabel(slot.slot_no, seasonForFixture),
        score,
        handicapNote,
        homePlayers,
        awayPlayers,
        winnerSide: slot.winner_side,
      };
    });
  }, [selectedTeamResultFixture, fixtureSlotsByFixtureId, playerById, seasonById]);

  useEffect(() => {
    setSelectedTeamResultFixtureId(null);
  }, [selectedTableTeamId]);
  const seasonSummary = useMemo(() => {
    const complete = seasonFixtures.filter((f) => f.status === "complete").length;
    const inProgress = seasonFixtures.filter((f) => f.status === "in_progress").length;
    const pending = seasonFixtures.filter((f) => f.status === "pending").length;
    return {
      teams: seasonTeams.length,
      fixtures: seasonFixtures.length,
      complete,
      inProgress,
      pending,
      pendingApprovals: allPendingSubmissions.filter((s) => s.season_id === seasonId).length,
    };
  }, [seasonFixtures, seasonTeams.length, allPendingSubmissions, seasonId]);
  const setupStepState = useMemo(() => {
    const created = Boolean(currentSeason);
    const enoughTeams = seasonTeams.length >= 2;
    const teamPlayerCounts = seasonTeams.map((team) => (teamMembersByTeam.get(team.id) ?? []).length);
    const teamRoleCoverage = seasonTeams.map((team) =>
      members.some((m) => m.team_id === team.id && (m.is_captain || Boolean(m.is_vice_captain)))
    );
    const playersAssigned = enoughTeams && teamPlayerCounts.every((count) => count > 0) && teamRoleCoverage.every(Boolean);
    const fixturesGenerated = seasonFixtures.length > 0;
    const published = Boolean(currentSeason?.is_published);
    return {
      created,
      enoughTeams,
      playersAssigned,
      fixturesGenerated,
      published,
      teamPlayerCounts,
      teamRoleCoverage,
    };
  }, [currentSeason, seasonTeams, teamMembersByTeam, members, seasonFixtures.length]);
  const publishBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!setupStepState.created) blockers.push("Create the league first.");
    if (!setupStepState.enoughTeams) blockers.push("Add at least two teams to the selected league.");
    seasonTeams.forEach((team, index) => {
      if ((setupStepState.teamPlayerCounts[index] ?? 0) === 0) blockers.push(`${team.name} has no players assigned.`);
      if (!setupStepState.teamRoleCoverage[index]) blockers.push(`${team.name} has no captain or vice-captain assigned.`);
    });
    if (!setupStepState.fixturesGenerated) blockers.push("Generate fixtures before publishing.");
    return blockers;
  }, [setupStepState, seasonTeams]);
  const guidedSetupSteps = useMemo(
    () => [
      {
        key: "create",
        title: "1. Create league",
        done: setupStepState.created,
        detail: currentSeason ? `Selected league: ${currentSeason.name}` : "Create the league season and choose format/handicap mode.",
        actionLabel: currentSeason ? "Review league setup" : "Create league",
        view: "setup" as const,
        target: "create-league" as const,
      },
      {
        key: "teams",
        title: "2. Add teams",
        done: setupStepState.enoughTeams,
        detail: `${seasonTeams.length} team${seasonTeams.length === 1 ? "" : "s"} added to this league.`,
        actionLabel: "Add teams",
        view: "setup" as const,
        target: "add-league-teams" as const,
      },
      {
        key: "players",
        title: "3. Assign players and roles",
        done: setupStepState.playersAssigned,
        detail: setupStepState.playersAssigned
          ? "Every league team has players plus captain/vice-captain coverage."
          : "Use Team Management to add players and assign captain or vice-captain roles for every league team.",
        actionLabel: "Open Team Management",
        view: "teamManagement" as const,
        target: "assign-players" as const,
      },
      {
        key: "fixtures",
        title: "4. Generate fixtures",
        done: setupStepState.fixturesGenerated,
        detail: `${seasonFixtures.length} fixture${seasonFixtures.length === 1 ? "" : "s"} generated.`,
        actionLabel: "Open Fixtures",
        view: "fixtures" as const,
        target: "generate-fixtures" as const,
      },
      {
        key: "publish",
        title: "5. Publish league",
        done: setupStepState.published,
        detail: currentSeason?.is_published ? "League is published and visible to members." : "Publish once the setup checklist is complete.",
        actionLabel: currentSeason?.is_published ? "Published" : "Publish league",
        view: "setup" as const,
        target: "publish-league" as const,
      },
    ],
    [setupStepState, currentSeason, seasonTeams.length, seasonFixtures.length]
  );
  const nextGuidedStep = useMemo(() => guidedSetupSteps.find((step) => !step.done) ?? null, [guidedSetupSteps]);
  const openGuidedTarget = (
    view: "guide" | "teamManagement" | "venues" | "profiles" | "setup" | "knockouts" | "fixtures" | "table" | "playerTable" | "handicaps",
    target: "create-league" | "add-league-teams" | "assign-players" | "generate-fixtures" | "publish-league"
  ) => {
    setActiveView(view);
    setGuidedTarget(target);
  };
  useEffect(() => {
    if (!guidedTarget) return;
    const id = `guided-${guidedTarget}`;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setHighlightedGuidedTarget(guidedTarget);
        setGuidedTarget(null);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [guidedTarget, activeView]);
  useEffect(() => {
    if (!highlightedGuidedTarget) return;
    const timer = window.setTimeout(() => setHighlightedGuidedTarget(null), 1800);
    return () => window.clearTimeout(timer);
  }, [highlightedGuidedTarget]);
  const guidedSectionClass = (target: "create-league" | "add-league-teams" | "assign-players" | "generate-fixtures" | "publish-league") =>
    highlightedGuidedTarget === target ? "ring-2 ring-indigo-400 ring-offset-2 transition" : "";
  const playerTables = useMemo(() => {
    const seasonTeamById = new Map(seasonTeams.map((t) => [t.id, t]));
    const playerTeamName = new Map<string, string>();
    for (const m of members) {
      if (m.season_id !== seasonId) continue;
      const team = seasonTeamById.get(m.team_id);
      if (!team) continue;
      if (!playerTeamName.has(m.player_id)) playerTeamName.set(m.player_id, team.name);
    }

    const singlesAppearanceByPlayer = new Map<string, Set<string>>();
    const doublesAppearanceByPlayer = new Map<string, Set<string>>();
    const singlesPlayed = new Map<string, { won: number; lost: number }>();
    const doublesPlayed = new Map<string, { won: number; lost: number }>();

    const fixtureIds = new Set(seasonFixtures.map((f) => f.id));
    const seasonSlots = slots.filter((s) => fixtureIds.has(s.fixture_id));
    for (const slot of seasonSlots) {
      const homeIds = [slot.home_player1_id, slot.home_player2_id].filter(Boolean) as string[];
      const awayIds = [slot.away_player1_id, slot.away_player2_id].filter(Boolean) as string[];
      const allIds = [...homeIds, ...awayIds];
      if (slot.slot_type === "singles") {
        for (const id of allIds) {
          const set = singlesAppearanceByPlayer.get(id) ?? new Set<string>();
          set.add(slot.fixture_id);
          singlesAppearanceByPlayer.set(id, set);
        }
      } else {
        for (const id of allIds) {
          const set = doublesAppearanceByPlayer.get(id) ?? new Set<string>();
          set.add(slot.fixture_id);
          doublesAppearanceByPlayer.set(id, set);
        }
      }

      if (!slot.winner_side) continue;
      if (slot.home_forfeit || slot.away_forfeit) continue;
      if (slot.slot_type === "singles") {
        if (slot.home_player1_id && !slot.home_forfeit) {
          const prev = singlesPlayed.get(slot.home_player1_id) ?? { won: 0, lost: 0 };
          if (slot.winner_side === "home") prev.won += 1;
          else prev.lost += 1;
          singlesPlayed.set(slot.home_player1_id, prev);
        }
        if (slot.away_player1_id && !slot.away_forfeit) {
          const prev = singlesPlayed.get(slot.away_player1_id) ?? { won: 0, lost: 0 };
          if (slot.winner_side === "away") prev.won += 1;
          else prev.lost += 1;
          singlesPlayed.set(slot.away_player1_id, prev);
        }
      } else {
        for (const id of homeIds) {
          const prev = doublesPlayed.get(id) ?? { won: 0, lost: 0 };
          if (slot.winner_side === "home") prev.won += 1;
          else prev.lost += 1;
          doublesPlayed.set(id, prev);
        }
        for (const id of awayIds) {
          const prev = doublesPlayed.get(id) ?? { won: 0, lost: 0 };
          if (slot.winner_side === "away") prev.won += 1;
          else prev.lost += 1;
          doublesPlayed.set(id, prev);
        }
      }
    }

    const toRows = (
      appearancesMap: Map<string, Set<string>>,
      resultMap: Map<string, { won: number; lost: number }>
    ): PlayerTableRow[] => {
      const ids = new Set<string>([...appearancesMap.keys(), ...resultMap.keys()]);
      return Array.from(ids)
        .map((id) => {
          const player = playerById.get(id);
          const won = resultMap.get(id)?.won ?? 0;
          const lost = resultMap.get(id)?.lost ?? 0;
          const played = won + lost;
          return {
            player_id: id,
            player_name: named(player),
            team_name: playerTeamName.get(id) ?? "-",
            appearances: appearancesMap.get(id)?.size ?? 0,
            played,
            won,
            lost,
            win_pct: played > 0 ? Math.round((won / played) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.win_pct - a.win_pct || b.won - a.won || a.player_name.localeCompare(b.player_name));
    };

    const singles = toRows(singlesAppearanceByPlayer, singlesPlayed);
    const doubles = toRows(doublesAppearanceByPlayer, doublesPlayed);

    const totalByPlayer = new Map<string, PlayerTableRow>();
    const merge = (row: PlayerTableRow) => {
      const prev = totalByPlayer.get(row.player_id) ?? {
        player_id: row.player_id,
        player_name: row.player_name,
        team_name: row.team_name,
        appearances: 0,
        played: 0,
        won: 0,
        lost: 0,
        win_pct: 0,
      };
      prev.appearances += row.appearances;
      prev.played += row.played;
      prev.won += row.won;
      prev.lost += row.lost;
      prev.win_pct = prev.played > 0 ? Math.round((prev.won / prev.played) * 1000) / 10 : 0;
      totalByPlayer.set(row.player_id, prev);
    };
    singles.forEach(merge);
    doubles.forEach(merge);
    const totals = Array.from(totalByPlayer.values()).sort(
      (a, b) => b.win_pct - a.win_pct || b.won - a.won || a.player_name.localeCompare(b.player_name)
    );
    return { singles, doubles, totals };
  }, [seasonId, seasonTeams, seasonFixtures, slots, members, playerById]);
  const singlesRankByPlayer = useMemo(() => {
    const map = new Map<string, number>();
    playerTables.singles.forEach((row, idx) => {
      map.set(row.player_id, idx + 1);
    });
    return map;
  }, [playerTables.singles]);
  const playerSummaryRows = useMemo(() => {
    const singlesById = new Map(playerTables.singles.map((r) => [r.player_id, r]));
    const doublesById = new Map(playerTables.doubles.map((r) => [r.player_id, r]));
    const totalsById = new Map(playerTables.totals.map((r) => [r.player_id, r]));
    const ids = new Set<string>([
      ...playerTables.singles.map((r) => r.player_id),
      ...playerTables.doubles.map((r) => r.player_id),
      ...playerTables.totals.map((r) => r.player_id),
    ]);
    return Array.from(ids)
      .map((id) => {
        const singles = singlesById.get(id);
        const doubles = doublesById.get(id);
        const total = totalsById.get(id);
        return {
          player_id: id,
          player_name: total?.player_name ?? singles?.player_name ?? doubles?.player_name ?? "Unknown",
          team_name: total?.team_name ?? singles?.team_name ?? doubles?.team_name ?? "-",
          singles,
          doubles,
          total,
          rank: singlesRankByPlayer.get(id) ?? null,
        };
      })
      .sort((a, b) => {
        const ra = a.rank ?? Number.MAX_SAFE_INTEGER;
        const rb = b.rank ?? Number.MAX_SAFE_INTEGER;
        return ra - rb || a.player_name.localeCompare(b.player_name);
      });
  }, [playerTables.singles, playerTables.doubles, playerTables.totals, singlesRankByPlayer]);
  const fixtureWeekOptions = useMemo(() => {
    const weeks = Array.from(new Set(seasonFixtures.map((f) => f.week_no).filter((w): w is number => typeof w === "number")));
    return weeks.sort((a, b) => a - b);
  }, [seasonFixtures]);
  const visibleFixtures = useMemo(() => {
    if (fixtureTeamFilter) {
      return seasonFixtures.filter((f) => f.home_team_id === fixtureTeamFilter || f.away_team_id === fixtureTeamFilter);
    }
    if (!fixtureWeekFilter) return seasonFixtures;
    const week = Number.parseInt(fixtureWeekFilter, 10);
    return seasonFixtures.filter((f) => f.week_no === week);
  }, [seasonFixtures, fixtureWeekFilter, fixtureTeamFilter]);
  const selectedTeamFixtures = useMemo(() => {
    if (!fixtureTeamFilter) return [];
    return visibleFixtures
      .slice()
      .sort((a, b) => {
        const aDate = a.fixture_date ? new Date(`${a.fixture_date}T12:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.fixture_date ? new Date(`${b.fixture_date}T12:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDate !== bDate) return aDate - bDate;
        return (a.week_no ?? 0) - (b.week_no ?? 0);
      });
  }, [fixtureTeamFilter, visibleFixtures]);
  const fixturesGroupedByWeek = useMemo(() => {
    const map = new Map<number, Fixture[]>();
    for (const fixture of visibleFixtures) {
      const key = fixture.week_no ?? 0;
      const prev = map.get(key) ?? [];
      prev.push(fixture);
      map.set(key, prev);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        if (a[0] === 0) return 1;
        if (b[0] === 0) return -1;
        return a[0] - b[0];
      })
      .map(([weekNo, items]) => {
        const weekDate = items.find((i) => i.fixture_date)?.fixture_date ?? null;
        const dateLabel = weekDate
          ? ` (${new Date(`${weekDate}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "short",
              day: "numeric",
            })})`
          : "";
        const label = weekNo > 0 ? `Week ${weekNo}${dateLabel}` : "Unscheduled";
        const teamsPlaying = new Set<string>();
        for (const fixture of items) {
          teamsPlaying.add(fixture.home_team_id);
          teamsPlaying.add(fixture.away_team_id);
        }
        const byeTeams =
          weekNo > 0
            ? seasonTeams
                .filter((team) => !teamsPlaying.has(team.id))
                .map((team) => team.name)
                .sort((a, b) => a.localeCompare(b))
            : [];
        return { label, items, byeTeams };
      });
  }, [visibleFixtures, seasonTeams]);
  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="League Manager"
            eyebrow="League"
            subtitle="League body, leagues, teams, fixtures, and standings."
          />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          <InfoModal open={Boolean(infoModal)} title={infoModal?.title ?? ""} description={infoModal?.description ?? ""} onClose={() => setInfoModal(null)} />
          <ConfirmModal
            open={confirmDeleteOpen}
            title="Delete League"
            description={`Delete "${seasons.find((s) => s.id === seasonId)?.name ?? "selected league"}"? This will permanently delete all related teams, fixtures, and results.`}
            confirmLabel="Delete Permanently"
            cancelLabel="Cancel"
            tone="danger"
            onConfirm={() => void confirmDeleteSeason()}
            onCancel={() => setConfirmDeleteOpen(false)}
          />
          {loading ? <section className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">Loading league data...</section> : null}

          {canViewLeague ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className={canManage ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10" : "grid grid-cols-2 gap-2 sm:grid-cols-4"}>
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => setActiveView("guide")} className={leagueTabClass("guide")}>
                        Summary
                      </button>
                      <button type="button" onClick={() => setActiveView("teamManagement")} className={leagueTabClass("teamManagement")}>
                        Team Management
                      </button>
                      <button type="button" onClick={() => setActiveView("venues")} className={leagueTabClass("venues")}>
                        Venues
                      </button>
                      <button type="button" onClick={() => setActiveView("profiles")} className={leagueTabClass("profiles")}>
                        Player Profiles
                      </button>
                      <button type="button" onClick={() => setActiveView("setup")} className={leagueTabClass("setup")}>
                        League Setup
                      </button>
                    </>
                  ) : null}
                  <button type="button" onClick={() => setActiveView("fixtures")} className={leagueTabClass("fixtures")}>
                    Fixtures
                  </button>
                  <button type="button" onClick={() => setActiveView("table")} className={leagueTabClass("table")}>
                    League Table
                  </button>
                  <button type="button" onClick={() => setActiveView("playerTable")} className={leagueTabClass("playerTable")}>
                    Player Table
                  </button>
                  <button type="button" onClick={() => setActiveView("knockouts")} className={leagueTabClass("knockouts")}>
                    Knockout Cups
                  </button>
                  {canManage ? (
                    <button type="button" onClick={() => setActiveView("handicaps")} className={leagueTabClass("handicaps")}>
                      Handicaps
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-slate-600">{activeViewDescription}</p>
              </section>
              {canManage ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <details className="group" open={activeView === "guide"}>
                    <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                      {activeGuide.title}
                      <span className="ml-2 text-xs font-medium text-slate-500 group-open:hidden">Show guide</span>
                      <span className="ml-2 text-xs font-medium text-slate-500 hidden group-open:inline">Hide guide</span>
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
                      {activeGuide.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </details>
                </section>
              ) : null}
              {canManage ? (
                currentSeason?.is_published ? (
                  <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-sky-50 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">League is live</h2>
                        <p className="mt-1 text-sm text-slate-600">
                          This league has already been published. Setup guidance is hidden so the page can focus on maintenance, fixtures, and live administration.
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                        Published
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Teams</p>
                        <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.teams}</p>
                        <p className="mt-1 text-xs text-slate-600">League teams currently assigned.</p>
                      </div>
                      <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Fixtures</p>
                        <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.fixtures}</p>
                        <p className="mt-1 text-xs text-slate-600">Generated and available in the published season.</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">In Progress</p>
                        <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.inProgress}</p>
                        <p className="mt-1 text-xs text-slate-600">Fixtures currently carrying live admin or captain activity.</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Pending Approvals</p>
                        <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.pendingApprovals}</p>
                        <p className="mt-1 text-xs text-slate-600">Use Fixtures and Results Queue for any remaining actions.</p>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50 to-sky-50 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Guided setup</h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Follow the league creation flow in order. The existing tabs still work for direct editing, but this checklist keeps the setup sequence clear.
                        </p>
                      </div>
                      {nextGuidedStep ? (
                        <button
                          type="button"
                          onClick={() => openGuidedTarget(nextGuidedStep.view, nextGuidedStep.target)}
                          className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-900"
                        >
                          Next: {nextGuidedStep.actionLabel}
                        </button>
                      ) : (
                        <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                          Setup complete
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-5">
                      {guidedSetupSteps.map((step) => (
                        <div key={step.key} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                step.done
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                                  : "border-amber-300 bg-amber-100 text-amber-900"
                              }`}
                            >
                              {step.done ? "Complete" : "Needs attention"}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">{step.detail}</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (step.key === "publish" && !step.done && publishBlockers.length === 0) {
                                void publishLeague();
                                return;
                              }
                              openGuidedTarget(step.view, step.target);
                            }}
                            disabled={step.key === "publish" && !step.done && publishBlockers.length > 0}
                            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {step.actionLabel}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-900">Publish checklist</p>
                      {publishBlockers.length === 0 ? (
                        <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                          This league is ready to publish.
                        </p>
                      ) : (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm font-semibold text-amber-900">Action still required before publish</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                            {publishBlockers.map((blocker) => (
                              <li key={blocker}>{blocker}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )
              ) : null}
              {!canManage ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Published League</label>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                    value={seasonId}
                    onChange={(e) => setSeasonId(e.target.value)}
                  >
                    <option value="">Select published league</option>
                    {visibleSeasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {seasonDisplayLabel(s)}
                      </option>
                    ))}
                  </select>
                </section>
              ) : null}
              {!seasonId && (activeView === "fixtures" || activeView === "table" || activeView === "playerTable") ? (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  Published leagues will appear here. Until then, fixtures, league table, and player table are unavailable.
                </section>
              ) : null}
              {seasonId && activeView === "guide" ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">League Snapshot</p>
                      <h2 className="mt-1 text-xl font-black text-slate-950">{seasonDisplayLabel(currentSeason ?? { name: "League", handicap_enabled: false })}</h2>
                      <p className="mt-1 text-sm text-slate-600">Use this as the operating summary for setup progress, fixture completion, and review workload.</p>
                    </div>
                    <div
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        seasonSummary.pendingApprovals > 0 ? "border border-amber-300 bg-amber-100 text-amber-900" : "border border-emerald-300 bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {seasonSummary.pendingApprovals > 0 ? `${seasonSummary.pendingApprovals} approval${seasonSummary.pendingApprovals === 1 ? "" : "s"} require attention` : "No approval backlog"}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Teams</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.teams}</p>
                      <p className="mt-1 text-xs text-slate-600">League entries in the selected season.</p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Fixtures</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.fixtures}</p>
                      <p className="mt-1 text-xs text-slate-600">Scheduled matches generated so far.</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Complete</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.complete}</p>
                      <p className="mt-1 text-xs text-slate-600">Fixtures with approved results.</p>
                    </div>
                    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">In Progress</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.inProgress}</p>
                      <p className="mt-1 text-xs text-slate-600">Fixtures with a live submission or partial entry.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Pending Fixtures</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.pending}</p>
                      <p className="mt-1 text-xs text-slate-600">Still waiting to be played or submitted.</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Pending Approvals</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{seasonSummary.pendingApprovals}</p>
                      <p className="mt-1 text-xs text-slate-600">Results or fixture requests awaiting action.</p>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeView === "setup" ? (
              <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-white to-teal-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-teal-900">League Setup</h2>
                <div className="mt-3 rounded-xl border border-teal-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Current setup position</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {currentSeason?.is_published
                          ? "This league is already published. Use the tabs below for maintenance, fixture management, and any live updates."
                          : nextGuidedStep
                          ? `Next recommended step: ${nextGuidedStep.title.replace(/^\d+\.\s*/, "")}.`
                          : "This league setup is complete. You can still return here to edit league details or publish status."}
                      </p>
                    </div>
                    {currentSeason?.is_published ? (
                      <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                        League published
                      </span>
                    ) : nextGuidedStep ? (
                      <button
                        type="button"
                        onClick={() => openGuidedTarget(nextGuidedStep.view, nextGuidedStep.target)}
                        className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-900"
                      >
                        Go to {nextGuidedStep.actionLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">League body</p>
                  <p className="text-sm font-semibold text-slate-900">{LEAGUE_BODY_NAME}</p>
                </div>
                <div
                  className={`mt-3 rounded-2xl border p-3 ${
                    currentSeason?.is_published
                      ? "border-slate-200 bg-slate-50/80"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Create a new league</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {currentSeason?.is_published
                          ? "The selected league is already live. These creation controls are softened so the tab reads as maintenance-first. Use them only when you are creating the next league."
                          : "Use these controls to create the next draft league before you move on to teams, fixtures, and publishing."}
                      </p>
                    </div>
                    {currentSeason?.is_published ? (
                      <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        Creation controls softened
                      </span>
                    ) : null}
                  </div>
                  <div
                    id="guided-create-league"
                    className={`mt-3 grid gap-2 sm:grid-cols-4 scroll-mt-24 ${guidedSectionClass("create-league")} ${
                      currentSeason?.is_published ? "opacity-60" : ""
                    }`}
                  >
                    <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                      value={seasonTemplate}
                      onChange={(e) => setSeasonTemplate(e.target.value as LeagueTemplateKey)}
                    >
                      <option value="winter">{LEAGUE_BODY_NAME} - {LEAGUE_TEMPLATES.winter.label} ({formatLabel(LEAGUE_TEMPLATES.winter.singlesCount, LEAGUE_TEMPLATES.winter.doublesCount)})</option>
                      <option value="summer">{LEAGUE_BODY_NAME} - {LEAGUE_TEMPLATES.summer.label} ({formatLabel(LEAGUE_TEMPLATES.summer.singlesCount, LEAGUE_TEMPLATES.summer.doublesCount)})</option>
                    </select>
                    <input
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 sm:col-span-2"
                      placeholder="Season label (optional, e.g. 2026/2027)"
                      value={seasonName}
                      onChange={(e) => setSeasonName(e.target.value)}
                    />
                    <button type="button" onClick={createSeason} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                      Create league
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Selected format:{" "}
                    <span className="font-semibold text-slate-800">
                      {formatLabel(LEAGUE_TEMPLATES[seasonTemplate].singlesCount, LEAGUE_TEMPLATES[seasonTemplate].doublesCount)}
                    </span>
                  </p>
                  {seasonTemplate === "summer" ? (
                    <div className={`mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 ${currentSeason?.is_published ? "opacity-70" : ""}`}>
                      <p className="font-semibold">Summer League rules applied</p>
                      <ul className="mt-1 space-y-1 text-xs text-amber-800">
                        <li>6 singles frames and no doubles.</li>
                        <li>Each player can play a maximum of 2 singles frames.</li>
                        <li>If a side only has 2 players, frames 5 and 6 should be recorded as No Show.</li>
                        <li>No Show on both sides gives no frame point and no player stats.</li>
                      </ul>
                    </div>
                  ) : (
                    <div className={`mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 ${currentSeason?.is_published ? "opacity-70" : ""}`}>
                      <p className="font-semibold">Winter League rules applied</p>
                      <ul className="mt-1 space-y-1 text-xs text-sky-800">
                        <li>4 singles frames and 1 doubles frame.</li>
                        <li>Singles players can appear once only per fixture.</li>
                        <li>Singles frame 3 allows Nominated Player where team points count but player stats do not.</li>
                        <li>Singles frame 4 allows No Show if a side is short.</li>
                      </ul>
                    </div>
                  )}
                  <label className={`mt-2 inline-flex items-center gap-2 text-sm text-slate-700 ${currentSeason?.is_published ? "opacity-70" : ""}`}>
                    <input
                      type="checkbox"
                      checked={seasonHandicapEnabled}
                      onChange={(e) => setSeasonHandicapEnabled(e.target.checked)}
                    />
                    Handicap league (maximum start 40)
                  </label>
                </div>
                <div id="guided-publish-league" className={`mt-3 scroll-mt-24 ${guidedSectionClass("publish-league")}`}>
                  <button
                    type="button"
                    onClick={deleteSeason}
                    disabled={!seasonId}
                    className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete selected league
                  </button>
                  <button
                    type="button"
                    onClick={publishLeague}
                    disabled={!seasonId || Boolean(currentSeason?.is_published) || publishBlockers.length > 0}
                    className="ml-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {currentSeason?.is_published ? "League published" : "Publish selected league"}
                  </button>
                </div>
                {!currentSeason?.is_published && publishBlockers.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-600">
                    Publish is disabled until the checklist above is complete.
                  </p>
                ) : null}
                <div id="guided-add-league-teams" className={`mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 scroll-mt-24 ${guidedSectionClass("add-league-teams")}`}>
                  <h3 className="text-sm font-semibold text-slate-900">Created leagues</h3>
                  <div className="mt-2 space-y-2">
                    {seasons
                      .filter((s) => s.name.trim().toLowerCase() !== LEAGUE_BODY_NAME.toLowerCase())
                      .map((league) => (
                        <button
                          key={league.id}
                          type="button"
                          onClick={() => {
                            setSeasonId(league.id);
                            setInfoModal({
                              title: "League Selected",
                              description: `"${league.name}" selected. You can now add teams here or open Fixtures when ready.`,
                            });
                          }}
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                            seasonId === league.id
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span>{league.name}</span>
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                              {formatLabel(getSeasonFrameConfig(league).singles, getSeasonFrameConfig(league).doubles)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                league.handicap_enabled
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {league.handicap_enabled ? "Handicap ON" : "Handicap OFF"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                league.is_published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {league.is_published ? "Published" : "Draft"}
                            </span>
                          </span>
                        </button>
                      ))}
                    {seasons.filter((s) => s.name.trim().toLowerCase() !== LEAGUE_BODY_NAME.toLowerCase()).length === 0 ? (
                      <p className="text-sm text-slate-600">No leagues created yet.</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Selected League Teams</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    These are season entries. A player can play for one team in this league season and a different team in a later winter or summer season.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {seasonId && seasonTeams.length > 0 ? (
                      seasonTeams.map((t) => (
                        <div key={`setup-team-${t.id}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                          {t.name}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-600">No teams added yet for this league.</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">Add registered team into selected league</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Registered teams are reusable templates. Adding them here creates the season-specific team entry and copies the current template roster into this league only.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-300 bg-white p-2">
                      {registeredTeamOptions
                        .filter((teamOption) => !seasonTeams.some((t) => t.name.toLowerCase() === teamOption.name.toLowerCase()))
                        .map((teamOption) => {
                          const checked = selectedLeagueTeamNames.includes(teamOption.name);
                          const teamVenue = locations.find((l) => l.id === teamOption.location_id);
                          return (
                            <label key={teamOption.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLeagueTeamNames((prev) => Array.from(new Set([...prev, teamOption.name])));
                                  } else {
                                    setSelectedLeagueTeamNames((prev) => prev.filter((n) => n !== teamOption.name));
                                  }
                                }}
                                disabled={!seasonId}
                              />
                              <span>{teamOption.name}</span>
                              <span className="text-xs text-slate-500">{teamVenue?.name ? `· ${locationLabel(teamVenue.name)}` : ""}</span>
                            </label>
                          );
                        })}
                      {registeredTeamOptions.filter((teamOption) => !seasonTeams.some((t) => t.name.toLowerCase() === teamOption.name.toLowerCase())).length === 0 ? (
                        <p className="text-sm text-slate-600">No available teams to add.</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          const all = registeredTeamOptions
                            .filter((teamOption) => !seasonTeams.some((t) => t.name.toLowerCase() === teamOption.name.toLowerCase()))
                            .map((t) => t.name);
                          setSelectedLeagueTeamNames(all);
                        }}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                        disabled={!seasonId}
                      >
                        Select all available
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedLeagueTeamNames([])}
                        className="ml-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                        disabled={!seasonId}
                      >
                        Clear
                      </button>
                      <button type="button" onClick={addTeamsToLeague} className="block rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white" disabled={!seasonId}>
                        Add selected teams
                      </button>
                      <p className="text-xs text-slate-600">{selectedLeagueTeamNames.length} team(s) selected.</p>
                    </div>
                  </div>
                </div>
              </section>
              ) : null}

              {activeView === "knockouts" ? (
                <section className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-white to-fuchsia-50 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-fuchsia-900">Knockout Cups / Competitions</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Published knockout competitions and entries are managed here.
                  </p>
                  {canManage ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <label className="space-y-1">
                        <span className="block text-xs font-medium text-slate-600">Competition</span>
                        <select
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={knockoutTemplateKey}
                          onChange={(e) => setKnockoutTemplateKey(e.target.value as "" | (typeof LEAGUE_KNOCKOUT_TEMPLATES)[number]["key"])}
                        >
                          <option value="">Select competition</option>
                          {LEAGUE_KNOCKOUT_TEMPLATES.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-medium text-slate-600">Season</span>
                        <select
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={knockoutSeasonLabel}
                          onChange={(e) => setKnockoutSeasonLabel(e.target.value)}
                        >
                          <option value="">Select season</option>
                          {seasonYearOptions.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-medium text-slate-600">Round 1 completion deadline</span>
                        <input
                          type="datetime-local"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={knockoutRound1Deadline}
                          onChange={(e) => setKnockoutRound1Deadline(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void createLeagueKnockoutCompetition()}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                      >
                        Create selected league cup
                      </button>
                    </div>
                  ) : null}
                  {canManage ? (
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void archiveAllKnockoutCompetitions()}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100"
                      >
                        Delete all active competitions
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {knockoutCompetitions.map((c) => {
                      const isHodgeComp = isHodgeCompetitionName(c.name);
                      const isHamiltonComp = isHamiltonCompetitionName(c.name);
                      const isAlberyComp = isAlberyCompetitionName(c.name);
                      const entries = (competitionEntriesByCompetitionId.get(c.id) ?? []).filter((e) => e.status !== "withdrawn");
                      const pending = entries.filter((e) => e.status === "pending");
                      const approved = entries.filter((e) => e.status === "approved");
                      const existingRoundCfg = c.knockout_round_best_of ?? {};
                      const roundDraft = knockoutRoundBestOfDraftByCompetitionId[c.id] ?? {
                        round1: String(existingRoundCfg.round1 ?? c.best_of),
                        semi_final: String(existingRoundCfg.semi_final ?? c.best_of),
                        final: String(existingRoundCfg.final ?? c.best_of),
                      };
                      const roundDeadlines = roundDeadlinesByCompetitionId.get(c.id) ?? [];
                      return (
                        <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-semibold text-slate-900">{c.name}</p>
                                {(() => {
                                  const finalReady = Boolean(c.final_scheduled_at && c.final_venue_location_id);
                                  return (
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                        finalReady
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                          : "border-amber-200 bg-amber-50 text-amber-800"
                                      }`}
                                    >
                                      {finalReady ? "Final set" : "Final pending"}
                                    </span>
                                  );
                                })()}
                              </div>
                              <p className="text-xs text-slate-600">
                                {c.sport_type === "billiards" ? "Billiards" : "Snooker"} · {isHodgeComp ? "triples (6 frames + 3 aggregate bonus points)" : isAlberyComp ? "3-man team race to 300 (100/200/300 legs)" : c.match_mode} · {isHodgeComp ? "First to 5 points (9-point format)" : isHamiltonComp ? "200 up + handicap (SF/Final 400 up + 2x handicap)" : isAlberyComp ? "First team to 300 wins (best players should play the final leg)" : `Best of ${c.best_of}`}
                              </p>
                              <p className="text-xs text-slate-600">
                                Sign-ups: {c.signup_open ? "Open" : "Closed"}
                                {c.signup_deadline ? ` · Deadline ${new Date(c.signup_deadline).toLocaleString()}` : ""}
                              </p>
                              {c.final_scheduled_at ? (
                                <p className="text-xs text-slate-600">
                                  Final: {new Date(c.final_scheduled_at).toLocaleString()}
                                  {c.final_venue_location_id
                                    ? ` · ${
                                        locations.find((l) => l.id === c.final_venue_location_id)?.name ?? "Venue selected"
                                      }`
                                    : ""}
                                </p>
                              ) : null}
                              {roundDeadlines.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {roundDeadlines.map((d) => {
                                    const status = roundDeadlineStatus(d.deadline_at);
                                    return (
                                      <span
                                        key={`${c.id}:rd:${d.round_no}`}
                                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.className}`}
                                        title={`Round ${d.round_no} deadline: ${new Date(d.deadline_at).toLocaleString()}`}
                                      >
                                        R{d.round_no} {new Date(d.deadline_at).toLocaleDateString()} · {status.label}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-amber-700">No round deadlines set.</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-500">Entries</p>
                              <p className="text-sm font-semibold text-slate-900">{approved.length} approved · {pending.length} pending</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link href={`/competitions/${c.id}`} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                              Open competition
                            </Link>
                            <Link href="/signups" className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                              Open sign-up page
                            </Link>
                            {canManage ? (
                              <>
                                {isHodgeComp ? (
                                  <div className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                                    Hodge Cup is fixed format: triples, 6 frames + 3 aggregate bonus points, first to 5 points (9-point format) in every round.
                                  </div>
                                ) : isHamiltonComp ? (
                                  <div className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                                    Hamilton Cup fixed format (Billiards Singles): all rounds up to and including quarter-finals are 200 up + handicap. Semi-final and final are 400 up + (handicap x2).
                                  </div>
                                ) : isAlberyComp ? (
                                  <div className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                                    Albery Cup fixed format (Billiards 3-man team): pair 1 plays to 100, pair 2 to 200, pair 3 to 300. First team to 300 wins.
                                  </div>
                                ) : (
                                  <>
                                    <input
                                      type="number"
                                      min={1}
                                      step={2}
                                      className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                                      value={knockoutBestOfDraftByCompetitionId[c.id] ?? String(c.best_of)}
                                      onChange={(e) =>
                                        setKnockoutBestOfDraftByCompetitionId((prev) => ({ ...prev, [c.id]: e.target.value }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateCompetitionBestOf(
                                          c.id,
                                          (knockoutBestOfDraftByCompetitionId[c.id] ?? String(c.best_of)).trim()
                                        )
                                      }
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                    >
                                      Save best-of
                                    </button>
                                    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                                      <p className="w-full text-xs text-slate-600">
                                        Early rounds default to Opening Round best-of. Set Quarter-final / Semi-final / Final overrides below.
                                      </p>
                                      <span className="text-xs font-semibold text-slate-700">Opening round</span>
                                      <input
                                        type="number"
                                        min={1}
                                        step={2}
                                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                                        value={roundDraft.round1}
                                        onChange={(e) =>
                                          setKnockoutRoundBestOfDraftByCompetitionId((prev) => ({
                                            ...prev,
                                            [c.id]: { ...roundDraft, round1: e.target.value },
                                          }))
                                        }
                                        placeholder="e.g. 3"
                                      />
                                      <span className="text-xs text-slate-600">Quarter-final uses Opening round value.</span>
                                      <span className="text-xs font-semibold text-slate-700">Semi-final</span>
                                      <input
                                        type="number"
                                        min={1}
                                        step={2}
                                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                                        value={roundDraft.semi_final}
                                        onChange={(e) =>
                                          setKnockoutRoundBestOfDraftByCompetitionId((prev) => ({
                                            ...prev,
                                            [c.id]: { ...roundDraft, semi_final: e.target.value },
                                          }))
                                        }
                                        placeholder="e.g. 5"
                                      />
                                      <span className="text-xs font-semibold text-slate-700">Final</span>
                                      <input
                                        type="number"
                                        min={1}
                                        step={2}
                                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                                        value={roundDraft.final}
                                        onChange={(e) =>
                                          setKnockoutRoundBestOfDraftByCompetitionId((prev) => ({
                                            ...prev,
                                            [c.id]: { ...roundDraft, final: e.target.value },
                                          }))
                                        }
                                        placeholder="e.g. 7"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void updateCompetitionRoundBestOf(c.id, roundDraft)}
                                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                      >
                                        Save round settings
                                      </button>
                                    </div>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void updateCompetitionSignupSettings(c.id, { signup_open: !c.signup_open })}
                                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  {c.signup_open ? "Close to new entrants" : "Open to new entrants"}
                                </button>
                                <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-700">Entry closing date/time</p>
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    Current: {c.signup_deadline ? new Date(c.signup_deadline).toLocaleString() : "Not set (entries remain open until closed manually)"}
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <input
                                      type="datetime-local"
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                                      value={knockoutDeadlineDraftByCompetitionId[c.id] ?? toLocalDateTimeInput(c.signup_deadline)}
                                      onChange={(e) =>
                                        setKnockoutDeadlineDraftByCompetitionId((prev) => ({ ...prev, [c.id]: e.target.value }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const raw = (knockoutDeadlineDraftByCompetitionId[c.id] ?? toLocalDateTimeInput(c.signup_deadline)).trim();
                                        const iso = localDateTimeInputToIso(raw);
                                        if (raw && !iso) {
                                          setMessage("Enter a valid closing date/time.");
                                          return;
                                        }
                                        void updateCompetitionSignupSettings(c.id, { signup_deadline: iso });
                                      }}
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                    >
                                      Save closing date
                                    </button>
                                    {c.signup_deadline ? (
                                      <button
                                        type="button"
                                        onClick={() => void updateCompetitionSignupSettings(c.id, { signup_deadline: null })}
                                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                      >
                                        Clear closing date
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-700">Final scheduling (Super User)</p>
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    Set final date and neutral venue after semi-finals are complete.
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <input
                                      type="datetime-local"
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                                      value={knockoutFinalDateDraftByCompetitionId[c.id] ?? toLocalDateTimeInput(c.final_scheduled_at)}
                                      onChange={(e) =>
                                        setKnockoutFinalDateDraftByCompetitionId((prev) => ({ ...prev, [c.id]: e.target.value }))
                                      }
                                    />
                                    <select
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                                      value={knockoutFinalVenueDraftByCompetitionId[c.id] ?? c.final_venue_location_id ?? ""}
                                      onChange={(e) =>
                                        setKnockoutFinalVenueDraftByCompetitionId((prev) => ({ ...prev, [c.id]: e.target.value }))
                                      }
                                    >
                                      <option value="">Select neutral venue</option>
                                      {locations.map((loc) => (
                                        <option key={loc.id} value={loc.id}>
                                          {loc.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rawDate = (knockoutFinalDateDraftByCompetitionId[c.id] ?? toLocalDateTimeInput(c.final_scheduled_at)).trim();
                                        const iso = localDateTimeInputToIso(rawDate);
                                        if (rawDate && !iso) {
                                          setMessage("Enter a valid final date/time.");
                                          return;
                                        }
                                        const venueId = (knockoutFinalVenueDraftByCompetitionId[c.id] ?? c.final_venue_location_id ?? "").trim();
                                        void updateCompetitionSignupSettings(c.id, {
                                          final_scheduled_at: iso,
                                          final_venue_location_id: venueId || null,
                                        });
                                      }}
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                    >
                                      Save final details
                                    </button>
                                    {(c.final_scheduled_at || c.final_venue_location_id) ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void updateCompetitionSignupSettings(c.id, {
                                            final_scheduled_at: null,
                                            final_venue_location_id: null,
                                          })
                                        }
                                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                      >
                                        Clear final details
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void archiveKnockoutCompetition(c.id, c.name)}
                                  className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-900 hover:bg-rose-100"
                                >
                                  Delete competition
                                </button>
                              </>
                            ) : null}
                          </div>
                          {canManage && pending.length > 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Pending approvals</p>
                              <div className="space-y-2">
                                {pending.map((e) => (
                                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                                    <span className="text-sm text-slate-800">{named(playerById.get(e.player_id ?? ""))}</span>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void reviewCompetitionEntry(e.id, "approved")}
                                        className="rounded-lg bg-emerald-700 px-2 py-1 text-xs text-white"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void reviewCompetitionEntry(e.id, "rejected")}
                                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {knockoutCompetitions.length === 0 ? (
                      <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        No knockout competitions found.
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {activeView === "venues" ? (
              <section className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-white to-cyan-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-cyan-900">Venues</h2>
                <p className="mt-2 text-sm text-slate-600">Register venues and maintain contact details.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 sm:col-span-3"
                    placeholder="New venue name"
                    value={newVenueName}
                    onChange={(e) => setNewVenueName(e.target.value)}
                  />
                  <button type="button" onClick={createVenue} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                    Register venue
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-5">
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="Venue name"
                    value={manageVenueName}
                    onChange={(e) => setManageVenueName(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="Address"
                    value={manageVenueAddress}
                    onChange={(e) => setManageVenueAddress(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="Postcode"
                    value={manageVenuePostcode}
                    onChange={(e) => setManageVenuePostcode(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="Contact phone"
                    value={manageVenuePhone}
                    onChange={(e) => setManageVenuePhone(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="Contact email"
                    value={manageVenueEmail}
                    onChange={(e) => setManageVenueEmail(e.target.value)}
                  />
                </div>
                {!manageVenueId ? (
                  <p className="mt-2 text-xs text-slate-600">Click a venue in “All Registered Venues” to edit details.</p>
                ) : null}
                <div className="mt-2">
                  <button type="button" onClick={saveVenueDetails} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
                    Save venue details
                  </button>
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">All Registered Venues ({venueLocations.length})</p>
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                      onClick={() => setShowAllRegisteredVenues((prev) => !prev)}
                    >
                      {showAllRegisteredVenues ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  {showAllRegisteredVenues ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {venueLocations
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((location) => (
                          <button
                            type="button"
                            key={`venue-list-${location.id}`}
                            onClick={() => setManageVenueId(location.id)}
                            className={`rounded-lg border px-3 py-2 text-left text-sm ${
                              manageVenueId === location.id
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-800"
                            }`}
                          >
                            {locationLabel(location.name)}
                          </button>
                        ))}
                      {venueLocations.length === 0 ? (
                        <p className="text-sm text-slate-600">No venues registered yet.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {manageVenueId ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">Venue Profile</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">
                        {selectedVenue ? locationLabel(selectedVenue.name) : "Selected venue"}
                      </p>
                      {(() => {
                        const rawAddress = selectedVenue?.address ?? "";
                        const [addressLine, postcode] = rawAddress.split(" | ");
                        return (
                      <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                        <p>
                          <span className="font-medium text-slate-900">Address: </span>
                          {addressLine?.trim() || "Not set"}
                        </p>
                        <p>
                          <span className="font-medium text-slate-900">Postcode: </span>
                          {postcode?.trim() || "Not set"}
                        </p>
                        <p>
                          <span className="font-medium text-slate-900">Phone: </span>
                          {selectedVenue?.contact_phone?.trim() || "Not set"}
                        </p>
                        <p>
                          <span className="font-medium text-slate-900">Email: </span>
                          {selectedVenue?.contact_email?.trim() || "Not set"}
                        </p>
                      </div>
                        );
                      })()}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Players linked</p>
                      <p className="text-base font-semibold text-slate-900">{selectedVenuePlayers.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Captains</p>
                      <p className="text-base font-semibold text-slate-900">
                        {
                          registeredMembers.filter((m) => {
                            if (!m.is_captain) return false;
                            const t = registeredTeams.find((rt) => rt.id === m.team_id);
                            return t?.location_id === manageVenueId;
                          }).length
                        }
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Vice-captains</p>
                      <p className="text-base font-semibold text-slate-900">
                        {
                          registeredMembers.filter((m) => {
                            if (!m.is_vice_captain) return false;
                            const t = registeredTeams.find((rt) => rt.id === m.team_id);
                            return t?.location_id === manageVenueId;
                          }).length
                        }
                      </p>
                    </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">Teams at this venue ({selectedVenueTeams.length})</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder="Search players in this venue"
                          value={venuePlayerSearch}
                          onChange={(e) => setVenuePlayerSearch(e.target.value)}
                        />
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                          <span>Showing {filteredSelectedVenueTeamRoster.length} team(s)</span>
                          <button
                            type="button"
                            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                            onClick={() => {
                              const next: Record<string, boolean> = {};
                              for (const team of filteredSelectedVenueTeamRoster) next[team.id] = true;
                              setExpandedVenueTeams((prev) => ({ ...prev, ...next }));
                            }}
                            disabled={filteredSelectedVenueTeamRoster.length === 0}
                          >
                            Expand all
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                            onClick={() => {
                              const next: Record<string, boolean> = {};
                              for (const team of filteredSelectedVenueTeamRoster) next[team.id] = false;
                              setExpandedVenueTeams((prev) => ({ ...prev, ...next }));
                            }}
                            disabled={filteredSelectedVenueTeamRoster.length === 0}
                          >
                            Collapse all
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-3">
                        {filteredSelectedVenueTeamRoster.map((team) => {
                          const expanded = Boolean(expandedVenueTeams[team.id]);
                          const showAll = Boolean(showAllVenueTeamMembers[team.id]);
                          const visibleMembers = showAll ? team.members : team.members.slice(0, 8);
                          return (
                          <div key={`venue-team-${team.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {team.name}
                                <span className="ml-2 text-xs font-normal text-slate-500">
                                  {team.members.length} player(s)
                                </span>
                              </p>
                              <button
                                type="button"
                                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                                onClick={() =>
                                  setExpandedVenueTeams((prev) => ({ ...prev, [team.id]: !prev[team.id] }))
                                }
                              >
                                {expanded ? "Hide players" : "Show players"}
                              </button>
                            </div>
                            {expanded ? (
                              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                                {visibleMembers.map((member) => (
                                  <li key={member.id} className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <Link
                                        href={`/players/${member.player_id}`}
                                        className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                                      >
                                        {named(member.player)}
                                      </Link>
                                      {member.is_captain ? " · Captain" : ""}
                                      {member.is_vice_captain ? " · Vice-captain" : ""}
                                    </div>
                                    {canManage ? (
                                      <div className="flex items-center gap-2 text-xs text-slate-700">
                                        <label className="inline-flex items-center gap-1">
                                          <input
                                            type="checkbox"
                                            checked={member.is_captain}
                                            onChange={(e) => void setRegisteredCaptain(member, e.target.checked)}
                                          />
                                          Captain
                                        </label>
                                        <label className="inline-flex items-center gap-1">
                                          <input
                                            type="checkbox"
                                            checked={member.is_vice_captain}
                                            onChange={(e) => void setRegisteredViceCaptain(member, e.target.checked)}
                                          />
                                          Vice-captain
                                        </label>
                                      </div>
                                    ) : null}
                                  </li>
                                ))}
                                {team.members.length > 8 ? (
                                  <li>
                                    <button
                                      type="button"
                                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                                      onClick={() =>
                                        setShowAllVenueTeamMembers((prev) => ({
                                          ...prev,
                                          [team.id]: !prev[team.id],
                                        }))
                                      }
                                    >
                                      {showAll ? "Show first 8" : `Show all (${team.members.length})`}
                                    </button>
                                  </li>
                                ) : null}
                                {team.members.length === 0 ? (
                                  <li className="text-slate-500">No players linked to this team yet.</li>
                                ) : null}
                              </ul>
                            ) : null}
                          </div>
                          );
                        })}
                        {selectedVenueTeams.length === 0 ? (
                          <p className="text-sm text-slate-600">No teams registered at this venue.</p>
                        ) : null}
                        {selectedVenueTeams.length > 0 && filteredSelectedVenueTeamRoster.length === 0 ? (
                          <p className="text-sm text-slate-600">No players found for this search.</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          Unassigned players at this venue ({selectedVenueUnassignedPlayers.length})
                        </p>
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                          onClick={() => setShowUnassignedPlayers((prev) => !prev)}
                        >
                          {showUnassignedPlayers ? "Hide" : "Show"}
                        </button>
                      </div>
                      {showUnassignedPlayers ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {selectedVenueUnassignedPlayers.map((player) => (
                            <Link
                              key={`venue-player-unassigned-${player.id}`}
                              href={`/players/${player.id}`}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                            >
                              {named(player)}
                            </Link>
                          ))}
                          {selectedVenueUnassignedPlayers.length === 0 ? (
                            <p className="text-sm text-slate-600">No unassigned players at this venue.</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>
              ) : null}

              {activeView === "profiles" ? (
              <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-sky-900">Player Profiles</h2>
                <p className="mt-2 text-sm text-slate-600">Open a player profile to view profile details and statistics.</p>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                      value={profileVenueFilterId}
                      onChange={(e) => setProfileVenueFilterId(e.target.value)}
                    >
                      <option value="">All venues</option>
                      {venueLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {locationLabel(location.name)}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      Profiles shown: <span className="font-semibold text-slate-900">{visiblePlayerProfiles.length}</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2">
                    <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
                      {visiblePlayerProfiles.map((player) => (
                        <li key={`profile-row-${player.id}`} className="grid items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 sm:grid-cols-[1fr_auto]">
                          <div>
                            <Link
                              href={`/players/${player.id}`}
                              className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
                            >
                              {player.name}
                            </Link>
                            <p className="mt-1 text-xs text-slate-600">{player.venue}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 justify-self-start sm:justify-self-end">
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                              Elo {player.rating}
                            </span>
                            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">
                              Current {player.currentHandicap > 0 ? `+${player.currentHandicap}` : player.currentHandicap}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              Baseline {player.baselineHandicap > 0 ? `+${player.baselineHandicap}` : player.baselineHandicap}
                            </span>
                          </div>
                        </li>
                      ))}
                      {visiblePlayerProfiles.length === 0 ? <li className="px-2 py-1 text-sm text-slate-500">No players found for this venue.</li> : null}
                    </ul>
                  </div>
                </div>
              </section>
              ) : null}

              {activeView === "teamManagement" ? (
              <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-indigo-900">Team Management</h2>
                <p className="mt-2 text-sm text-slate-600">Follow steps in order. You can skip and return later.</p>
                <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Season roster editor</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Edit the live roster for the selected league season directly. This is separate from the reusable registered-team template.
                      </p>
                    </div>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
                      One team per player in this season
                    </span>
                  </div>
                  {!seasonId ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                      Select a league season in <strong>League Setup</strong> first, then return here to manage the live season roster.
                    </div>
                  ) : (
                    <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]">
                      <select
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={seasonRosterTeamId}
                        onChange={(e) => {
                          setSeasonRosterTeamId(e.target.value);
                          setSeasonRosterPlayerId("");
                        }}
                      >
                        <option value="">Select league team</option>
                        {seasonTeams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={seasonRosterPlayerId}
                        onChange={(e) => setSeasonRosterPlayerId(e.target.value)}
                        disabled={!selectedSeasonRosterTeam}
                      >
                        <option value="">
                          {selectedSeasonRosterTeam ? "Select player to add to this season roster" : "Select league team first"}
                        </option>
                        {availableSeasonRosterPlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {named(player)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void addSeasonRosterPlayer()}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                        disabled={!selectedSeasonRosterTeam || !seasonRosterPlayerId}
                      >
                        Add to season roster
                      </button>
                    </div>
                    {selectedSeasonRosterTeam ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Bulk add existing players</p>
                            <p className="mt-1 text-xs text-slate-600">
                              Choose existing players from the same venue and add them to this season team in one action.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                              onClick={() => setSeasonRosterBulkPlayerIds(availableSeasonRosterPlayers.map((player) => player.id))}
                              disabled={availableSeasonRosterPlayers.length === 0}
                            >
                              Select all available
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                              onClick={() => setSeasonRosterBulkPlayerIds([])}
                              disabled={seasonRosterBulkPlayerIds.length === 0}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                          {availableSeasonRosterPlayers.map((player) => (
                            <label key={`season-roster-bulk-${player.id}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800">
                              <input
                                type="checkbox"
                                checked={seasonRosterBulkPlayerIds.includes(player.id)}
                                onChange={(e) =>
                                  setSeasonRosterBulkPlayerIds((prev) =>
                                    e.target.checked ? Array.from(new Set([...prev, player.id])) : prev.filter((id) => id !== player.id)
                                  )
                                }
                              />
                              <span>{named(player)}</span>
                            </label>
                          ))}
                          {availableSeasonRosterPlayers.length === 0 ? (
                            <p className="text-sm text-slate-500">No eligible existing players are currently available for this season team.</p>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-600">{seasonRosterBulkPlayerIds.length} player(s) selected.</p>
                          <button
                            type="button"
                            onClick={() => void addSeasonRosterPlayersBulk()}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                            disabled={seasonRosterBulkPlayerIds.length === 0}
                          >
                            Add selected existing players
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {selectedSeasonRosterTeam ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{selectedSeasonRosterTeam.name}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              Changes here affect this selected league season only.
                              {selectedSeasonRosterVenueId ? ` Venue: ${locationLabel(locationById.get(selectedSeasonRosterVenueId)?.name ?? "Unknown venue")}.` : ""}
                            </p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            {selectedSeasonRosterMembers.length} player(s)
                          </span>
                        </div>
                        <ul className="mt-3 space-y-2 text-sm text-slate-700">
                          {selectedSeasonRosterMembers.map((member) => (
                            <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                              <div>
                                <span className="font-medium text-slate-900">{named(member.player)}</span>
                                {member.is_captain ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Captain</span> : null}
                                {member.is_vice_captain ? <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">Vice-captain</span> : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <label className="inline-flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={member.is_captain}
                                    onChange={(e) =>
                                      void setSeasonRosterRole(
                                        member,
                                        { is_captain: e.target.checked, is_vice_captain: e.target.checked ? false : member.is_vice_captain },
                                        e.target.checked ? "is_captain" : null
                                      )
                                    }
                                  />
                                  Captain
                                </label>
                                <label className="inline-flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={member.is_vice_captain}
                                    onChange={(e) =>
                                      void setSeasonRosterRole(
                                        member,
                                        { is_vice_captain: e.target.checked, is_captain: e.target.checked ? false : member.is_captain },
                                        e.target.checked ? "is_vice_captain" : null
                                      )
                                    }
                                  />
                                  Vice-captain
                                </label>
                                <button
                                  type="button"
                                  className="rounded border border-rose-300 bg-white px-2 py-1 text-xs text-rose-700"
                                  onClick={() => void removeSeasonRosterMember(member.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </li>
                          ))}
                          {selectedSeasonRosterMembers.length === 0 ? (
                            <li className="text-slate-500">No players assigned to this season team yet.</li>
                          ) : null}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">Select a league team above to edit its live season roster.</p>
                    )}
                    </>
                  )}
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">Step 1: Register venue</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={LEAGUE_BODY_NAME} disabled>
                      <option value={LEAGUE_BODY_NAME}>{LEAGUE_BODY_NAME}</option>
                    </select>
                    <input
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 sm:col-span-2"
                      placeholder="Venue name"
                      value={newVenueName}
                      onChange={(e) => setNewVenueName(e.target.value)}
                    />
                    <button type="button" onClick={createVenue} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                      Register venue
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setShowStep2Teams(true)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Register teams now</button>
                    <button type="button" onClick={() => setShowStep2Teams(false)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Do this later</button>
                  </div>
                </div>
                {showStep2Teams ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Step 2: Register team at venue</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <select
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                        value={registryVenueId}
                        onChange={(e) => setRegistryVenueId(e.target.value)}
                      >
                        <option value="">Select venue</option>
                        {venueLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {locationLabel(location.name)}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 sm:col-span-2"
                        placeholder="Team name (e.g. Greenhithe A)"
                        value={registryTeamName}
                        onChange={(e) => setRegistryTeamName(e.target.value)}
                      />
                      <button type="button" onClick={createRegisteredTeam} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                        Register team
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setShowStep3Players(true)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Register players now</button>
                      <button type="button" onClick={() => setShowStep3Players(false)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Do this later</button>
                    </div>
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                      {registeredTeams
                        .filter((team) => !registryVenueId || team.location_id === registryVenueId)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((team) => (
                          <div key={`reg-team-${team.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                            <span>
                              {team.name}
                              <span className="ml-1 text-xs text-slate-500">
                                · {locationLabel(locations.find((l) => l.id === team.location_id)?.name ?? "Unknown venue")}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => void deleteRegisteredTeam(team.id)}
                              className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-xs text-rose-700"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      {registeredTeams.filter((team) => !registryVenueId || team.location_id === registryVenueId).length === 0 ? (
                        <p className="text-sm text-slate-600">No registered teams yet.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {showStep3Players ? (
                  <>
                    <div id="guided-assign-players" className={`mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 scroll-mt-24 ${guidedSectionClass("assign-players")}`}>
                      <p className="text-sm font-semibold text-slate-900">Step 3: Register new player for team/club (first-time creation)</p>
                      <p className="mt-2 text-xs text-slate-600">
                        This step creates brand-new player records only. If the player already exists, use the existing record. Team selection here updates the reusable registered-team template, not historical season rosters.
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-6">
                        <input
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          placeholder="First name"
                          value={newPlayerFirstName}
                          onChange={(e) => setNewPlayerFirstName(e.target.value)}
                        />
                        <input
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          placeholder="Second name"
                          value={newPlayerSecondName}
                          onChange={(e) => setNewPlayerSecondName(e.target.value)}
                        />
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          value={newPlayerLocationId}
                          onChange={(e) => {
                            const nextLocationId = e.target.value;
                            setNewPlayerLocationId(nextLocationId);
                            if (registryTeamId) {
                              const selectedTeam = registeredTeams.find((t) => t.id === registryTeamId);
                              if (selectedTeam && selectedTeam.location_id !== nextLocationId) {
                                setRegistryTeamId("");
                              }
                            }
                          }}
                        >
                          <option value="">Select location</option>
                          {venueLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {locationLabel(location.name)}
                            </option>
                          ))}
                        </select>
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          value={registryTeamId}
                          onChange={(e) => setRegistryTeamId(e.target.value)}
                          disabled={!newPlayerLocationId}
                        >
                          <option value="">Select team (optional)</option>
                          {registeredTeams
                            .filter((t) => t.location_id === newPlayerLocationId)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                        <button type="button" onClick={() => void registerPlayerForClub(false)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
                          Register for club
                        </button>
                        <button
                          type="button"
                          onClick={() => void registerPlayerForClub(true)}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                        >
                          Register + add to team
                        </button>
                      </div>
                      {!registryTeamId ? <p className="mt-2 text-xs text-slate-600">Select a team only if using "Register + add to team".</p> : null}
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Bulk create players (one per line: First Last or First,Last)
                        </label>
                        <textarea
                          className="min-h-[120px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={"Example:\nJason Harrison\nBryan Hordon\nGraham Beale"}
                          value={bulkPlayersText}
                          onChange={(e) => setBulkPlayersText(e.target.value)}
                        />
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => void registerPlayersBulk()}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                          >
                            Bulk register {registryTeamId ? "+ add to selected team" : "for selected club"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
                {registryTeamId ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">{registeredTeams.find((t) => t.id === registryTeamId)?.name ?? "Team"}</p>
                    <p className="text-xs text-slate-600">Set captain now. Vice-captain support can be added next.</p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {(registeredMembersByTeam.get(registryTeamId) ?? []).map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-2">
                          <span>{named(playerById.get(m.player_id))}</span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={m.is_captain}
                                onChange={(e) => void setRegisteredCaptain(m, e.target.checked)}
                              />
                              Captain
                            </label>
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={m.is_vice_captain}
                                onChange={(e) => void setRegisteredViceCaptain(m, e.target.checked)}
                              />
                              Vice-captain
                            </label>
                            <button
                              type="button"
                              className="rounded border border-rose-300 bg-white px-2 py-0.5 text-xs text-rose-700"
                              onClick={() => void removeRegisteredMember(m.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                      {(registeredMembersByTeam.get(registryTeamId) ?? []).length === 0 ? <li className="text-slate-500">No players assigned.</li> : null}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">Step 4: Transfer player club/team</p>
                  <p className="mt-1 text-xs text-slate-600">
                    This updates the player&apos;s club and registered-team template for future league setup. Published season team memberships remain season-specific and are not rewritten.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-5">
                    <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                      value={transferFromVenueId}
                      onChange={(e) => {
                        setTransferFromVenueId(e.target.value);
                        setTransferVenueId(e.target.value);
                        setTransferPlayerId("");
                        setTransferDestinationTeamId("");
                      }}
                    >
                      <option value="">Current venue</option>
                      {venueLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {locationLabel(location.name)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                      value={transferPlayerId}
                      onChange={(e) => setTransferPlayerId(e.target.value)}
                    >
                      <option value="">Select player at current venue</option>
                      {playersAtSourceVenue.map((player) => (
                        <option key={player.id} value={player.id}>
                          {named(player)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                      value={transferVenueId}
                      onChange={(e) => {
                        setTransferVenueId(e.target.value);
                        setTransferDestinationTeamId("");
                      }}
                    >
                      <option value="">Destination venue</option>
                      {venueLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {locationLabel(location.name)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                      value={transferDestinationTeamId}
                      onChange={(e) => setTransferDestinationTeamId(e.target.value)}
                    >
                      <option value="">Destination team</option>
                      {destinationTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={transferPlayerClubTeam}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                    >
                      Transfer player
                    </button>
                  </div>
                  {transferPlayerId ? (
                    <p className="mt-2 text-xs text-slate-600">
                      Current team(s): {(registeredTeamNamesByPlayer.get(transferPlayerId) ?? []).join(", ") || "None"}
                    </p>
                  ) : null}
                </div>
              </section>
              ) : null}

              {activeView === "fixtures" ? (
              <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-amber-900">Fixtures</h2>
                  {currentSeason ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        currentSeason.handicap_enabled
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {currentSeason.handicap_enabled ? `Handicap ON (max ${MAX_SNOOKER_START})` : "Handicap OFF"}
                    </span>
                  ) : null}
                  {currentSeason ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                      Format: {formatLabel(currentSeasonSinglesCount, currentSeasonDoublesCount)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {isSummerFormat ? (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">Summer League result entry</p>
                      <ul className="mt-1 space-y-1 text-xs text-amber-800">
                        <li>6 singles only. No doubles frame is generated for this league.</li>
                        <li>Any player can be selected for a maximum of 2 singles frames.</li>
                        <li>No Show is available in frames 5 and 6 only.</li>
                        <li>If both sides are No Show in a frame, that frame gives no point and no player stats.</li>
                      </ul>
                    </div>
                  ) : (
                    <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                      <p className="font-semibold">Winter League result entry</p>
                      <ul className="mt-1 space-y-1 text-xs text-sky-800">
                        <li>4 singles plus 1 doubles frame.</li>
                        <li>Singles players can only be selected once in the same fixture.</li>
                        <li>Nominated Player is available in singles frame 3 only and does not generate player stats.</li>
                        <li>No Show is available in singles frame 4 only.</li>
                      </ul>
                    </div>
                  )}
                  {canManage ? (
                    <>
                      <p className="text-sm font-semibold text-slate-900">Auto-generate full league fixtures</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Choose a season start date, then add any reserved Thursdays as break weeks (no league fixtures).
                      </p>
                      <div className="mt-2 grid items-end gap-2 sm:grid-cols-6">
                        <label className="space-y-1">
                          <span className="text-xs font-medium text-slate-600">Season start date</span>
                          <input
                            type="date"
                            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                            value={genStartDate}
                            onChange={(e) => setGenStartDate(e.target.value)}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-medium text-slate-600">Reserved break date (no fixtures)</span>
                          <input
                            type="date"
                            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                            value={breakDateInput}
                            onChange={(e) => setBreakDateInput(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={addBreakDate}
                          className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
                        >
                          Add break
                        </button>
                        <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                          <input type="checkbox" checked={genDoubleRound} onChange={(e) => setGenDoubleRound(e.target.checked)} />
                          Home & away legs
                        </label>
                        <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                          <input type="checkbox" checked={genClearExisting} onChange={(e) => setGenClearExisting(e.target.checked)} />
                          Replace existing fixtures
                        </label>
                        <button type="button" onClick={generateFixtures} className="h-11 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white">
                          Generate fixtures
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {breakDates.map((d) => (
                          <button
                            type="button"
                            key={d}
                            onClick={() => removeBreakDate(d)}
                            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                            title="Remove break week"
                          >
                            {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })} x
                          </button>
                        ))}
                        {breakDates.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setBreakDates([])}
                            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                          >
                            Clear breaks
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={applyBreakWeeksToExisting}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
                        >
                          Apply break weeks to existing dates
                        </button>
                        <p className="text-xs text-slate-600">
                          Reserved weeks are selected by date; later fixtures are moved forward automatically.
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-600">Fixture generation is managed by the Super User.</p>
                  )}
                </div>
                {canManage ? (
                  <>
                      <div id="guided-generate-fixtures" className={`mt-3 grid gap-2 sm:grid-cols-5 scroll-mt-24 ${guidedSectionClass("generate-fixtures")}`}>
                      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="Week no" value={fixtureWeek} onChange={(e) => setFixtureWeek(e.target.value)} />
                      <input type="date" className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={fixtureDate} onChange={(e) => setFixtureDate(e.target.value)} />
                      <select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={fixtureHome} onChange={(e) => setFixtureHome(e.target.value)}>
                        <option value="">Home team</option>
                        {seasonTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={fixtureAway} onChange={(e) => setFixtureAway(e.target.value)}>
                        <option value="">Away team</option>
                        {seasonTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button type="button" onClick={createFixture} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                        Add fixture
                      </button>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={publishFixtures} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
                        Publish fixtures to inbox
                      </button>
                    </div>
                  </>
                ) : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                    value={fixtureTeamFilter}
                    onChange={(e) => setFixtureTeamFilter(e.target.value)}
                  >
                    <option value="">All teams</option>
                    {seasonTeams
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                  </select>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                    value={fixtureWeekFilter}
                    onChange={(e) => setFixtureWeekFilter(e.target.value)}
                    disabled={Boolean(fixtureTeamFilter)}
                  >
                    <option value="">{fixtureTeamFilter ? "Week filter disabled (team view)" : "All weeks"}</option>
                    {fixtureWeekOptions.map((weekNo) => (
                      <option key={weekNo} value={String(weekNo)}>
                        Week {weekNo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 space-y-3">
                  {fixtureTeamFilter ? (
                    selectedTeamFixtures.map((f) => {
                      const computed = computeFixtureProgress(f);
                      const fixtureChange = describeFixtureReschedule(fixtureChangeByFixtureId.get(f.id));
                      const pendingSubmission = pendingSubmissionByFixtureId.get(f.id);
                      const isEditing = fixtureId === f.id && resultEntryOpen;
                      const buttonState =
                        isEditing
                          ? { label: "Editing", className: "border-slate-900 bg-slate-900 text-white" }
                          : pendingSubmission || f.status === "in_progress"
                            ? { label: "Submitted", className: "border-amber-300 bg-amber-100 text-amber-900" }
                            : computed.status === "complete"
                              ? { label: "Locked", className: "border-emerald-300 bg-emerald-100 text-emerald-900" }
                              : !isFixtureDueNow(f.fixture_date)
                                ? { label: "Scheduled", className: "border-slate-300 bg-slate-100 text-slate-700" }
                                : { label: "Action required", className: "border-rose-300 bg-rose-100 text-rose-900" };
                      const canOpenFixture = canManage || captainTeamIds.has(f.home_team_id) || captainTeamIds.has(f.away_team_id);
                      return (
                        <div key={f.id} className="grid items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:grid-cols-[180px_1fr_auto]">
                          <p className="text-sm font-medium text-slate-700">
                            {f.week_no ? `Week ${f.week_no}` : "Week -"}
                            {f.fixture_date ? ` (${formatFixtureDateLong(f.fixture_date)})` : ""}
                          </p>
                          <div className="text-sm text-slate-800">
                            {teamById.get(f.home_team_id)?.name ?? "Home"} vs {teamById.get(f.away_team_id)?.name ?? "Away"}
                            <span className="ml-2 text-xs text-slate-600">
                              ({computed.homePoints}-{computed.awayPoints}) · {statusLabel(computed.status)}
                            </span>
                            {fixtureChange ? (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                <span className={`rounded-full border px-2 py-0.5 font-semibold ${fixtureChange.chip === "Brought forward" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                                  {fixtureChange.chip}
                                </span>
                                <span className="text-slate-600">{fixtureChange.detail}</span>
                              </div>
                            ) : null}
                          </div>
                          {canOpenFixture ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!canManage) {
                                  window.location.assign(`/captain-results?fixtureId=${f.id}`);
                                  return;
                                }
                                setFixtureId(f.id);
                                setResultEntryOpen(true);
                              }}
                              className={`rounded-lg border px-2 py-1 text-xs ${buttonState.className}`}
                            >
                              {buttonState.label}
                            </button>
                          ) : (
                            <span className={`rounded-lg border px-2 py-1 text-xs ${buttonState.className}`}>
                              {buttonState.label}
                            </span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    fixturesGroupedByWeek.map((group) => (
                    <div key={group.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                      <div className="mt-2 space-y-2">
                        {group.items.map((f) => (
                          (() => {
                            const computed = computeFixtureProgress(f);
                            const fixtureChange = describeFixtureReschedule(fixtureChangeByFixtureId.get(f.id));
                            const pendingSubmission = pendingSubmissionByFixtureId.get(f.id);
                            const isEditing = fixtureId === f.id && resultEntryOpen;
                            const buttonState =
                              isEditing
                                ? { label: "Editing", className: "border-slate-900 bg-slate-900 text-white" }
                                : pendingSubmission || f.status === "in_progress"
                                  ? { label: "Submitted", className: "border-amber-300 bg-amber-100 text-amber-900" }
                                  : computed.status === "complete"
                                    ? { label: "Locked", className: "border-emerald-300 bg-emerald-100 text-emerald-900" }
                                    : !isFixtureDueNow(f.fixture_date)
                                      ? { label: "Scheduled", className: "border-slate-300 bg-slate-100 text-slate-700" }
                                      : { label: "Action required", className: "border-rose-300 bg-rose-100 text-rose-900" };
                            return (
                              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <div className="text-sm text-slate-800">
                                  {teamById.get(f.home_team_id)?.name ?? "Home"} vs {teamById.get(f.away_team_id)?.name ?? "Away"}
                                  <span className="ml-2 text-xs text-slate-600">
                                    ({computed.homePoints}-{computed.awayPoints}) · {statusLabel(computed.status)}
                                  </span>
                                  {fixtureChange ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${fixtureChange.chip === "Brought forward" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                                        {fixtureChange.chip}
                                      </span>
                                      <span className="text-slate-600">{fixtureChange.detail}</span>
                                    </div>
                                  ) : null}
                                </div>
                                {(canManage || (captainTeamIds.has(f.home_team_id) || captainTeamIds.has(f.away_team_id))) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!canManage) {
                                        window.location.assign(`/captain-results?fixtureId=${f.id}`);
                                        return;
                                      }
                                      setFixtureId(f.id);
                                      setResultEntryOpen(true);
                                    }}
                                    className={`rounded-lg border px-2 py-1 text-xs ${buttonState.className}`}
                                  >
                                    {buttonState.label}
                                  </button>
                                ) : (
                                  <span className={`rounded-lg border px-2 py-1 text-xs ${buttonState.className}`}>
                                    {buttonState.label}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        ))}
                        {group.byeTeams.map((teamName) => (
                          <div
                            key={`${group.label}-bye-${teamName}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <p className="text-sm text-slate-700">{teamName}</p>
                            <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                              BYE / No fixture this week
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    ))
                  )}
                  {visibleFixtures.length === 0 ? <p className="text-sm text-slate-600">No fixtures for this filter.</p> : null}
                </div>
              </section>
              ) : null}

              {activeView === "fixtures" && fixtureId && resultEntryOpen && (canManage || canSubmitCurrentFixture) ? (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4">
                  <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-slate-900">Weekly Result Entry</h2>
                      <button
                        type="button"
                        onClick={() => setResultEntryOpen(false)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                      >
                        Close
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {`Format: ${currentSeasonSinglesCount} singles${currentSeasonDoublesCount > 0 ? ` + ${currentSeasonDoublesCount} doubles` : ""}. Winner is derived automatically from frame points.`}
                    </p>
                    {isHodgeTriplesFormat ? (
                      <p className="mt-1 text-xs text-slate-600">
                        Hodge triples scoring: 1 point per frame plus 1 aggregate bonus point for each pairing (1+4, 2+5, 3+6). Respotted black means aggregate ties are not expected.
                      </p>
                    ) : null}
                    {currentSeason?.handicap_enabled && currentSeasonDoublesCount > 0 ? (
                      <p className="mt-1 text-xs text-slate-600">Doubles handicap uses (player 1 + player 2) ÷ 2 per team.</p>
                    ) : null}
                    {isCurrentFixtureLocked ? (
                      <p className="mt-2 inline-flex rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900">
                        Locked: result approved/finalized (read-only)
                      </p>
                    ) : null}
                    {currentFixtureReschedule ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 font-semibold ${currentFixtureReschedule.chip === "Brought forward" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                            {currentFixtureReschedule.chip}
                          </span>
                          <span>{currentFixtureReschedule.detail}</span>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-3">
                      <fieldset disabled={isCurrentFixtureLocked} className={isCurrentFixtureLocked ? "cursor-not-allowed opacity-85" : ""}>
                      {fixtureSlots.map((slot) => {
                        const fixture = seasonFixtures.find((f) => f.id === slot.fixture_id);
                        if (!fixture) return null;
                        const homeRosterIds = sortRosterIds(fallbackRosterByLeagueTeamId.get(fixture.home_team_id) ?? []);
                        const awayRosterIds = sortRosterIds(fallbackRosterByLeagueTeamId.get(fixture.away_team_id) ?? []);
                        const homeSinglesCount = new Map<string, number>();
                        const awaySinglesCount = new Map<string, number>();
                        for (const s of fixtureSlots) {
                          if (s.slot_type !== "singles" || s.id === slot.id) continue;
                          if (s.home_player1_id) homeSinglesCount.set(s.home_player1_id, (homeSinglesCount.get(s.home_player1_id) ?? 0) + 1);
                          if (s.away_player1_id) awaySinglesCount.set(s.away_player1_id, (awaySinglesCount.get(s.away_player1_id) ?? 0) + 1);
                        }
                        const winterFrameFour = fixtureSlots.find((row) => row.slot_type === "singles" && row.slot_no === 4);
                        const homeDoublesOptions =
                          isWinterFormat && winterFrameFour?.home_forfeit
                            ? sortRosterIds(
                                fixtureSlots
                                  .filter((row) => row.slot_type === "singles" && (row.slot_no === 1 || row.slot_no === 2))
                                  .map((row) => row.home_player1_id)
                                  .filter((id): id is string => Boolean(id))
                              )
                            : homeRosterIds;
                        const awayDoublesOptions =
                          isWinterFormat && winterFrameFour?.away_forfeit
                            ? sortRosterIds(
                                fixtureSlots
                                  .filter((row) => row.slot_type === "singles" && (row.slot_no === 1 || row.slot_no === 2))
                                  .map((row) => row.away_player1_id)
                                  .filter((id): id is string => Boolean(id))
                              )
                            : awayRosterIds;
                        const homeNominatedOptions =
                          isWinterFormat
                            ? sortRosterIds(
                                fixtureSlots
                                  .filter((row) => row.slot_type === "singles" && (row.slot_no === 1 || row.slot_no === 2))
                                  .map((row) => row.home_player1_id)
                                  .filter((id): id is string => Boolean(id))
                              )
                            : [];
                        const awayNominatedOptions =
                          isWinterFormat
                            ? sortRosterIds(
                                fixtureSlots
                                  .filter((row) => row.slot_type === "singles" && (row.slot_no === 1 || row.slot_no === 2))
                                  .map((row) => row.away_player1_id)
                                  .filter((id): id is string => Boolean(id))
                              )
                            : [];
                        const homeSelection = getSinglesSelectionValue(slot, "home");
                        const awaySelection = getSinglesSelectionValue(slot, "away");
                        return (
                          <div key={slot.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-900">
                              {slot.slot_type === "doubles" ? `Frame ${slot.slot_no} · Doubles` : `Frame ${slot.slot_no} · Singles`}
                            </p>
                            {slot.slot_type === "doubles" && currentSeason?.handicap_enabled ? (
                              <p className="mt-1 text-xs text-slate-600">{doublesHandicapLabel(slot)} (combined player handicaps ÷ 2)</p>
                            ) : null}
                            <div className="mt-2 grid gap-2 sm:grid-cols-5">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Home</div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-3">Player(s)</div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Points</div>

                              <div className="text-xs text-slate-600">{teamById.get(fixture.home_team_id)?.name ?? "Home"}</div>
                              <div className="sm:col-span-3">
                                {slot.slot_type === "doubles" ? (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <select
                                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                      value={slot.home_player1_id ?? ""}
                                      onChange={(e) => void updateFrameWithDerivedWinner(slot, { home_player1_id: e.target.value || null, home_forfeit: false })}
                                    >
                                      <option value="">Home player 1</option>
                                      {homeDoublesOptions.map((id) => (
                                        <option key={id} value={id} disabled={slot.home_player2_id === id}>
                                          {named(playerById.get(id))}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                      value={slot.home_player2_id ?? ""}
                                      onChange={(e) => void updateFrameWithDerivedWinner(slot, { home_player2_id: e.target.value || null })}
                                    >
                                      <option value="">Home player 2</option>
                                      {homeDoublesOptions.map((id) => (
                                        <option key={id} value={id} disabled={slot.home_player1_id === id}>
                                          {named(playerById.get(id))}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <select
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                    value={homeSelection}
                                    onChange={(e) => void applySinglesSelection(slot, "home", e.target.value)}
                                  >
                                    <option value="">Home player</option>
                                    {isWinterFormat && slot.slot_no === 4 ? <option value="__NO_SHOW__">No Show</option> : null}
                                    {isWinterFormat && slot.slot_no === 3 ? <option value="__NOMINATED__">Nominated Player</option> : null}
                                    {!isWinterFormat && slot.slot_type === "singles" && slot.slot_no >= 5 ? <option value="__NO_SHOW__">No Show</option> : null}
                                    {homeRosterIds.map((id) => (
                                      <option key={id} value={id} disabled={(homeSinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.home_player1_id !== id}>
                                        {named(playerById.get(id))}
                                        {(homeSinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.home_player1_id !== id ? " (Already used in singles)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <input
                                key={`home-points-${slot.id}-${slot.home_points_scored ?? ""}`}
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                min={0}
                                max={200}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                defaultValue={slot.home_points_scored ?? ""}
                                onBlur={(e) => void updateFramePoints(slot, "home", e.target.value)}
                                placeholder="0-200"
                              />

                              <div className="text-xs text-slate-600">{teamById.get(fixture.away_team_id)?.name ?? "Away"}</div>
                              <div className="sm:col-span-3">
                                {slot.slot_type === "doubles" ? (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <select
                                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                      value={slot.away_player1_id ?? ""}
                                      onChange={(e) => void updateFrameWithDerivedWinner(slot, { away_player1_id: e.target.value || null, away_forfeit: false })}
                                    >
                                      <option value="">Away player 1</option>
                                      {awayDoublesOptions.map((id) => (
                                        <option key={id} value={id} disabled={slot.away_player2_id === id}>
                                          {named(playerById.get(id))}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                      value={slot.away_player2_id ?? ""}
                                      onChange={(e) => void updateFrameWithDerivedWinner(slot, { away_player2_id: e.target.value || null })}
                                    >
                                      <option value="">Away player 2</option>
                                      {awayDoublesOptions.map((id) => (
                                        <option key={id} value={id} disabled={slot.away_player1_id === id}>
                                          {named(playerById.get(id))}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <select
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                    value={awaySelection}
                                    onChange={(e) => void applySinglesSelection(slot, "away", e.target.value)}
                                  >
                                    <option value="">Away player</option>
                                    {isWinterFormat && slot.slot_no === 4 ? <option value="__NO_SHOW__">No Show</option> : null}
                                    {isWinterFormat && slot.slot_no === 3 ? <option value="__NOMINATED__">Nominated Player</option> : null}
                                    {!isWinterFormat && slot.slot_type === "singles" && slot.slot_no >= 5 ? <option value="__NO_SHOW__">No Show</option> : null}
                                    {awayRosterIds.map((id) => (
                                      <option key={id} value={id} disabled={(awaySinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.away_player1_id !== id}>
                                        {named(playerById.get(id))}
                                        {(awaySinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.away_player1_id !== id ? " (Already used in singles)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <input
                                key={`away-points-${slot.id}-${slot.away_points_scored ?? ""}`}
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                min={0}
                                max={200}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                defaultValue={slot.away_points_scored ?? ""}
                                onBlur={(e) => void updateFramePoints(slot, "away", e.target.value)}
                                placeholder="0-200"
                              />
                            </div>
                            {slot.slot_type === "singles" && isWinterFormat && slot.slot_no === 3 ? (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {slot.home_nominated ? (
                                  <select
                                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                    value={nominatedNames[`${slot.id}:home`] ?? ""}
                                    onChange={(e) => {
                                      setNominatedNames((prev) => ({ ...prev, [`${slot.id}:home`]: e.target.value }));
                                      void updateNominatedName(slot, "home", e.target.value);
                                    }}
                                  >
                                    <option value="">Home nominated player (info)</option>
                                    {homeNominatedOptions.map((id) => (
                                      <option key={id} value={named(playerById.get(id))}>
                                        {named(playerById.get(id))}
                                      </option>
                                    ))}
                                  </select>
                                ) : <div />}
                                {slot.away_nominated ? (
                                  <select
                                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                    value={nominatedNames[`${slot.id}:away`] ?? ""}
                                    onChange={(e) => {
                                      setNominatedNames((prev) => ({ ...prev, [`${slot.id}:away`]: e.target.value }));
                                      void updateNominatedName(slot, "away", e.target.value);
                                    }}
                                  >
                                    <option value="">Away nominated player (info)</option>
                                    {awayNominatedOptions.map((id) => (
                                      <option key={id} value={named(playerById.get(id))}>
                                        {named(playerById.get(id))}
                                      </option>
                                    ))}
                                  </select>
                                ) : <div />}
                              </div>
                            ) : null}
                            <p className="mt-2 text-xs text-slate-600">
                              Winner: {slot.winner_side === "home" ? (teamById.get(fixture.home_team_id)?.name ?? "Home") : slot.winner_side === "away" ? (teamById.get(fixture.away_team_id)?.name ?? "Away") : "Not decided"}
                            </p>
                            <p className="text-xs text-slate-500">
                              No Show on both sides = no frame point. Nominated player frames still award team points, but no player profile stats.
                            </p>
                          </div>
                        );
                      })}
                      </fieldset>
                    </div>

                    <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <fieldset disabled={isCurrentFixtureLocked} className={isCurrentFixtureLocked ? "cursor-not-allowed opacity-85" : ""}>
                      <h3 className="text-base font-semibold text-slate-900">Breaks 30+</h3>
                      <p className="mt-1 text-xs text-slate-600">Record up to 4 by default. Use More for additional breaks.</p>
                      {!breaksFeatureAvailable ? (
                        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          Break tracking table is missing. Run the SQL migration first.
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {fixtureBreaks.map((row, idx) => (
                          <div key={`break-${idx}`} className="grid gap-2 sm:grid-cols-4">
                            <select
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                              value={row.player_id ?? ""}
                              onChange={(e) => setBreakField(idx, { player_id: e.target.value || null })}
                            >
                              <option value="">Select player</option>
                              {fixturePlayerOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <input
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                              placeholder="Or enter player name"
                              value={row.entered_player_name}
                              onChange={(e) => setBreakField(idx, { entered_player_name: e.target.value })}
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              min={30}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                              placeholder="Break value (30+)"
                              value={row.break_value}
                              onChange={(e) => setBreakField(idx, { break_value: e.target.value })}
                            />
                            <button
                              type="button"
                              onClick={() => setFixtureBreaks((prev) => prev.filter((_, i) => i !== idx))}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
                              disabled={fixtureBreaks.length <= 4 && idx < 4}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={addBreakRow}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                        >
                          More
                        </button>
                        <button
                          type="button"
                          onClick={saveFixtureBreaks}
                          className="rounded-xl bg-slate-900 px-4 py-1.5 text-sm font-medium text-white"
                        >
                          Save breaks
                        </button>
                      </div>
                      </fieldset>
                    </section>
                    {canManage && currentFixture && !isCurrentFixtureLocked ? (
                      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-slate-600">
                            Super User changes save as you edit. Use this to keep partial progress, recompute the fixture status, and close the entry screen.
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              await recomputeFixtureScore(currentFixture.id);
                              setResultEntryOpen(false);
                            }}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                          >
                            {computeFixtureProgress(currentFixture).status === "complete" ? "Save and complete fixture" : "Save progress and close"}
                          </button>
                        </div>
                      </section>
                    ) : null}
                    {!canManage && !isCurrentFixtureLocked ? (
                      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                          <input
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            placeholder="Optional scorecard photo URL"
                            value={scorecardPhotoUrl}
                            onChange={(e) => setScorecardPhotoUrl(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => void submitFixtureResult()}
                            disabled={Boolean(pendingFixtureSubmission)}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pendingFixtureSubmission ? "Submission pending" : "Submit for approval"}
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          Once submitted, the fixture is locked until Super User review.
                        </p>
                      </section>
                    ) : (
                      <p className="mt-3 text-xs text-slate-600">
                        {isCurrentFixtureLocked
                          ? "This result is finalized and read-only."
                          : "Changes save automatically for Super User."}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {activeView === "table" ? (
              <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-emerald-900">League Table</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="px-2 py-2">#</th>
                        <th className="px-2 py-2">Team</th>
                        <th className="px-2 py-2">P</th>
                        <th className="px-2 py-2">W</th>
                        <th className="px-2 py-2">L</th>
                        <th className="px-2 py-2">FF</th>
                        <th className="px-2 py-2">FA</th>
                        <th className="px-2 py-2">FD</th>
                        <th className="px-2 py-2">Points</th>
                        <th className="px-2 py-2">Streak</th>
                        <th className="px-2 py-2">Last 5</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seasonTable.map((r, idx) => (
                        <tr key={r.team_id} className="border-b border-slate-100 text-slate-800">
                          <td className="px-2 py-2">{idx + 1}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              className="text-left underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                              onClick={() => setSelectedTableTeamId(r.team_id)}
                            >
                              {r.team_name}
                            </button>
                          </td>
                          <td className="px-2 py-2">{r.played}</td>
                          <td className="px-2 py-2">{r.won}</td>
                          <td className="px-2 py-2">{r.lost}</td>
                          <td className="px-2 py-2">{r.frames_for}</td>
                          <td className="px-2 py-2">{r.frames_against}</td>
                          <td className="px-2 py-2">{r.frame_diff}</td>
                          <td className="px-2 py-2 font-semibold">{r.points}</td>
                          <td className="px-2 py-2">{r.streak}</td>
                          <td className="px-2 py-2">{r.last_five}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!seasonTable.length ? <p className="mt-2 text-sm text-slate-600">No table rows yet for this league.</p> : null}
                </div>
              </section>
              ) : null}

              {activeView === "playerTable" ? (
              <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-violet-900">Player Table</h2>
                {seasonId ? (
                  <>
                    <p className="mt-1 text-[11px] text-slate-600">Ranking is based on Singles results.</p>
                    <div className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-1.5 text-center" rowSpan={2}>Rank</th>
                            <th className="px-2 py-1.5" rowSpan={2}>Player</th>
                            <th className="px-2 py-1.5" rowSpan={2}>Team</th>
                            <th className="px-2 py-1.5 text-center text-violet-800" colSpan={5}>Singles</th>
                            <th className="px-2 py-1.5 text-center text-indigo-800" colSpan={5}>Doubles</th>
                            <th className="px-2 py-1.5 text-center text-emerald-800" colSpan={5}>Total</th>
                          </tr>
                          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-600">
                            <th className="px-2 py-1 text-center">App</th>
                            <th className="px-2 py-1 text-center">Played</th>
                            <th className="px-2 py-1 text-center">Won</th>
                            <th className="px-2 py-1 text-center">Lost</th>
                            <th className="px-2 py-1 text-center">Win %</th>
                            <th className="px-2 py-1 text-center">App</th>
                            <th className="px-2 py-1 text-center">Played</th>
                            <th className="px-2 py-1 text-center">Won</th>
                            <th className="px-2 py-1 text-center">Lost</th>
                            <th className="px-2 py-1 text-center">Win %</th>
                            <th className="px-2 py-1 text-center">App</th>
                            <th className="px-2 py-1 text-center">Played</th>
                            <th className="px-2 py-1 text-center">Won</th>
                            <th className="px-2 py-1 text-center">Lost</th>
                            <th className="px-2 py-1 text-center">Win %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerSummaryRows.map((r) => (
                            <tr key={r.player_id} className="border-b border-slate-100 text-slate-800">
                              <td className="px-2 py-1 text-center font-semibold">{r.rank ?? "-"}</td>
                              <td className="px-2 py-1">{r.player_name}</td>
                              <td className="px-2 py-1">{r.team_name}</td>
                              <td className="px-2 py-1 text-center">{r.singles?.appearances ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.singles?.played ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.singles?.won ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.singles?.lost ?? 0}</td>
                              <td className="px-2 py-1 text-center">{(r.singles?.win_pct ?? 0).toFixed(1)}%</td>
                              <td className="px-2 py-1 text-center">{r.doubles?.appearances ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.doubles?.played ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.doubles?.won ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.doubles?.lost ?? 0}</td>
                              <td className="px-2 py-1 text-center">{(r.doubles?.win_pct ?? 0).toFixed(1)}%</td>
                              <td className="px-2 py-1 text-center">{r.total?.appearances ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.total?.played ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.total?.won ?? 0}</td>
                              <td className="px-2 py-1 text-center">{r.total?.lost ?? 0}</td>
                              <td className="px-2 py-1 text-center">{(r.total?.win_pct ?? 0).toFixed(1)}%</td>
                            </tr>
                          ))}
                          {playerSummaryRows.length === 0 ? (
                            <tr>
                              <td className="px-2 py-2 text-slate-500" colSpan={18}>
                                No player data yet.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">Select a published league to view player statistics.</p>
                )}
              </section>
              ) : null}

              {activeView === "handicaps" && canManage ? (
              <section className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-white to-fuchsia-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-fuchsia-900">Handicap Management</h2>
                <p className="mt-1 text-sm text-slate-600">
                  View and adjust player handicaps. Elo updates per valid frame; handicaps should then be reviewed from Elo rather than moved by individual wins/losses.
                </p>
                <div className="mt-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm text-fuchsia-950">
                  <p className="font-semibold">How snooker handicaps now work</p>
                  <ul className="mt-2 space-y-1 text-xs leading-6 text-fuchsia-900">
                      <li>Elo rating updates after every valid competitive frame.</li>
                      <li>No-show, nominated-player, and void frames do not affect Elo or handicap.</li>
                      <li>Handicaps are reviewed from Elo when the Super User runs a review.</li>
                      <li>Target handicap now matches the original Elo seed formula: handicap = nearest multiple of 4 to (1000 - Elo) / 5.</li>
                      <li>Each review moves a player by a maximum of 4 points toward that Elo-based target handicap.</li>
                      <li>Live match starts are capped at {MAX_SNOOKER_START} so a fixture stays competitive even when the Elo gap is wider.</li>
                      <li>Manual overrides remain available where league rules require correction.</li>
                    </ul>
                  </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">Elo to handicap guide</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Reference points for the current conversion model. Higher Elo means a stronger player and therefore a more negative handicap.
                  </p>
                  <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                          <th className="px-3 py-2">Elo</th>
                          <th className="px-3 py-2">Handicap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eloHandicapGuideRows.map((row) => (
                          <tr key={row.elo} className="border-b border-slate-100 text-slate-800 last:border-b-0">
                            <td className="px-3 py-2">{row.elo}</td>
                            <td className="px-3 py-2 font-semibold">{row.handicap}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-fuchsia-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Weekly Elo review</p>
                      <p className="text-xs text-slate-600">
                        Recalculate current handicaps from each league player's snooker Elo. Movement is capped at 4 points per review and recorded in history.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void recalculateSnookerHandicapsFromElo()}
                      disabled={recalculatingHandicaps}
                      className="rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {recalculatingHandicaps ? "Recalculating..." : "Recalculate from Elo"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Copy-ready handicap list</p>
                      <p className="text-xs text-slate-600">
                        Uses the current club/team filter. This is formatted so you can paste it directly into WhatsApp or email.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!handicapBroadcastText}
                      onClick={async () => {
                        if (!handicapBroadcastText) return;
                        try {
                          await navigator.clipboard.writeText(handicapBroadcastText);
                          setInfoModal({ title: "Handicap List Copied", description: "Current handicap list copied to clipboard." });
                        } catch {
                          setMessage("Could not copy to clipboard. Select the text manually instead.");
                        }
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                    >
                      Copy list
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={handicapBroadcastText}
                    className="mt-3 min-h-48 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-800"
                    placeholder="Select club and team to build a copy-ready handicap list."
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-6">
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={handicapVenueId}
                    onChange={(e) => {
                      setHandicapVenueId(e.target.value);
                      setHandicapTeamId("");
                    }}
                  >
                    <option value="">Select club</option>
                    {venueLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {locationLabel(location.name)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={handicapTeamId}
                    onChange={(e) => setHandicapTeamId(e.target.value)}
                  >
                    <option value="">Select team</option>
                    {handicapTeamsForVenue.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={handicapPlayerId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setHandicapPlayerId(nextId);
                      const p = players.find((x) => x.id === nextId);
                      setHandicapTargetValue(String(p?.snooker_handicap ?? 0));
                    }}
                  >
                    <option value="">
                      {handicapVenueId && handicapTeamId ? "Select player" : "Select club and team first"}
                    </option>
                    {handicapPlayersFiltered.map((row) => (
                      <option key={row.id} value={row.id}>
                        {named(row)}{row.teams.length ? ` · ${row.teams.join(", ")}` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={-200}
                    max={200}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Target handicap"
                    value={handicapTargetValue}
                    onChange={(e) => setHandicapTargetValue(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Reason (required)"
                    value={handicapReason}
                    onChange={(e) => setHandicapReason(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingHandicap || !handicapPlayerId || !handicapReason.trim()}
                      onClick={() => void updateHandicap("set_current")}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-60"
                    >
                      Set current
                    </button>
                    <button
                      type="button"
                      disabled={savingHandicap || !handicapPlayerId || !handicapReason.trim()}
                      onClick={() => void updateHandicap("set_base_and_current")}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-60"
                    >
                      Override baseline
                    </button>
                    <button
                      type="button"
                      disabled={savingHandicap || !handicapPlayerId || !handicapReason.trim()}
                      onClick={() => void updateHandicap("adjust_current", 4)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-60"
                    >
                      +4 adjust
                    </button>
                    <button
                      type="button"
                      disabled={savingHandicap || !handicapPlayerId || !handicapReason.trim()}
                      onClick={() => void updateHandicap("adjust_current", -4)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-60"
                    >
                      -4 adjust
                    </button>
                  </div>
                </div>
                <div className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="px-2 py-2">Player</th>
                        <th className="px-2 py-2">Teams</th>
                        <th className="px-2 py-2">Current</th>
                        <th className="px-2 py-2">Base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {handicapPlayersFiltered.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 text-slate-800">
                          <td className="px-2 py-2">{named(row)}</td>
                          <td className="px-2 py-2">{row.teams.length ? row.teams.join(", ") : "-"}</td>
                          <td className="px-2 py-2 font-semibold">{(row.snooker_handicap ?? 0) > 0 ? `+${row.snooker_handicap}` : (row.snooker_handicap ?? 0)}</td>
                          <td className="px-2 py-2">{(row.snooker_handicap_base ?? 0) > 0 ? `+${row.snooker_handicap_base}` : (row.snooker_handicap_base ?? 0)}</td>
                        </tr>
                      ))}
                      {handicapPlayersFiltered.length === 0 ? (
                        <tr>
                          <td className="px-2 py-2 text-slate-500" colSpan={4}>
                            {handicapVenueId && handicapTeamId
                              ? "No players match the selected club/team."
                              : "Select club and team to load players."}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">Handicap History</h3>
                <div className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Player</th>
                        <th className="px-2 py-2">Change</th>
                        <th className="px-2 py-2">From/To</th>
                        <th className="px-2 py-2">Reason</th>
                        <th className="px-2 py-2">Fixture</th>
                      </tr>
                    </thead>
                    <tbody>
                      {handicapHistoryFiltered.map((h) => {
                        const f = h.fixture_id ? fixtures.find((fx) => fx.id === h.fixture_id) : null;
                        return (
                          <tr key={h.id} className="border-b border-slate-100 text-slate-800">
                            <td className="px-2 py-2">{new Date(h.created_at).toLocaleString()}</td>
                            <td className="px-2 py-2">{named(playerById.get(h.player_id))}</td>
                            <td className="px-2 py-2 font-semibold">{h.delta > 0 ? `+${h.delta}` : h.delta}</td>
                            <td className="px-2 py-2">{h.previous_handicap} → {h.new_handicap}</td>
                            <td className="px-2 py-2">{h.reason ?? "-"}</td>
                            <td className="px-2 py-2">
                              {f ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSeasonId(f.season_id);
                                    setActiveView("fixtures");
                                    setFixtureId(f.id);
                                    setResultEntryOpen(true);
                                  }}
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                                >
                                  {(teamById.get(f.home_team_id)?.name ?? "Home")} {f.home_points}-{f.away_points} {(teamById.get(f.away_team_id)?.name ?? "Away")}
                                </button>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {handicapHistoryFiltered.length === 0 ? (
                        <tr>
                          <td className="px-2 py-2 text-slate-500" colSpan={6}>
                            No handicap history yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
              ) : null}

              {selectedTableTeamId ? (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4">
                  <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Team Overview</p>
                          <h3 className="mt-1 text-xl font-semibold text-slate-900">
                          Team Details: {teamById.get(selectedTableTeamId)?.name ?? "Team"}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">Season roster and fixture summary for the selected team.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedTableTeamId(null)}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm"
                        >
                          Close
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Fixtures</p>
                          <p className="mt-1 text-2xl font-semibold text-slate-900">{selectedTeamResultsSummary.total}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-white px-3 py-3 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Played</p>
                          <p className="mt-1 text-2xl font-semibold text-emerald-900">{selectedTeamResultsSummary.played}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-white px-3 py-3 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">In Progress</p>
                          <p className="mt-1 text-2xl font-semibold text-amber-900">{selectedTeamResultsSummary.inProgress}</p>
                        </div>
                        <div className="rounded-2xl border border-sky-200 bg-white px-3 py-3 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Upcoming</p>
                          <p className="mt-1 text-2xl font-semibold text-sky-900">{selectedTeamResultsSummary.upcoming}</p>
                        </div>
                      </div>
                      {selectedTeamRoster.some((player) => player.isCaptain || player.isViceCaptain) ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {selectedTeamRoster
                              .filter((player) => player.isCaptain || player.isViceCaptain)
                              .map((player) => (
                                <span
                                  key={`${selectedTableTeamId}-${player.id}-role`}
                                  className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm"
                                >
                                  {player.isCaptain ? "Captain" : "Vice-captain"}: {player.name}
                                </span>
                              ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="px-5 py-4">
                      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-emerald-900">Season roster</h4>
                          <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            {selectedTeamRoster.length} player{selectedTeamRoster.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {selectedTeamRoster.length > 0 ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {selectedTeamRoster.map((player) => (
                              <div key={`${selectedTableTeamId}-${player.id}`} className="rounded-2xl border border-emerald-100 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <Link
                                      href={`/players/${player.id}`}
                                      className="font-medium text-slate-900 underline decoration-emerald-200 underline-offset-2 hover:text-emerald-800"
                                    >
                                      {player.name}
                                    </Link>
                                    <p className="mt-1 text-xs text-slate-600">
                                      Handicap{" "}
                                      <span className="font-semibold text-slate-800">
                                        {player.handicap === null
                                          ? "—"
                                          : player.handicap > 0
                                            ? `+${player.handicap}`
                                            : `${player.handicap}`}
                                      </span>
                                    </p>
                                  </div>
                                  {player.isCaptain || player.isViceCaptain ? (
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                      {player.isCaptain ? "C" : "VC"}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-600">No players are currently assigned to this season team.</p>
                        )}
                      </div>
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">Fixture results</h4>
                            <p className="mt-1 text-xs text-slate-600">Recent and upcoming fixtures for this team.</p>
                          </div>
                        </div>
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/50">
                          <table className="min-w-full border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Week</th>
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Date</th>
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Venue</th>
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Opponent</th>
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Score</th>
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Result</th>
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Status</th>
                            <th className="border-b border-slate-200 bg-slate-100 px-3 py-3">Summary</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTeamResults.map((r) => (
                            <tr
                              key={r.id}
                              className={`text-slate-800 ${
                                r.status === "complete"
                                  ? "bg-emerald-50/55"
                                  : r.status === "in_progress"
                                    ? "bg-amber-50/55"
                                    : "bg-white"
                              }`}
                            >
                              <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-700">{r.week ?? "-"}</td>
                              <td className="border-b border-slate-100 px-3 py-3">{r.date ? new Date(`${r.date}T12:00:00`).toLocaleDateString() : "No date"}</td>
                              <td className="border-b border-slate-100 px-3 py-3">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  r.isHome
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                                    : "border-slate-200 bg-slate-100 text-slate-700"
                                }`}>
                                  {r.isHome ? "Home" : "Away"}
                                </span>
                              </td>
                              <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{r.opponent}</td>
                              <td className="border-b border-slate-100 px-3 py-3">
                                <span className="rounded-lg bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200">
                                  {r.score}
                                </span>
                              </td>
                              <td className="border-b border-slate-100 px-3 py-3">
                                <span
                                  className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
                                    r.result === "W"
                                      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                                      : r.result === "L"
                                        ? "border-rose-300 bg-rose-100 text-rose-900"
                                        : r.result === "D"
                                          ? "border-slate-300 bg-slate-100 text-slate-800"
                                          : "border-slate-300 bg-white text-slate-600"
                                  }`}
                                >
                                  {r.result}
                                </span>
                              </td>
                              <td className="border-b border-slate-100 px-3 py-3">
                                <span
                                  className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                                    r.status === "complete"
                                      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                                      : r.status === "in_progress"
                                        ? "border-amber-300 bg-amber-100 text-amber-900"
                                        : "border-slate-300 bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {statusLabel(r.status)}
                                </span>
                              </td>
                              <td className="border-b border-slate-100 px-3 py-3">
                                {r.status === "complete" ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTeamResultFixtureId(r.id)}
                                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                                  >
                                    View match
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-500">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                          </table>
                          {selectedTeamResults.length === 0 ? <p className="mt-3 px-1 text-sm text-slate-600">No results for this team yet.</p> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedTeamResultFixture ? (
                <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4">
                  <div className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-2xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50 p-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-indigo-900">Match Summary</h3>
                      <button
                        type="button"
                        onClick={() => setSelectedTeamResultFixtureId(null)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                      >
                        Close
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-slate-800">
                      {teamById.get(selectedTeamResultFixture.home_team_id)?.name ?? "Home"} vs{" "}
                      {teamById.get(selectedTeamResultFixture.away_team_id)?.name ?? "Away"}
                    </p>
                    <p className="text-xs text-slate-600">
                      Week {selectedTeamResultFixture.week_no ?? "-"} ·{" "}
                      {selectedTeamResultFixture.fixture_date
                        ? new Date(`${selectedTeamResultFixture.fixture_date}T12:00:00`).toLocaleDateString()
                        : "No date"}
                    </p>
                    {selectedTeamResultReschedule ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full border px-2 py-0.5 font-semibold ${selectedTeamResultReschedule.chip === "Brought forward" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                          {selectedTeamResultReschedule.chip}
                        </span>
                        <span className="text-slate-600">{selectedTeamResultReschedule.detail}</span>
                      </div>
                    ) : null}
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      Final: {computeFixtureProgress(selectedTeamResultFixture).homePoints} -{" "}
                      {computeFixtureProgress(selectedTeamResultFixture).awayPoints}
                    </p>
                    {selectedTeamHodgeBreakdown.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-slate-700">
                        <p className="font-semibold text-indigo-900">Hodge aggregate bonus breakdown (pairs 1+4, 2+5, 3+6)</p>
                        <p className="mt-0.5 text-slate-600">First drawn team is treated as Home throughout.</p>
                        <div className="mt-1 space-y-1">
                          {selectedTeamHodgeBreakdown.map((p) => (
                            <p key={`${selectedTeamResultFixture.id}-hodge-pair-${p.pairNo}`}>
                              Pair {p.pairNo} (Frames {p.framesLabel}): Home {p.homeTotal} - Away {p.awayTotal}
                              {" · "}
                              Bonus: {p.bonusWinner === "home" ? "Home" : p.bonusWinner === "away" ? "Away" : "None"}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-slate-600">
                            <th className="px-2 py-2">Frame</th>
                            <th className="px-2 py-2">Home player(s)</th>
                            <th className="px-2 py-2">Score</th>
                            <th className="px-2 py-2 text-right">Away player(s)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTeamResultFrames.map((row) => (
                            <tr key={row.id} className="border-b border-slate-100 text-slate-800">
                              <td className="px-2 py-2">{row.label}</td>
                              <td className="px-2 py-2">
                                <span
                                  className={`inline-flex rounded-md px-2 py-1 ${
                                    row.winnerSide === "home" ? "border border-emerald-300 bg-emerald-100 font-semibold text-emerald-900" : ""
                                  }`}
                                >
                                  {row.homePlayers}
                                </span>
                              </td>
                              <td className="px-2 py-2 font-medium">
                                <div>{row.score}</div>
                                {row.handicapNote ? <div className="mt-0.5 text-[11px] font-normal text-slate-600">{row.handicapNote}</div> : null}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <span
                                  className={`inline-flex rounded-md px-2 py-1 ${
                                    row.winnerSide === "away" ? "border border-emerald-300 bg-emerald-100 font-semibold text-emerald-900" : ""
                                  }`}
                                >
                                  {row.awayPlayers}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeView === "fixtures" && canManage ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Pending Result Approvals</h2>
                  {!allPendingSubmissions.length ? <p className="mt-2 text-sm text-slate-600">No pending league submissions.</p> : null}
                  <div className="mt-3 space-y-2">
                    {allPendingSubmissions.map((s) => {
                      const f = fixtures.find((fx) => fx.id === s.fixture_id);
                      const homeName = f ? teamById.get(f.home_team_id)?.name ?? "Home" : "Home";
                      const awayName = f ? teamById.get(f.away_team_id)?.name ?? "Away" : "Away";
                      const submissionSeason = seasonById.get(s.season_id) ?? null;
                      const submissionCfg = getSeasonFrameConfig(submissionSeason);
                      const frameResults = [...(s.frame_results ?? [])].sort((a, b) => a.slot_no - b.slot_no);
                      const { homePoints: homeFrames, awayPoints: awayFrames } = calculateFixturePoints(frameResults, submissionSeason);
                      const hodgeBreakdown = submissionCfg.isHodgeTriples
                        ? [
                            { pairNo: 1, framesLabel: "1+4", ...(() => {
                              const ra = frameResults.find((r) => r.slot_no === 1);
                              const rb = frameResults.find((r) => r.slot_no === 4);
                              const homeTotal =
                                (typeof ra?.home_points_scored === "number" ? ra.home_points_scored : 0) +
                                (typeof rb?.home_points_scored === "number" ? rb.home_points_scored : 0);
                              const awayTotal =
                                (typeof ra?.away_points_scored === "number" ? ra.away_points_scored : 0) +
                                (typeof rb?.away_points_scored === "number" ? rb.away_points_scored : 0);
                              return { homeTotal, awayTotal, bonusWinner: homeTotal > awayTotal ? "home" : awayTotal > homeTotal ? "away" : "none" };
                            })() },
                            { pairNo: 2, framesLabel: "2+5", ...(() => {
                              const ra = frameResults.find((r) => r.slot_no === 2);
                              const rb = frameResults.find((r) => r.slot_no === 5);
                              const homeTotal =
                                (typeof ra?.home_points_scored === "number" ? ra.home_points_scored : 0) +
                                (typeof rb?.home_points_scored === "number" ? rb.home_points_scored : 0);
                              const awayTotal =
                                (typeof ra?.away_points_scored === "number" ? ra.away_points_scored : 0) +
                                (typeof rb?.away_points_scored === "number" ? rb.away_points_scored : 0);
                              return { homeTotal, awayTotal, bonusWinner: homeTotal > awayTotal ? "home" : awayTotal > homeTotal ? "away" : "none" };
                            })() },
                            { pairNo: 3, framesLabel: "3+6", ...(() => {
                              const ra = frameResults.find((r) => r.slot_no === 3);
                              const rb = frameResults.find((r) => r.slot_no === 6);
                              const homeTotal =
                                (typeof ra?.home_points_scored === "number" ? ra.home_points_scored : 0) +
                                (typeof rb?.home_points_scored === "number" ? rb.home_points_scored : 0);
                              const awayTotal =
                                (typeof ra?.away_points_scored === "number" ? ra.away_points_scored : 0) +
                                (typeof rb?.away_points_scored === "number" ? rb.away_points_scored : 0);
                              return { homeTotal, awayTotal, bonusWinner: homeTotal > awayTotal ? "home" : awayTotal > homeTotal ? "away" : "none" };
                            })() },
                          ]
                        : [];
                      return (
                        <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="font-medium text-slate-900">
                            {homeName} vs {awayName}
                          </p>
                          <p className="text-xs text-slate-600">
                            Submitted: {new Date(s.created_at).toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-800">
                            Submitted score: {homeName} {homeFrames} - {awayFrames} {awayName}
                          </p>
                          {submissionCfg.isHodgeTriples ? (
                            <p className="mt-1 text-[11px] text-slate-600">
                              Includes Hodge aggregate bonus points for slot pairs 1+4, 2+5, 3+6.
                            </p>
                          ) : null}
                          {hodgeBreakdown.length > 0 ? (
                            <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-[11px] text-slate-700">
                              <p className="font-semibold text-indigo-900">Hodge aggregate bonus breakdown</p>
                              <p className="text-slate-600">First drawn team is Home.</p>
                              <div className="mt-1 space-y-1">
                                {hodgeBreakdown.map((p) => (
                                  <p key={`${s.id}-pending-hodge-${p.pairNo}`}>
                                    Pair {p.pairNo} (Frames {p.framesLabel}): Home {p.homeTotal} - Away {p.awayTotal} · Bonus: {p.bonusWinner === "home" ? "Home" : p.bonusWinner === "away" ? "Away" : "None"}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {`Frame results (${submissionCfg.singles} singles${submissionCfg.doubles > 0 ? ` + ${submissionCfg.doubles} doubles` : ""})`}
                            </p>
                            <ul className="mt-1 space-y-1 text-xs text-slate-700">
                              {frameResults.map((r) => (
                                <li key={`${s.id}-${r.slot_no}`}>
                                  {slotLabel(r.slot_no, submissionSeason)}: {r.winner_side === "home" ? homeName : r.winner_side === "away" ? awayName : "Not set"}
                                </li>
                              ))}
                              {!frameResults.length ? <li>No frame results submitted.</li> : null}
                            </ul>
                          </div>
                          {s.scorecard_photo_url ? (
                            <p className="mt-2 text-xs">
                              <a href={s.scorecard_photo_url} target="_blank" rel="noreferrer" className="text-teal-700 underline">
                                Open scorecard photo
                              </a>
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => { setActiveView("fixtures"); setFixtureId(s.fixture_id); setResultEntryOpen(true); }}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                            >
                              Open result entry
                            </button>
                            <button
                              type="button"
                              onClick={() => void reviewSubmission(s.id, "approved")}
                              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void reviewSubmission(s.id, "rejected")}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                      placeholder="Optional rejection reason (used when rejecting)"
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                    />
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}

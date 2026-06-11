"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import InfoModal from "@/components/InfoModal";
import ConfirmModal from "@/components/ConfirmModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import { calculateAdjustedScoresWithCap, MAX_SNOOKER_START } from "@/lib/snooker-handicap";

type Season = {
  id: string;
  name: string;
  is_published?: boolean | null;
  handicap_enabled?: boolean | null;
  singles_count?: number | null;
  doubles_count?: number | null;
};
type Team = { id: string; season_id: string; name: string };
type TeamMember = {
  season_id: string;
  team_id: string;
  player_id: string;
  is_captain: boolean;
  is_vice_captain: boolean;
};
type Fixture = {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  fixture_date: string | null;
  week_no: number | null;
  status: "pending" | "in_progress" | "complete";
  pre_match_paper_record?: boolean | null;
  pre_match_paper_at?: string | null;
  pre_match_paper_by_user_id?: string | null;
  home_lineup_submitted_at?: string | null;
  home_lineup_submitted_by_user_id?: string | null;
  away_lineup_submitted_at?: string | null;
  away_lineup_submitted_by_user_id?: string | null;
  proxy_entry_enabled?: boolean | null;
  proxy_entry_confirmed_at?: string | null;
  proxy_entry_confirmed_by_user_id?: string | null;
  proxy_entry_by_team_side?: "home" | "away" | null;
  proxy_entry_note?: string | null;
};
type Player = {
  id: string;
  display_name: string;
  full_name: string | null;
  snooker_handicap?: number | null;
  rating_snooker?: number | null;
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
type BreakRow = {
  player_id: string | null;
  entered_player_name: string;
  break_value: string;
};

type SubmissionBreakEntry = {
  player_id: string | null;
  entered_player_name: string | null;
  break_value: number;
};
type SubmissionFrameResult = {
  slot_no: number;
  slot_type: "singles" | "doubles";
  winner_side: "home" | "away" | null;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_nominated: boolean;
  away_nominated: boolean;
  home_forfeit: boolean;
  away_forfeit: boolean;
  home_nominated_name: string | null;
  away_nominated_name: string | null;
  home_points_scored: number | null;
  away_points_scored: number | null;
  break_entries?: SubmissionBreakEntry[];
};
type PendingSubmission = {
  fixture_id: string;
  status: "pending";
  frame_results: SubmissionFrameResult[];
  scorecard_photo_url: string | null;
};
type CaptainResultDraft = {
  slots: FrameSlot[];
  fixtureBreaks: BreakRow[];
  scorecardPhotoUrl: string;
  savedAt: string;
};

function breakRowHasAnyContent(row: BreakRow) {
  return Boolean(row.player_id || row.entered_player_name.trim() || row.break_value.trim());
}

function breakRowsContainUnsavedDraft(rows: BreakRow[]) {
  return rows.some((row) => {
    if (!breakRowHasAnyContent(row)) return false;
    const value = Number(row.break_value || 0);
    const hasPersistableBreak = Number.isFinite(value) && value >= 30 && (row.player_id || row.entered_player_name.trim());
    return !hasPersistableBreak;
  });
}

function padBreakRows(rows: BreakRow[]) {
  const padded = [...rows];
  while (padded.length < 3) padded.push({ player_id: null, entered_player_name: "", break_value: "" });
  return padded;
}

function hydrateBreakRows(rows: SubmissionBreakEntry[]) {
  return padBreakRows(
    rows.map((row) => ({
      player_id: row.player_id ?? null,
      entered_player_name: row.entered_player_name ?? "",
      break_value: String(row.break_value ?? ""),
    }))
  );
}

const named = (p?: Player | null) => (p ? (p.full_name?.trim() ? p.full_name : p.display_name) : "Unknown");
const handicapLabel = (value: number | null | undefined) => {
  const handicap = Number(value ?? 0);
  if (!Number.isFinite(handicap) || handicap === 0) return "(0)";
  return handicap > 0 ? `(+${handicap})` : `(${handicap})`;
};
const namedWithHandicap = (p?: Player | null) => `${named(p)} ${handicapLabel(p?.snooker_handicap)}`;
const ratingOf = (p?: Player | null) => Number(p?.rating_snooker ?? 1000);
const sortLabelByFirstName = (a: string, b: string) => {
  const aParts = a.trim().split(/\s+/);
  const bParts = b.trim().split(/\s+/);
  const firstCompare = (aParts[0] ?? "").localeCompare(bParts[0] ?? "");
  if (firstCompare !== 0) return firstCompare;
  return a.localeCompare(b);
};

function buildScorecardSignature(slots: FrameSlot[], fixtureBreaks: BreakRow[]) {
  return JSON.stringify({
    slots: slots.map((slot) => ({
      id: slot.id,
      slot_no: slot.slot_no,
      winner_side: slot.winner_side,
      home_points_scored: slot.home_points_scored ?? null,
      away_points_scored: slot.away_points_scored ?? null,
      home_forfeit: slot.home_forfeit,
      away_forfeit: slot.away_forfeit,
      home_nominated_name: slot.home_nominated_name ?? null,
      away_nominated_name: slot.away_nominated_name ?? null,
      home_player1_id: slot.home_player1_id ?? null,
      home_player2_id: slot.home_player2_id ?? null,
      away_player1_id: slot.away_player1_id ?? null,
      away_player2_id: slot.away_player2_id ?? null,
    })),
    fixtureBreaks: fixtureBreaks.map((row) => ({
      player_id: row.player_id ?? null,
      entered_player_name: row.entered_player_name ?? "",
      break_value: row.break_value ?? "",
    })),
  });
}

function isFixtureOpenForSubmission(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const fixtureStart = new Date(`${fixtureDate}T00:00:00`);
  if (Number.isNaN(fixtureStart.getTime())) return false;
  const submissionDeadline = new Date(fixtureStart);
  submissionDeadline.setDate(submissionDeadline.getDate() + 1);
  submissionDeadline.setHours(23, 59, 59, 999);
  const now = new Date();
  return now >= fixtureStart && now <= submissionDeadline;
}

function isFixtureDay(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const now = new Date();
  const fixtureLocal = new Date(`${fixtureDate}T12:00:00`);
  return (
    now.getFullYear() === fixtureLocal.getFullYear() &&
    now.getMonth() === fixtureLocal.getMonth() &&
    now.getDate() === fixtureLocal.getDate()
  );
}

function isBeforeFixtureStart(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const start = new Date(`${fixtureDate}T19:30:00`);
  if (Number.isNaN(start.getTime())) return false;
  return new Date() < start;
}

function isLineupSubmissionOpen(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const start = new Date(`${fixtureDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return false;
  const hardStop = new Date(start);
  hardStop.setDate(hardStop.getDate() + 1);
  hardStop.setHours(1, 0, 0, 0);
  const now = new Date();
  return now >= start && now <= hardStop;
}

function isBeforeHomeLineupCutoff(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const cutoff = new Date(`${fixtureDate}T19:15:00`);
  if (Number.isNaN(cutoff.getTime())) return false;
  return new Date() <= cutoff;
}

function normaliseCaptainApiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : fallback;
  if (message === "Unauthorized." || message === "Missing auth token." || message === "You must be signed in to submit a lineup.") {
    return "Your session needs refreshing. Please close and reopen this fixture, then try again.";
  }
  return message || fallback;
}

function expectedWinProbability(ownRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - ownRating) / 400));
}

const sectionCardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const sectionCardTintClass = "bg-gradient-to-br from-teal-50 via-white to-emerald-50";
const sectionTitleClass = "text-lg font-semibold text-slate-900";

export default function CaptainResultsPage() {
  const admin = useAdminStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title: string; description: string } | null>(null);
  const [confirmSubmitPromptOpen, setConfirmSubmitPromptOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [allSlots, setAllSlots] = useState<FrameSlot[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [scorecardPhotoUrl, setScorecardPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingByFixture, setPendingByFixture] = useState<Set<string>>(new Set());
  const [pendingSubmissionMap, setPendingSubmissionMap] = useState<Map<string, PendingSubmission>>(new Map());

  const [slots, setSlots] = useState<FrameSlot[]>([]);
  const [activeEntryTab, setActiveEntryTab] = useState<"lineup" | "scorecard">("lineup");
  const [nominatedNames, setNominatedNames] = useState<Record<string, string>>({});
  const [breaksFeatureAvailable, setBreaksFeatureAvailable] = useState(true);
  const [fixtureBreaks, setFixtureBreaks] = useState<BreakRow[]>([
    { player_id: null, entered_player_name: "", break_value: "" },
    { player_id: null, entered_player_name: "", break_value: "" },
    { player_id: null, entered_player_name: "", break_value: "" },
  ]);

  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveMutedRef = useRef(true);
  const autoSaveNoticeShownRef = useRef(false);
  const [scorecardCurrentIndex, setScorecardCurrentIndex] = useState(0);
  const [scorecardReviewMode, setScorecardReviewMode] = useState(false);
  const [submitPromptMode, setSubmitPromptMode] = useState<"general" | "final_frame">("general");
  const [frameAdvancePrompt, setFrameAdvancePrompt] = useState<{ slotNo: number; isFinalFrame: boolean } | null>(null);

  const baselineScorecardSignatureRef = useRef("");
  const [scorecardDirty, setScorecardDirty] = useState(false);
  const [remoteScorecardChanged, setRemoteScorecardChanged] = useState(false);

  const canSubmit = !admin.isSuper;
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const loadBreaks = async (fixtureId: string) => {
    const client = supabase;
    if (!client || !fixtureId) return;
    const res = await client
      .from("league_fixture_breaks")
      .select("player_id,entered_player_name,break_value")
      .eq("fixture_id", fixtureId)
      .order("break_value", { ascending: false });
    if (res.error) {
      if (res.error.message?.toLowerCase().includes("does not exist")) {
        setBreaksFeatureAvailable(false);
      }
      return;
    }
    setBreaksFeatureAvailable(true);
    const rows = (res.data ?? []).map((r) => ({
      player_id: (r.player_id as string | null) ?? null,
      entered_player_name: (r.entered_player_name as string | null) ?? "",
      break_value: String(r.break_value ?? ""),
    }));
    setFixtureBreaks(padBreakRows(rows));
  };

  const loadAll = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    setLoading(true);
    const authRes = await client.auth.getUser();
    const userId = authRes.data.user?.id ?? null;
    setCurrentUserId(userId);
    if (!userId) {
      setLoading(false);
      return;
    }
    const appUserRes = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
    const playerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
    setLinkedPlayerId(playerId);
    if (!playerId) {
      setLoading(false);
      return;
    }

    const [seasonRes, teamRes, memberRes, initialFixtureRes, slotRes, pendingRes, playerRes] = await Promise.all([
      client
        .from("league_seasons")
        .select("id,name,is_published,handicap_enabled,singles_count,doubles_count")
        .eq("is_published", true)
        .order("created_at", { ascending: false }),
      client.from("league_teams").select("id,season_id,name"),
      client.from("league_team_members").select("season_id,team_id,player_id,is_captain,is_vice_captain"),
      client
        .from("league_fixtures")
        .select("id,season_id,home_team_id,away_team_id,fixture_date,week_no,status,pre_match_paper_record,pre_match_paper_at,pre_match_paper_by_user_id,home_lineup_submitted_at,home_lineup_submitted_by_user_id,away_lineup_submitted_at,away_lineup_submitted_by_user_id,proxy_entry_enabled,proxy_entry_confirmed_at,proxy_entry_confirmed_by_user_id,proxy_entry_by_team_side,proxy_entry_note")
        .order("fixture_date", { ascending: true }),
      client
        .from("league_fixture_frames")
        .select("id,fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated,away_nominated,home_forfeit,away_forfeit,winner_side,home_nominated_name,away_nominated_name,home_points_scored,away_points_scored")
        .order("slot_no", { ascending: true }),
      client.from("league_result_submissions").select("fixture_id,status,frame_results,scorecard_photo_url").eq("status", "pending"),
      client.from("players").select("id,display_name,full_name,snooker_handicap,rating_snooker").eq("is_archived", false),
    ]);
    let fixtureRows = initialFixtureRes.data ?? [];
    let fixtureError = initialFixtureRes.error?.message ?? null;
    if (initialFixtureRes.error && (initialFixtureRes.error.message.toLowerCase().includes("pre_match_") || initialFixtureRes.error.message.toLowerCase().includes("proxy_entry"))) {
      const fallbackFixtureRes = await client
        .from("league_fixtures")
        .select("id,season_id,home_team_id,away_team_id,fixture_date,week_no,status")
        .order("fixture_date", { ascending: true });
      fixtureRows = (fallbackFixtureRes.data ?? []).map((row) => ({
          ...row,
          pre_match_paper_record: false,
          pre_match_paper_at: null,
          pre_match_paper_by_user_id: null,
          home_lineup_submitted_at: null,
          home_lineup_submitted_by_user_id: null,
          away_lineup_submitted_at: null,
          away_lineup_submitted_by_user_id: null,
          proxy_entry_enabled: false,
          proxy_entry_confirmed_at: null,
          proxy_entry_confirmed_by_user_id: null,
          proxy_entry_by_team_side: null,
          proxy_entry_note: null,
        }));
      fixtureError = fallbackFixtureRes.error?.message ?? null;
    }

    const firstError =
      seasonRes.error?.message ||
      teamRes.error?.message ||
      memberRes.error?.message ||
      fixtureError ||
      slotRes.error?.message ||
      pendingRes.error?.message ||
      playerRes.error?.message ||
      null;

    if (firstError) {
      setMessage(firstError);
      setLoading(false);
      return;
    }

    setSeasons((seasonRes.data ?? []) as Season[]);
    setTeams((teamRes.data ?? []) as Team[]);
    setMembers((memberRes.data ?? []) as TeamMember[]);
    setFixtures(fixtureRows as Fixture[]);
    setAllSlots((slotRes.data ?? []) as FrameSlot[]);
    const pendingRows = (pendingRes.data ?? []) as PendingSubmission[];
    setPendingByFixture(new Set(pendingRows.map((r) => r.fixture_id as string)));
    setPendingSubmissionMap(new Map(pendingRows.map((r) => [r.fixture_id, r])));
    setPlayers((playerRes.data ?? []) as Player[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const captainTeamIds = useMemo(() => {
    if (!linkedPlayerId) return new Set<string>();
    return new Set(
      members
        .filter((m) => m.player_id === linkedPlayerId && (m.is_captain || m.is_vice_captain))
        .map((m) => m.team_id)
    );
  }, [members, linkedPlayerId]);

  const publishedSeasonIds = useMemo(() => new Set(seasons.map((s) => s.id)), [seasons]);

  const myFixtures = useMemo(
    () =>
      fixtures.filter(
        (f) =>
          publishedSeasonIds.has(f.season_id) &&
          (captainTeamIds.has(f.home_team_id) || captainTeamIds.has(f.away_team_id))
      ),
    [fixtures, publishedSeasonIds, captainTeamIds]
  );

  const myCurrentWeekFixtures = useMemo(
    () => myFixtures.filter((f) => f.status !== "complete" && isFixtureOpenForSubmission(f.fixture_date)),
    [myFixtures]
  );

  const selectedFixture = useMemo(
    () => myCurrentWeekFixtures.find((f) => f.id === selectedFixtureId) ?? null,
    [myCurrentWeekFixtures, selectedFixtureId]
  );
  const selectedFixtureSide = useMemo<"home" | "away" | null>(() => {
    if (!selectedFixture) return null;
    if (captainTeamIds.has(selectedFixture.home_team_id)) return "home";
    if (captainTeamIds.has(selectedFixture.away_team_id)) return "away";
    return null;
  }, [captainTeamIds, selectedFixture]);
  const preMatchPaperRecord = Boolean(selectedFixture?.pre_match_paper_record);
  const proxyEntryEnabled = Boolean(selectedFixture?.proxy_entry_enabled);
  const homeLineupSubmitted = Boolean(selectedFixture?.home_lineup_submitted_at);
  const awayLineupSubmitted = Boolean(selectedFixture?.away_lineup_submitted_at);
  const lineupsLocked = Boolean(preMatchPaperRecord || (homeLineupSubmitted && awayLineupSubmitted));
  const lineupWindowOpen = Boolean(selectedFixture && isLineupSubmissionOpen(selectedFixture.fixture_date));
  const canEnableProxyEntry = Boolean(
    selectedFixture &&
      selectedFixtureSide &&
      !proxyEntryEnabled &&
      !preMatchPaperRecord &&
      !pendingByFixture.has(selectedFixture.id) &&
      isFixtureOpenForSubmission(selectedFixture.fixture_date)
  );
  const canSubmitHomeLineup = Boolean(
    selectedFixture &&
      (selectedFixtureSide === "home" || proxyEntryEnabled) &&
      lineupWindowOpen &&
      !preMatchPaperRecord &&
      !homeLineupSubmitted &&
      !awayLineupSubmitted
  );
  const canSubmitAwayLineup = Boolean(
    selectedFixture &&
      (selectedFixtureSide === "away" || proxyEntryEnabled) &&
      lineupWindowOpen &&
      !preMatchPaperRecord &&
      homeLineupSubmitted &&
      !awayLineupSubmitted
  );
  const canEditSubmittedHomeLineup = Boolean(
    selectedFixture &&
      (selectedFixtureSide === "home" || proxyEntryEnabled) &&
      homeLineupSubmitted &&
      !awayLineupSubmitted &&
      isBeforeHomeLineupCutoff(selectedFixture.fixture_date)
  );
  const homeSideCanManageScorecard = Boolean(
    selectedFixture &&
      (selectedFixtureSide === "home" || proxyEntryEnabled) &&
      !pendingByFixture.has(selectedFixture.id)
  );
  const homeLineupStepLabel = preMatchPaperRecord
    ? "Paper record selected"
    : proxyEntryEnabled && !homeLineupSubmitted
      ? "Ready for agreed proxy"
    : canEditSubmittedHomeLineup
      ? "Submitted (editable)"
      : homeLineupSubmitted
      ? "Sent to opponent"
      : canSubmitHomeLineup
        ? "Ready for home captain"
        : "Waiting for home captain";
  const awayLineupStepLabel = preMatchPaperRecord
    ? "Paper record selected"
    : proxyEntryEnabled && homeLineupSubmitted && !awayLineupSubmitted
      ? "Ready for agreed proxy"
    : awayLineupSubmitted
      ? "Confirmed"
      : canSubmitAwayLineup
        ? "Ready for away captain"
        : homeLineupSubmitted
          ? "Waiting for away captain"
          : "Waiting for home lineup";
  const lineupNextAction = preMatchPaperRecord
    ? "Paper lineup selected. You can move to the scorecard whenever you are ready."
    : proxyEntryEnabled && !awayLineupSubmitted
      ? "Agreed proxy entry is active. One captain or vice-captain can now complete both teams in the app for tonight's fixture."
    : awayLineupSubmitted
      ? "Both lineups are locked. You can now switch to the scorecard tab."
      : canEditSubmittedHomeLineup
        ? "Home lineup has been sent, but you can still reopen it before 19:15 if a late change is needed."
      : homeLineupSubmitted
        ? "Home lineup has been sent. Away captain should now complete and confirm the lineup."
        : "Home captain should enter slots 1-6 first and send them to the opponent.";
  const draftStorageKey = selectedFixture ? `rf_league_captain_draft_${selectedFixture.id}` : null;
  useEffect(() => {
    if (!selectedFixtureId) return;
    if (!myCurrentWeekFixtures.some((f) => f.id === selectedFixtureId)) setSelectedFixtureId("");
  }, [selectedFixtureId, myCurrentWeekFixtures]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedFixtureId = new URLSearchParams(window.location.search).get("fixtureId");
    if (!requestedFixtureId) return;
    if (myCurrentWeekFixtures.some((fixture) => fixture.id === requestedFixtureId)) {
      setSelectedFixtureId(requestedFixtureId);
    }
  }, [myCurrentWeekFixtures]);


  const selectedSeason = useMemo(
    () => (selectedFixture ? seasons.find((s) => s.id === selectedFixture.season_id) ?? null : null),
    [seasons, selectedFixture]
  );

  const isWinterFormat = (selectedSeason?.singles_count ?? 4) === 4 && (selectedSeason?.doubles_count ?? 1) === 1;
  const singlesMaxPerPlayer = (selectedSeason?.singles_count ?? 5) === 6 && (selectedSeason?.doubles_count ?? 1) === 0 ? 2 : 1;

  useEffect(() => {
    if (!selectedFixture) {
      setSlots([]);
      setNominatedNames({});
      setScorecardPhotoUrl("");
      setFixtureBreaks([
        { player_id: null, entered_player_name: "", break_value: "" },
        { player_id: null, entered_player_name: "", break_value: "" },
        { player_id: null, entered_player_name: "", break_value: "" },
      ]);
      return;
    }
    const pendingSubmission = pendingSubmissionMap.get(selectedFixture.id);
    if (pendingSubmission) {
      const baseSlots = allSlots
        .filter((s) => s.fixture_id === selectedFixture.id)
        .sort((a, b) => a.slot_no - b.slot_no);
      const pendingBySlot = new Map(pendingSubmission.frame_results.map((row) => [row.slot_no, row]));
      const mergedSlots = baseSlots.map((slot) => {
        const pending = pendingBySlot.get(slot.slot_no);
        return pending ? ({ ...slot, ...pending }) as FrameSlot : slot;
      });
      setSlots(mergedSlots);
      const nn: Record<string, string> = {};
      for (const slot of mergedSlots) {
        if (slot.home_nominated_name) nn[`${slot.id}:home`] = slot.home_nominated_name;
        if (slot.away_nominated_name) nn[`${slot.id}:away`] = slot.away_nominated_name;
      }
      setNominatedNames(nn);
      setScorecardPhotoUrl(pendingSubmission.scorecard_photo_url ?? "");
      const pendingBreaks = pendingSubmission.frame_results.flatMap((row) => row.break_entries ?? []);
      const hydratedBreaks =
        pendingBreaks.length > 0
          ? hydrateBreakRows(pendingBreaks)
          : padBreakRows([]);
      setFixtureBreaks(hydratedBreaks);
      baselineScorecardSignatureRef.current = buildScorecardSignature(mergedSlots, hydratedBreaks);
      setScorecardDirty(false);
      setRemoteScorecardChanged(false);
      return;
    }
    const nextSlots = allSlots
      .filter((s) => s.fixture_id === selectedFixture.id)
      .sort((a, b) => a.slot_no - b.slot_no);
    setSlots(nextSlots);
    const nn: Record<string, string> = {};
    for (const slot of nextSlots) {
      if (slot.home_nominated_name) nn[`${slot.id}:home`] = slot.home_nominated_name;
      if (slot.away_nominated_name) nn[`${slot.id}:away`] = slot.away_nominated_name;
    }
    setNominatedNames(nn);
    setScorecardPhotoUrl("");
    const shouldPreferLiveScorecard = Boolean(homeLineupSubmitted && awayLineupSubmitted && homeSideCanManageScorecard);
    if (typeof window !== "undefined") {
      const savedDraftRaw = window.localStorage.getItem(`rf_league_captain_draft_${selectedFixture.id}`);
      if (savedDraftRaw && !shouldPreferLiveScorecard) {
        try {
          const savedDraft = JSON.parse(savedDraftRaw) as CaptainResultDraft;
          if (Array.isArray(savedDraft.slots) && savedDraft.slots.length > 0) {
            setSlots(savedDraft.slots);
            const savedNames: Record<string, string> = {};
            for (const slot of savedDraft.slots) {
              if (slot.home_nominated_name) savedNames[`${slot.id}:home`] = slot.home_nominated_name;
              if (slot.away_nominated_name) savedNames[`${slot.id}:away`] = slot.away_nominated_name;
            }
            setNominatedNames(savedNames);
          }
          if (Array.isArray(savedDraft.fixtureBreaks) && savedDraft.fixtureBreaks.length > 0) {
            setFixtureBreaks(savedDraft.fixtureBreaks);
          } else {
            void loadBreaks(selectedFixture.id);
          }
          setScorecardPhotoUrl(savedDraft.scorecardPhotoUrl ?? "");
          setScorecardDirty(true);
          setRemoteScorecardChanged(false);
          setInfo({
            title: "Saved progress restored",
            description: `Draft restored from ${new Date(savedDraft.savedAt).toLocaleString()}.`,
          });
          return;
        } catch {
          window.localStorage.removeItem(`rf_league_captain_draft_${selectedFixture.id}`);
        }
      }
      if (savedDraftRaw && shouldPreferLiveScorecard) {
        try {
          const savedDraft = JSON.parse(savedDraftRaw) as CaptainResultDraft;
          if (Array.isArray(savedDraft.fixtureBreaks) && breakRowsContainUnsavedDraft(savedDraft.fixtureBreaks)) {
            setFixtureBreaks(savedDraft.fixtureBreaks);
            setScorecardDirty(true);
          } else {
            window.localStorage.removeItem(`rf_league_captain_draft_${selectedFixture.id}`);
          }
        } catch {
          window.localStorage.removeItem(`rf_league_captain_draft_${selectedFixture.id}`);
        }
      }
    }
    setScorecardDirty(false);
    setRemoteScorecardChanged(false);
    void loadBreaks(selectedFixture.id);
  }, [allSlots, awayLineupSubmitted, homeLineupSubmitted, homeSideCanManageScorecard, pendingSubmissionMap, selectedFixture]);

  useEffect(() => {
    if (!selectedFixture || scorecardDirty) return;
    baselineScorecardSignatureRef.current = buildScorecardSignature(slots, fixtureBreaks);
    setRemoteScorecardChanged(false);
  }, [selectedFixture, slots, fixtureBreaks, scorecardPhotoUrl, scorecardDirty]);

  useEffect(() => {
    if (!selectedFixture) return;
    if (homeLineupSubmitted && awayLineupSubmitted) {
      setActiveEntryTab("scorecard");
      return;
    }
    setActiveEntryTab("lineup");
  }, [selectedFixture, homeLineupSubmitted, awayLineupSubmitted]);

  useEffect(() => {
    if (!selectedFixture || activeEntryTab !== "scorecard") return;
    const fallbackIndex = firstIncompleteScorecardIndex >= 0 ? firstIncompleteScorecardIndex : 0;
    setScorecardCurrentIndex(fallbackIndex);
    setScorecardReviewMode(false);
  }, [selectedFixture?.id, activeEntryTab]);

  const fetchRemoteScorecardSignature = async () => {
    const client = supabase;
    if (!client || !selectedFixture) return null;
    const [slotRes, breakRes] = await Promise.all([
      client
        .from("league_fixture_frames")
        .select("id,fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated,away_nominated,home_forfeit,away_forfeit,winner_side,home_nominated_name,away_nominated_name,home_points_scored,away_points_scored")
        .eq("fixture_id", selectedFixture.id)
        .order("slot_no", { ascending: true }),
      client
        .from("league_fixture_breaks")
        .select("player_id,entered_player_name,break_value")
        .eq("fixture_id", selectedFixture.id)
        .order("break_value", { ascending: false }),
    ]);
    if (slotRes.error) throw new Error(slotRes.error.message);
    if (breakRes.error && !breakRes.error.message.toLowerCase().includes("does not exist")) throw new Error(breakRes.error.message);
    const remoteSlots = (slotRes.data ?? []) as FrameSlot[];
    const remoteBreaks = ((breakRes.data ?? []) as Array<{ player_id: string | null; entered_player_name: string | null; break_value: number | null }>).map((row) => ({
      player_id: row.player_id ?? null,
      entered_player_name: row.entered_player_name ?? "",
      break_value: String(row.break_value ?? ""),
    }));
    return buildScorecardSignature(remoteSlots, padBreakRows(remoteBreaks));
  };

  const guardAgainstRemoteOverwrite = async () => {
    if (!selectedFixture || !scorecardDirty) return false;
    const remoteSignature = await fetchRemoteScorecardSignature();
    if (!remoteSignature) return false;
    if (remoteSignature !== baselineScorecardSignatureRef.current) {
      setRemoteScorecardChanged(true);
      setMessage("This fixture was updated on another device. Refresh this page to load the latest scorecard before making more changes.");
      return true;
    }
    return false;
  };

  const saveProgress = async (
    mode: "manual" | "auto" = "manual",
    options?: {
      successTitle?: string;
      successDescription?: string;
      suppressSubmitPrompt?: boolean;
      submitPromptMode?: "general" | "final_frame";
    }
  ): Promise<{ saved: boolean; allFramesComplete: boolean; hasUnsavedBreakDraft: boolean }> => {
    if (!selectedFixture || !draftStorageKey || typeof window === "undefined") {
      return { saved: false, allFramesComplete: false, hasUnsavedBreakDraft: false };
    }
    const draft: CaptainResultDraft = {
      slots,
      fixtureBreaks,
      scorecardPhotoUrl,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    if (!homeSideCanManageScorecard || (!lineupsLocked && !preMatchPaperRecord)) {
      if (mode === "manual") {
        setInfo({ title: "Progress saved", description: "Your draft has been saved on this device and can be restored when you return." });
      }
      return { saved: false, allFramesComplete: false, hasUnsavedBreakDraft: false };
    }

    if (mode === "auto" && slots.some((slot) => isFrameStarted(slot) && !isFrameComplete(slot))) {
      return { saved: false, allFramesComplete: false, hasUnsavedBreakDraft: false };
    }

    const hasUnsavedBreakDraft = breakRowsContainUnsavedDraft(fixtureBreaks);

    const client = supabase;
    if (!client) {
      if (mode === "manual") {
        setInfo({ title: "Progress saved", description: "Your draft has been saved on this device and can be restored when you return." });
      }
      return { saved: false, allFramesComplete: false, hasUnsavedBreakDraft };
    }

    if (await guardAgainstRemoteOverwrite()) {
      return { saved: false, allFramesComplete: false, hasUnsavedBreakDraft };
    }

    const frameResults: SubmissionFrameResult[] = slots.map((s) => ({
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
    const allFramesComplete = frameResults.length > 0 && frameResults.every((row) => row.winner_side || row.home_forfeit || row.away_forfeit);
    const breakRows = getValidatedBreakRows();
    if (breakRows.error) {
      setMessage(breakRows.error);
      return { saved: false, allFramesComplete, hasUnsavedBreakDraft };
    }
    if (frameResults.length > 0) frameResults[0].break_entries = breakRows.rows;

    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token ?? null;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return { saved: false, allFramesComplete, hasUnsavedBreakDraft };
    }

    try {
      const resp = await fetch("/api/league/save-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fixtureId: selectedFixture.id,
          frameResults,
          scorecardPhotoUrl: scorecardPhotoUrl.trim() || null,
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload?.error ?? "Failed to save live score progress.");
      autoSaveMutedRef.current = true;
      await loadAll();
      window.setTimeout(() => {
        autoSaveMutedRef.current = false;
      }, 600);
      const persistedBreakRows = hydrateBreakRows(breakRows.rows);
      if (!hasUnsavedBreakDraft) {
        setFixtureBreaks(persistedBreakRows);
        if (draftStorageKey) {
          const refreshedDraft: CaptainResultDraft = {
            slots,
            fixtureBreaks: persistedBreakRows,
            scorecardPhotoUrl,
            savedAt: new Date().toISOString(),
          };
          window.localStorage.setItem(draftStorageKey, JSON.stringify(refreshedDraft));
        }
      }
      baselineScorecardSignatureRef.current = buildScorecardSignature(
        slots,
        hasUnsavedBreakDraft ? fixtureBreaks : persistedBreakRows
      );
      setScorecardDirty(hasUnsavedBreakDraft);
      setRemoteScorecardChanged(false);
      setLastAutoSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (mode === "manual") {
        if (
          !options?.suppressSubmitPrompt &&
          allFramesComplete &&
          !hasUnsavedBreakDraft &&
          !pendingByFixture.has(selectedFixture.id)
        ) {
          setSubmitPromptMode(options?.submitPromptMode ?? "general");
          setConfirmSubmitPromptOpen(true);
        } else {
          setInfo({
            title: options?.successTitle ?? "Progress saved",
            description:
              options?.successDescription ??
              (hasUnsavedBreakDraft
                ? "Scores have been saved and your partial break entry has been kept on this device so you can finish it."
                : allFramesComplete
                  ? "All frames are now complete. Record any 30+ breaks if needed, then press Complete and submit scorecard."
                  : "Your draft has been saved on this device and the live match board has been updated."),
          });
        }
      }
      return { saved: true, allFramesComplete, hasUnsavedBreakDraft };
    } catch (error) {
      if (mode === "manual") {
        setMessage(normaliseCaptainApiError(error, "Failed to save live score progress."));
      }
      return { saved: false, allFramesComplete, hasUnsavedBreakDraft };
    }
  };

  useEffect(() => {
    if (!selectedFixture || activeEntryTab !== "scorecard") return;
    if (!homeSideCanManageScorecard || (!lineupsLocked && !preMatchPaperRecord)) return;
    if (autoSaveMutedRef.current) return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      void saveProgress("auto");
    }, 1200);
    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    activeEntryTab,
    fixtureBreaks,
    homeSideCanManageScorecard,
    lineupsLocked,
    preMatchPaperRecord,
    scorecardPhotoUrl,
    selectedFixture,
    slots,
  ]);

  useEffect(() => {
    autoSaveMutedRef.current = true;
    setLastAutoSavedAt(null);
    autoSaveNoticeShownRef.current = false;
    const timer = window.setTimeout(() => {
      autoSaveMutedRef.current = false;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [selectedFixture?.id, activeEntryTab]);

  useEffect(() => {
    if (!selectedFixture || activeEntryTab !== "scorecard") return;
    if (!homeSideCanManageScorecard || (!lineupsLocked && !preMatchPaperRecord)) return;
    if (autoSaveNoticeShownRef.current) return;
    autoSaveNoticeShownRef.current = true;
    setInfo({
      title: "Auto-save active",
      description: "Live score updates now save automatically for the home team and will feed the public live board as you go.",
    });
  }, [activeEntryTab, homeSideCanManageScorecard, lineupsLocked, preMatchPaperRecord, selectedFixture]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedFixture) return;
    if (activeEntryTab !== "scorecard") return;
    if (!homeSideCanManageScorecard && selectedFixtureSide !== "away") return;
    if (!lineupsLocked && !preMatchPaperRecord) return;

    const refreshIfSafe = async () => {
      try {
        const remoteSignature = await fetchRemoteScorecardSignature();
        if (!remoteSignature) return;
        if (remoteSignature !== baselineScorecardSignatureRef.current) {
          if (scorecardDirty) {
            setRemoteScorecardChanged(true);
            return;
          }
          await loadAll();
        }
      } catch {
        // ignore background refresh errors
      }
    };

    const onFocus = () => {
      void refreshIfSafe();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshIfSafe();
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshIfSafe();
    }, 15000);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeEntryTab, homeSideCanManageScorecard, lineupsLocked, loadAll, preMatchPaperRecord, scorecardDirty, selectedFixture, selectedFixtureSide]);

  const saveLineupDraft = () => {
    void saveProgress();
    setInfo({
      title: "Lineup draft saved",
      description: "Your lineup draft has been saved on this device. Only submit it once the team is final.",
    });
  };

  const saveBreaksOnly = () => {
    void saveProgress("manual", {
      suppressSubmitPrompt: true,
      successTitle: "Breaks saved",
      successDescription:
        "Any complete 30+ break entries have been saved with the live scorecard. If you leave a break row half-finished, it stays on this device until you complete it.",
    });
  };

  const teamMembersByTeam = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      if (!selectedSeason || m.season_id !== selectedSeason.id) continue;
      const prev = map.get(m.team_id) ?? [];
      prev.push(m.player_id);
      map.set(m.team_id, prev);
    }
    return map;
  }, [members, selectedSeason]);

  const homeRosterIds = useMemo(() => {
    if (!selectedFixture) return [] as string[];
    return teamMembersByTeam.get(selectedFixture.home_team_id) ?? [];
  }, [teamMembersByTeam, selectedFixture]);

  const awayRosterIds = useMemo(() => {
    if (!selectedFixture) return [] as string[];
    return teamMembersByTeam.get(selectedFixture.away_team_id) ?? [];
  }, [teamMembersByTeam, selectedFixture]);

  const fixturePlayerOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const id of homeRosterIds) ids.add(id);
    for (const id of awayRosterIds) ids.add(id);
    for (const s of slots) {
      if (s.home_player1_id) ids.add(s.home_player1_id);
      if (s.home_player2_id) ids.add(s.home_player2_id);
      if (s.away_player1_id) ids.add(s.away_player1_id);
      if (s.away_player2_id) ids.add(s.away_player2_id);
    }
    return Array.from(ids)
      .map((id) => ({ id, label: namedWithHandicap(playerById.get(id)) }))
      .sort((a, b) => sortLabelByFirstName(a.label, b.label));
  }, [homeRosterIds, awayRosterIds, slots, playerById]);
  const sortRosterIds = (ids: string[]) =>
    ids
      .slice()
      .sort((a, b) => sortLabelByFirstName(named(playerById.get(a)), named(playerById.get(b))));
  const winterDoublesEligibleIds = (side: "home" | "away") => {
    if (!isWinterFormat) return sortRosterIds(side === "home" ? homeRosterIds : awayRosterIds);
    const frameFour = slots.find((slot) => slot.slot_type === "singles" && slot.slot_no === 4);
    const sideForfeit = side === "home" ? frameFour?.home_forfeit : frameFour?.away_forfeit;
    if (!sideForfeit) return sortRosterIds(side === "home" ? homeRosterIds : awayRosterIds);
    const eligible = new Set<string>();
    for (const slotNo of [1, 2]) {
      const slot = slots.find((row) => row.slot_type === "singles" && row.slot_no === slotNo);
      const playerId = side === "home" ? slot?.home_player1_id : slot?.away_player1_id;
      if (playerId) eligible.add(playerId);
    }
    return sortRosterIds(Array.from(eligible));
  };
  const homeDoublesOptions = useMemo(() => winterDoublesEligibleIds("home"), [slots, isWinterFormat, homeRosterIds, playerById]);
  const awayDoublesOptions = useMemo(() => winterDoublesEligibleIds("away"), [slots, isWinterFormat, awayRosterIds, playerById]);
  const winterNominatedEligibleIds = (side: "home" | "away") => {
    if (!isWinterFormat) return [] as string[];
    const eligible = new Set<string>();
    for (const slotNo of [1, 2]) {
      const slot = slots.find((row) => row.slot_type === "singles" && row.slot_no === slotNo);
      const playerId = side === "home" ? slot?.home_player1_id : slot?.away_player1_id;
      if (playerId) eligible.add(playerId);
    }
    return sortRosterIds(Array.from(eligible));
  };
  const homeNominatedOptions = useMemo(() => winterNominatedEligibleIds("home"), [slots, isWinterFormat, homeRosterIds, playerById]);
  const awayNominatedOptions = useMemo(() => winterNominatedEligibleIds("away"), [slots, isWinterFormat, awayRosterIds, playerById]);

  const playerHandicap = (playerId: string | null | undefined) =>
    Number(playerById.get(playerId ?? "")?.snooker_handicap ?? 0);
  const playerRating = (playerId: string | null | undefined) =>
    ratingOf(playerById.get(playerId ?? ""));

  const singlesHandicapLabel = (slot: FrameSlot) => {
    const home = playerHandicap(slot.home_player1_id);
    const away = playerHandicap(slot.away_player1_id);
    const starts = calculateAdjustedScoresWithCap(0, 0, home, away);
    if (starts.homeStart > 0) return `Singles handicap: Home receives ${starts.homeStart} start`;
    if (starts.awayStart > 0) return `Singles handicap: Away receives ${starts.awayStart} start`;
    return "Singles handicap: Level start";
  };

  const doublesHandicapLabel = (slot: FrameSlot) => {
    const home = (playerHandicap(slot.home_player1_id) + playerHandicap(slot.home_player2_id)) / 2;
    const away = (playerHandicap(slot.away_player1_id) + playerHandicap(slot.away_player2_id)) / 2;
    const starts = calculateAdjustedScoresWithCap(0, 0, home, away);
    if (starts.homeStart > 0) return `Doubles handicap: Home receives ${starts.homeStart} start`;
    if (starts.awayStart > 0) return `Doubles handicap: Away receives ${starts.awayStart} start`;
    return "Doubles handicap: Level start";
  };

  const lineupPreviewRows = useMemo(() => {
    if (!selectedSeason || !selectedFixture || preMatchPaperRecord) return [] as Array<{
      slotId: string;
      title: string;
      matchup: string;
      startLabel: string;
      homeProb: number;
      awayProb: number;
      expectedWinner: "home" | "away";
      guide: string;
    }>;
    return slots.flatMap((slot) => {
      const homeReady =
        slot.slot_type === "doubles"
          ? Boolean(slot.home_player1_id) && Boolean(slot.home_player2_id)
          : slot.home_nominated || Boolean(slot.home_player1_id);
      const awayReady =
        slot.slot_type === "doubles"
          ? Boolean(slot.away_player1_id) && Boolean(slot.away_player2_id)
          : slot.away_nominated || Boolean(slot.away_player1_id);
      if (!homeReady || !awayReady) return [];

      const homeName =
        slot.slot_type === "doubles"
          ? `${named(playerById.get(slot.home_player1_id ?? ""))} / ${named(playerById.get(slot.home_player2_id ?? ""))}`
          : slot.home_nominated
            ? slot.home_nominated_name?.trim() || "Nominated Player"
            : named(playerById.get(slot.home_player1_id ?? ""));
      const awayName =
        slot.slot_type === "doubles"
          ? `${named(playerById.get(slot.away_player1_id ?? ""))} / ${named(playerById.get(slot.away_player2_id ?? ""))}`
          : slot.away_nominated
            ? slot.away_nominated_name?.trim() || "Nominated Player"
            : named(playerById.get(slot.away_player1_id ?? ""));

      const homeHandicap =
        slot.slot_type === "doubles"
          ? (playerHandicap(slot.home_player1_id) + playerHandicap(slot.home_player2_id)) / 2
          : playerHandicap(slot.home_player1_id);
      const awayHandicap =
        slot.slot_type === "doubles"
          ? (playerHandicap(slot.away_player1_id) + playerHandicap(slot.away_player2_id)) / 2
          : playerHandicap(slot.away_player1_id);
      const starts = selectedSeason.handicap_enabled
        ? calculateAdjustedScoresWithCap(0, 0, homeHandicap, awayHandicap)
        : { homeStart: 0, awayStart: 0, homeAdjusted: 0, awayAdjusted: 0 };
      const homeRatingBase =
        slot.slot_type === "doubles"
          ? (playerRating(slot.home_player1_id) + playerRating(slot.home_player2_id)) / 2
          : slot.home_nominated
            ? 1000
            : playerRating(slot.home_player1_id);
      const awayRatingBase =
        slot.slot_type === "doubles"
          ? (playerRating(slot.away_player1_id) + playerRating(slot.away_player2_id)) / 2
          : slot.away_nominated
            ? 1000
            : playerRating(slot.away_player1_id);
      const homeEffectiveRating = homeRatingBase + starts.homeStart * 5;
      const awayEffectiveRating = awayRatingBase + starts.awayStart * 5;
      const homeProb = expectedWinProbability(homeEffectiveRating, awayEffectiveRating);
      const awayProb = 1 - homeProb;
      const expectedWinner = homeProb >= awayProb ? "home" : "away";
      const startLabel = selectedSeason.handicap_enabled
        ? slot.slot_type === "doubles"
          ? doublesHandicapLabel(slot)
          : singlesHandicapLabel(slot)
        : "Level start";

      return [
        {
          slotId: slot.id,
          title: slot.slot_type === "doubles" ? `Frame ${slot.slot_no} · Doubles preview` : `Frame ${slot.slot_no} · Singles preview`,
          matchup: `${homeName} vs ${awayName}`,
          startLabel,
          homeProb: Math.round(homeProb * 100),
          awayProb: Math.round(awayProb * 100),
          expectedWinner,
          guide:
            expectedWinner === "home"
              ? `${homeName} is the guide-only favourite for this frame.`
              : `${awayName} is the guide-only favourite for this frame.`,
        },
      ];
    });
  }, [playerById, preMatchPaperRecord, selectedFixture, selectedSeason, slots]);

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
    if (row.slot_type === "doubles" && selectedSeason?.handicap_enabled) {
      const home = (playerHandicap(row.home_player1_id) + playerHandicap(row.home_player2_id)) / 2;
      const away = (playerHandicap(row.away_player1_id) + playerHandicap(row.away_player2_id)) / 2;
      const adjusted = calculateAdjustedScoresWithCap(homePts, awayPts, home, away);
      if (adjusted.homeAdjusted > adjusted.awayAdjusted) return "home";
      if (adjusted.awayAdjusted > adjusted.homeAdjusted) return "away";
      return null;
    }
    if (homePts > awayPts) return "home";
    if (awayPts > homePts) return "away";
    return null;
  };

  const updateSlotLocal = (slotId: string, patch: Partial<FrameSlot>) => {
    setScorecardDirty(true);
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const merged = { ...s, ...patch } as FrameSlot;
        return { ...merged, winner_side: deriveWinnerFromFrame(merged) };
      })
    );
  };

  const orderedScoreSlots = useMemo(() => [...slots].sort((a, b) => a.slot_no - b.slot_no), [slots]);

  const isFrameLineupReady = useCallback((row: FrameSlot) => {
    if (row.home_forfeit || row.away_forfeit) return true;
    if (row.slot_type === "doubles") {
      return Boolean(row.home_player1_id && row.home_player2_id && row.away_player1_id && row.away_player2_id);
    }
    const homeReady = row.home_nominated ? Boolean(row.home_nominated_name?.trim()) : Boolean(row.home_player1_id);
    const awayReady = row.away_nominated ? Boolean(row.away_nominated_name?.trim()) : Boolean(row.away_player1_id);
    return homeReady && awayReady;
  }, []);

  const isFrameStarted = useCallback(
    (row: FrameSlot) =>
      row.home_forfeit ||
      row.away_forfeit ||
      typeof row.home_points_scored === "number" ||
      typeof row.away_points_scored === "number",
    []
  );

  const isFrameComplete = useCallback(
    (row: FrameSlot) => {
      if (!isFrameLineupReady(row)) return false;
      return deriveWinnerFromFrame(row) !== null;
    },
    [isFrameLineupReady, selectedSeason, players]
  );

  const firstIncompleteScorecardIndex = useMemo(
    () => orderedScoreSlots.findIndex((slot) => !isFrameComplete(slot)),
    [orderedScoreSlots, isFrameComplete]
  );

  const currentScorecardFrame = orderedScoreSlots[Math.min(scorecardCurrentIndex, Math.max(orderedScoreSlots.length - 1, 0))] ?? null;
  const scorecardFramesToDisplay = scorecardReviewMode ? orderedScoreSlots : currentScorecardFrame ? [currentScorecardFrame] : [];

  const validateFrameCompletion = (row: FrameSlot) => {
    if (!isFrameLineupReady(row)) {
      return `Frame ${row.slot_no} is not ready yet. Confirm both players before saving and continuing.`;
    }
    const homePts = typeof row.home_points_scored === "number" ? row.home_points_scored : null;
    const awayPts = typeof row.away_points_scored === "number" ? row.away_points_scored : null;
    if (homePts === null || awayPts === null) {
      return `Frame ${row.slot_no} needs both scores before you continue.`;
    }
    if (!deriveWinnerFromFrame(row)) {
      return `Frame ${row.slot_no} needs a clear result before you continue.`;
    }
    return null;
  };

  const currentFrameBreakSummary = useMemo(() => {
    if (!currentScorecardFrame) {
      return { recorded: [] as string[], hasPartial: false };
    }
    const participantIds = new Set(
      [
        currentScorecardFrame.home_player1_id,
        currentScorecardFrame.home_player2_id,
        currentScorecardFrame.away_player1_id,
        currentScorecardFrame.away_player2_id,
      ].filter((value): value is string => Boolean(value))
    );
    const recorded = fixtureBreaks
      .map((row) => {
        const breakValue = Number(row.break_value || 0);
        if (!Number.isFinite(breakValue) || breakValue < 30) return null;
        const label = row.player_id
          ? named(playerById.get(row.player_id) ?? null)
          : row.entered_player_name.trim();
        if (!label) return null;
        if (row.player_id && !participantIds.has(row.player_id)) return null;
        return `${label} ${breakValue}`;
      })
      .filter((value): value is string => Boolean(value));
    const hasPartial = fixtureBreaks.some((row) => {
      if (!breakRowHasAnyContent(row)) return false;
      if (row.player_id && !participantIds.has(row.player_id)) return false;
      if (!row.player_id) {
        const entered = row.entered_player_name.trim().toLowerCase();
        const currentLabels = Array.from(participantIds).map((id) => named(playerById.get(id) ?? null).trim().toLowerCase());
        if (entered && !currentLabels.includes(entered)) return false;
      }
      const breakValue = Number(row.break_value || 0);
      return !(Number.isFinite(breakValue) && breakValue >= 30 && (row.player_id || row.entered_player_name.trim()));
    });
    return { recorded, hasPartial };
  }, [currentScorecardFrame, fixtureBreaks, playerById]);

  const getSinglesSelectionValue = (slot: FrameSlot, side: "home" | "away") => {
    const playerId = side === "home" ? slot.home_player1_id : slot.away_player1_id;
    const nominated = side === "home" ? slot.home_nominated : slot.away_nominated;
    const forfeit = side === "home" ? slot.home_forfeit : slot.away_forfeit;
    if (forfeit) return "__NO_SHOW__";
    if (nominated) return "__NOMINATED__";
    return playerId ?? "";
  };

  const applySinglesSelection = (slot: FrameSlot, side: "home" | "away", selection: string) => {
    const sidePrefix = side === "home" ? "home" : "away";
    const nameKey = side === "home" ? "home_nominated_name" : "away_nominated_name";
    if (selection === "__NO_SHOW__") {
      setNominatedNames((prev) => ({ ...prev, [`${slot.id}:${side}`]: "" }));
      updateSlotLocal(slot.id, {
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
      updateSlotLocal(slot.id, {
        [`${sidePrefix}_player1_id`]: null,
        [`${sidePrefix}_nominated`]: true,
        [`${sidePrefix}_forfeit`]: false,
      } as Partial<FrameSlot>);
      return;
    }
    setNominatedNames((prev) => ({ ...prev, [`${slot.id}:${side}`]: "" }));
    updateSlotLocal(slot.id, {
      [`${sidePrefix}_player1_id`]: selection || null,
      [`${sidePrefix}_nominated`]: false,
      [`${sidePrefix}_forfeit`]: false,
      [nameKey]: null,
    } as Partial<FrameSlot>);
  };

  const setBreakField = (idx: number, patch: Partial<BreakRow>) => {
    setScorecardDirty(true);
    setFixtureBreaks((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addBreakRow = () => {
    setScorecardDirty(true);
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
    for (const slot of slots) {
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
      if (maxFramePoints === undefined) return { error: "Break entry failed: selected player is not part of this fixture.", rows: [] as SubmissionBreakEntry[] };
      if (row.break_value > maxFramePoints) {
        return { error: `Break entry failed: ${row.break_value} exceeds the player's frame points (${maxFramePoints}).`, rows: [] as SubmissionBreakEntry[] };
      }
    }
    return { error: null, rows: valid as SubmissionBreakEntry[] };
  };

  const isSideSelectionLocked = (side: "home" | "away") => {
    if (!selectedFixture) return true;
    if (pendingByFixture.has(selectedFixture.id)) return true;
    if (preMatchPaperRecord) return false;
    if (side === "home" && homeLineupSubmitted) return true;
    if (side === "away" && awayLineupSubmitted) return true;
    if (!lineupWindowOpen) return true;
    if (proxyEntryEnabled) {
      if (side === "away" && !homeLineupSubmitted) return true;
      return false;
    }
    if (side === "home") return selectedFixtureSide !== "home";
    if (!homeLineupSubmitted) return true;
    return selectedFixtureSide !== "away";
  };

  const validateLineupForSide = (side: "home" | "away") => {
    for (const slot of slots) {
      if (slot.slot_type === "doubles") {
        const p1 = side === "home" ? slot.home_player1_id : slot.away_player1_id;
        const p2 = side === "home" ? slot.home_player2_id : slot.away_player2_id;
        if (!p1 || !p2) {
          return `Frame ${slot.slot_no}: complete both ${side} doubles players before submitting the lineup.`;
        }
        continue;
      }
      const playerId = side === "home" ? slot.home_player1_id : slot.away_player1_id;
      const nominated = side === "home" ? slot.home_nominated : slot.away_nominated;
      const nominatedName = side === "home" ? slot.home_nominated_name : slot.away_nominated_name;
      const forfeit = side === "home" ? slot.home_forfeit : slot.away_forfeit;
      if (!playerId && !nominated && !forfeit) {
        return `Frame ${slot.slot_no}: choose the ${side} player, nominated player, or no-show before submitting the lineup.`;
      }
      if (nominated && !nominatedName?.trim()) {
        return `Frame ${slot.slot_no}: enter the ${side} nominated player name before submitting the lineup.`;
      }
    }
    return null;
  };

  const submitLineupForSide = async (side: "home" | "away") => {
    const client = supabase;
    if (!client || !selectedFixture || !currentUserId) return;
    const validationError = validateLineupForSide(side);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setSubmitting(true);
    const sideFields = slots.map((slot) => ({
      id: slot.id,
      ...(side === "home"
        ? {
            home_player1_id: slot.home_player1_id,
            home_player2_id: slot.home_player2_id,
            home_nominated: slot.home_nominated,
            home_forfeit: slot.home_forfeit,
            home_nominated_name: slot.home_nominated_name ?? null,
          }
        : {
            away_player1_id: slot.away_player1_id,
            away_player2_id: slot.away_player2_id,
            away_nominated: slot.away_nominated,
            away_forfeit: slot.away_forfeit,
            away_nominated_name: slot.away_nominated_name ?? null,
          }),
    }));
    try {
      const sessionRes = await client.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("You must be signed in to submit a lineup.");
      const resp = await fetch("/api/league/submit-lineup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fixtureId: selectedFixture.id,
          side,
          sideFields,
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload?.error ?? "Failed to submit lineup.");
      await loadAll();
      setInfo({
        title: proxyEntryEnabled
          ? side === "home"
            ? "Home lineup entered by agreement"
            : "Both lineups confirmed by agreement"
          : side === "home"
            ? "Home lineup submitted"
            : "Away lineup submitted",
        description:
          proxyEntryEnabled
            ? side === "home"
              ? "Home lineup saved under agreed proxy entry. You can now complete the away lineup for tonight's fixture."
              : "Away lineup saved under agreed proxy entry. Lineups are now locked and the fixture is ready for score entry."
            : side === "home"
              ? "Home lineup saved. The away captain can now complete and confirm the lineup for tonight's fixture."
              : "Away lineup saved. Lineups are now locked and the fixture is ready for score entry.",
      });
    } catch (error) {
      setMessage(normaliseCaptainApiError(error, "Failed to submit lineup."));
    } finally {
      setSubmitting(false);
    }
  };

  const enableProxyEntry = async () => {
    const client = supabase;
    if (!client || !selectedFixture || !selectedFixtureSide) return;
    setSubmitting(true);
    try {
      const sessionRes = await client.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("You must be signed in to enable agreed proxy entry.");
      const resp = await fetch("/api/league/proxy-entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fixtureId: selectedFixture.id }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload?.error ?? "Failed to enable agreed proxy entry.");
      await loadAll();
      setInfo({
        title: "Agreed proxy entry enabled",
        description: "This fixture is now marked for agreed proxy entry. You can complete both team lineups and submit tonight's scorecard on behalf of both sides.",
      });
    } catch (error) {
      setMessage(normaliseCaptainApiError(error, "Failed to enable agreed proxy entry."));
    } finally {
      setSubmitting(false);
    }
  };

  const markPaperLineup = async () => {
    const client = supabase;
    if (!client || !selectedFixture || !currentUserId) return;
    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const res = await client
      .from("league_fixtures")
      .update({
        pre_match_paper_record: true,
        pre_match_paper_at: nowIso,
        pre_match_paper_by_user_id: currentUserId,
      })
      .eq("id", selectedFixture.id);
    if (res.error) {
      setSubmitting(false);
      setMessage(res.error.message);
      return;
    }
    await loadAll();
    setSubmitting(false);
    setInfo({
      title: "Paper lineup selected",
      description: "This fixture has been marked for a paper pre-match card. Results can still be entered later in the usual way.",
    });
  };

  const reopenSubmittedHomeLineup = async () => {
    const client = supabase;
    if (!client || !selectedFixture || !canEditSubmittedHomeLineup) return;
    setSubmitting(true);
    const res = await client
      .from("league_fixtures")
      .update({
        home_lineup_submitted_at: null,
        home_lineup_submitted_by_user_id: null,
      })
      .eq("id", selectedFixture.id);
    if (res.error) {
      setSubmitting(false);
      setMessage(res.error.message);
      return;
    }
    setSubmitting(false);
    setInfo({
      title: "Home lineup reopened",
      description: "You can now adjust the home lineup again. Re-submit it once you are sure the team is final.",
    });
    await loadAll();
  };

  const submit = async () => {
    const client = supabase;
    if (!client || !selectedFixture || !currentUserId) return;
    if (selectedFixture.status === "complete") {
      setMessage("This fixture is locked because it is complete.");
      return;
    }
    if (!canSubmit) {
      setMessage("Super User does not submit from this page.");
      return;
    }
    if (!captainTeamIds.has(selectedFixture.home_team_id) && !captainTeamIds.has(selectedFixture.away_team_id)) {
      setMessage("You can only submit results for your own team fixtures.");
      return;
    }
    if (!isFixtureOpenForSubmission(selectedFixture.fixture_date)) return setMessage("Fixture is not open. Captains can submit from match night until midnight on the following day.");
    if (pendingByFixture.has(selectedFixture.id)) return setMessage("A submission is already pending for this fixture.");
    if (await guardAgainstRemoteOverwrite()) return;

    const frameResults: SubmissionFrameResult[] = slots.map((s) => ({
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

    setSubmitting(true);
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token ?? null;
    if (!token) {
      setSubmitting(false);
      setMessage("Session expired. Please sign in again.");
      return;
    }

    let res: Response;
    try {
      res = await fetch("/api/league/captain-submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fixtureId: selectedFixture.id,
          frameResults,
          scorecardPhotoUrl: scorecardPhotoUrl.trim() || null,
        }),
      });
    } catch {
      setSubmitting(false);
      setMessage("Network error while submitting. Check server is running and try again.");
      return;
    }

    setSubmitting(false);
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(normaliseCaptainApiError(new Error(payload.error ?? "Failed to submit result."), "Failed to submit result."));
      return;
    }

    if (proxyEntryEnabled) {
      setInfo({ title: "Proxy Result Submitted", description: "Your agreed proxy entry has been submitted for Super User approval with both teams entered from the app." });
    } else {
      setInfo({ title: "Result Submitted", description: "Your result has been submitted for Super User approval." });
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(`rf_league_captain_draft_${selectedFixture.id}`);
    }
    setScorecardPhotoUrl("");
    await loadAll();
  };

  const saveAndContinueCurrentFrame = async () => {
    if (!currentScorecardFrame) return;
    const validationError = validateFrameCompletion(currentScorecardFrame);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setFrameAdvancePrompt({
      slotNo: currentScorecardFrame.slot_no,
      isFinalFrame: scorecardCurrentIndex >= orderedScoreSlots.length - 1,
    });
  };

  const confirmSaveAndContinueCurrentFrame = async () => {
    if (!currentScorecardFrame) return;
    const validationError = validateFrameCompletion(currentScorecardFrame);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    const isFinalFrame = scorecardCurrentIndex >= orderedScoreSlots.length - 1;
    const saveResult = await saveProgress("manual", {
      submitPromptMode: isFinalFrame ? "final_frame" : "general",
    });
    if (!saveResult.saved) return;
    if (isFinalFrame) {
      if (saveResult.allFramesComplete && saveResult.hasUnsavedBreakDraft) {
        setScorecardReviewMode(true);
      }
      return;
    }
    setScorecardCurrentIndex((prev) => Math.min(prev + 1, Math.max(orderedScoreSlots.length - 1, 0)));
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Captain Lineups & Results" eyebrow="League" subtitle="Enter pre-match lineups first, then submit your team result for Super User approval." />
          {loading ? <section className={`${sectionCardClass} text-slate-600`}>Loading...</section> : null}

          {!linkedPlayerId && !loading ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
              Your account must be linked to a player profile to submit results.
            </section>
          ) : null}

          {linkedPlayerId && captainTeamIds.size === 0 && !loading ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
              You are not currently assigned as captain or vice-captain.
            </section>
          ) : null}

          {linkedPlayerId && captainTeamIds.size > 0 ? (
            <section className={`${sectionCardClass} ${sectionCardTintClass} space-y-4`}>
              <div>
                <h2 className={sectionTitleClass}>Fixture Entry</h2>
                <p className="mt-1 text-sm text-slate-600">Choose a fixture, send the home lineup first, let the away team confirm it, then move on to frame scores and the final scorecard submission.</p>
              </div>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={selectedFixtureId}
                onChange={(e) => setSelectedFixtureId(e.target.value)}
              >
                <option value="">Select your fixture</option>
                {myCurrentWeekFixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fixture_date ? new Date(`${f.fixture_date}T12:00:00`).toLocaleDateString() : `Week ${f.week_no ?? "-"}`} · {teamById.get(f.home_team_id)?.name ?? "Home"} vs {teamById.get(f.away_team_id)?.name ?? "Away"}
                    {pendingByFixture.has(f.id) ? " · pending review" : ""}
                  </option>
                ))}
              </select>

              {myCurrentWeekFixtures.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No fixtures are currently available for pre-match lineup or result submission.
                </p>
              ) : null}
              {selectedFixture ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setActiveEntryTab("lineup")}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        activeEntryTab === "lineup"
                          ? "border-sky-700 bg-sky-700 text-white shadow-sm"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">Step 1</span>
                        <span className="mt-1 block text-sm font-semibold">Team lineup</span>
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        activeEntryTab === "lineup" ? "bg-white/15 text-white" : "bg-sky-100 text-sky-800"
                      }`}>
                        {homeLineupSubmitted && awayLineupSubmitted ? "Done" : "Live"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (lineupsLocked || preMatchPaperRecord) setActiveEntryTab("scorecard");
                      }}
                      disabled={!lineupsLocked && !preMatchPaperRecord}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        activeEntryTab === "scorecard"
                          ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <span>
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">Step 2</span>
                        <span className="mt-1 block text-sm font-semibold">Scorecard</span>
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        activeEntryTab === "scorecard" ? "bg-white/15 text-white" : lineupsLocked || preMatchPaperRecord ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                      }`}>
                        {lineupsLocked || preMatchPaperRecord ? "Ready" : "Locked"}
                      </span>
                    </button>
                  </div>
                  {proxyEntryEnabled ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                      <strong>Agreed proxy entry:</strong> one captain or vice-captain is handling both teams in the app for tonight's fixture by agreement.
                    </div>
                  ) : selectedFixtureSide === "home" ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <strong>Home team action:</strong> your team is the default result submitter for this fixture. Please complete the card in the app and submit it by midnight on the following day.
                    </div>
                  ) : selectedFixtureSide === "away" ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <strong>Away team fallback:</strong> the home team is expected to submit this result. Only submit it yourself if the home team cannot do so or the Super User has asked you to step in.
                    </div>
                  ) : null}
                  <div className="grid gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected Fixture</p>
                      <p className="mt-2 text-lg font-black text-slate-950">
                        {teamById.get(selectedFixture.home_team_id)?.name ?? "Home"} vs {teamById.get(selectedFixture.away_team_id)?.name ?? "Away"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {selectedFixture.fixture_date
                          ? new Date(`${selectedFixture.fixture_date}T12:00:00`).toLocaleDateString()
                          : `Week ${selectedFixture.week_no ?? "-"}`}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Submission Window</p>
                      <p className="mt-2 text-lg font-black text-slate-950">
                        {isFixtureOpenForSubmission(selectedFixture.fixture_date) ? "Open now" : "Closed"}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">Match night until midnight on the following day.</p>
                    </div>
                    <div
                      className={`rounded-xl border p-3 shadow-sm ${
                        pendingByFixture.has(selectedFixture.id)
                          ? "border-amber-200 bg-amber-50"
                          : "border-indigo-200 bg-indigo-50"
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                          pendingByFixture.has(selectedFixture.id) ? "text-amber-700" : "text-indigo-700"
                        }`}
                      >
                        Current Status
                      </p>
                      <p className="mt-2 text-lg font-black text-slate-950">
                        {pendingByFixture.has(selectedFixture.id) ? "Submitted" : "Draft in progress"}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {pendingByFixture.has(selectedFixture.id)
                          ? "Read-only until Super User review is completed."
                          : "Save progress after each frame and only submit once all frame scores are complete."}
                      </p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Pre-Match Lineup</p>
                      <p className="mt-2 text-lg font-black text-slate-950">
                        {preMatchPaperRecord
                          ? "Paper card"
                          : homeLineupSubmitted && awayLineupSubmitted
                            ? "Locked"
                            : homeLineupSubmitted
                              ? "Awaiting away team"
                              : "Awaiting home team"}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">Home should submit by 19:15. Away should respond by 19:30 once the home team has sent its lineup.</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <p>
                          Pre-match lineup target: <strong>home by 19:15, away by 19:30</strong>
                        </p>
                        <p>
                          Lineup order: <strong>home team first, away team second</strong>
                        </p>
                        <p>
                          Result submission responsibility: <strong>{proxyEntryEnabled ? "Agreed proxy entry in use" : "Home team by default"}</strong>
                        </p>
                        <p>
                          Result deadline: <strong>midnight on the following day</strong>
                        </p>
                        {selectedSeason?.handicap_enabled ? (
                          <p>
                            Handicap starts: <strong>reviewed in full, but capped at {MAX_SNOOKER_START} points for the live match start</strong>
                          </p>
                        ) : null}
                        <p>
                          Home lineup: <strong>{homeLineupSubmitted ? "Submitted" : "Pending"}</strong>
                        </p>
                        <p>
                          Away lineup: <strong>{awayLineupSubmitted ? "Submitted" : "Pending"}</strong>
                        </p>
                        <p className="text-xs text-slate-600">
                          Use WhatsApp only as an exception or backup. The app should be the normal route so fixtures, standings, and records update automatically after approval.
                        </p>
                        {preMatchPaperRecord ? (
                          <p className="text-sky-800"><strong>Paper record selected.</strong> Pre-match lineup is being handled off-app for this fixture.</p>
                        ) : null}
                        {proxyEntryEnabled ? (
                          <p className="text-violet-800"><strong>Proxy entry active.</strong> One captain or vice-captain can enter both teams and submit the final result for this fixture by agreement.</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedFixtureSide === "home" && lineupWindowOpen && !awayLineupSubmitted ? (
                          <button
                            type="button"
                            onClick={saveLineupDraft}
                            disabled={submitting}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                          >
                            Save lineup draft
                          </button>
                        ) : null}
                        {canEnableProxyEntry ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Enable agreed proxy entry for tonight? Use this only when both teams agree that one captain or vice-captain will enter both lineups and the final result in the app."
                                )
                              ) {
                                void enableProxyEntry();
                              }
                            }}
                            disabled={submitting}
                            className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900"
                          >
                            Use agreed proxy entry
                          </button>
                        ) : null}
                        {canSubmitHomeLineup ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void submitLineupForSide("home")}
                              disabled={submitting}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                            >
                              {submitting ? "Saving..." : proxyEntryEnabled ? "Submit home lineup by agreement" : "Submit team to opponent"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm("Mark this fixture to use a paper pre-match card instead?")) void markPaperLineup();
                              }}
                              disabled={submitting}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                            >
                              Use paper record instead
                            </button>
                          </>
                        ) : null}
                        {canEditSubmittedHomeLineup ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Reopen the submitted home lineup for editing? You can only do this before 19:15 and before the away team confirms its lineup."
                                )
                              ) {
                                void reopenSubmittedHomeLineup();
                              }
                            }}
                            disabled={submitting}
                            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900"
                          >
                            Edit submitted home lineup
                          </button>
                        ) : null}
                        {canSubmitAwayLineup ? (
                          <button
                            type="button"
                            onClick={() => void submitLineupForSide("away")}
                            disabled={submitting}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                          >
                            {submitting ? "Saving..." : proxyEntryEnabled ? "Confirm both lineups by agreement" : "Submit and confirm lineup"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {activeEntryTab === "lineup" ? (
                    <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">Lineup entry</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {proxyEntryEnabled
                              ? `Enter the players for frames 1-${slots.length}. Agreed proxy entry is active, so one captain or vice-captain can complete both teams for tonight's fixture.`
                              : `Enter the players for frames 1-${slots.length}. Home team sends its lineup first. The away team then confirms against the home lineup already shown here.`}
                          </p>
                        </div>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                          {proxyEntryEnabled ? "Agreed proxy view" : selectedFixtureSide === "home" ? "Home team view" : selectedFixtureSide === "away" ? "Away team view" : "Fixture view"}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Step 1</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">Home team sends lineup</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              homeLineupSubmitted ? "bg-emerald-700 text-white" : canSubmitHomeLineup ? "bg-white text-emerald-900" : "bg-slate-200 text-slate-700"
                            }`}>
                              {homeLineupStepLabel}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{proxyEntryEnabled ? "Enter the home lineup first so the fixture order stays consistent before you confirm both teams." : "Slots 1-6 should be submitted to the opponent by 19:15."}</p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Step 2</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">Away team confirms lineup</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              awayLineupSubmitted ? "bg-amber-600 text-white" : canSubmitAwayLineup ? "bg-white text-amber-900" : "bg-slate-200 text-slate-700"
                            }`}>
                              {awayLineupStepLabel}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{proxyEntryEnabled ? "Once the home lineup is in, confirm the away lineup by agreement so the scorecard can unlock." : "Once the home team has sent its players, the away team should confirm by 19:30."}</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <strong>What happens next:</strong> {lineupNextAction}
                      </div>
                      {proxyEntryEnabled ? (
                        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
                          Use proxy entry only where both teams agree the logged-in captain or vice-captain will handle both lineups and the final result in the app tonight.
                        </div>
                      ) : selectedFixtureSide === "home" ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          Home captains can save a draft locally first. Only use <strong>Submit team to opponent</strong> once you know the lineup is final. After 19:15, or once the away team confirms, the home players can no longer be changed.
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {slots.map((slot) => {
                          const homeSinglesCount = new Map<string, number>();
                          const awaySinglesCount = new Map<string, number>();
                          const homeSelectionLocked = isSideSelectionLocked("home");
                          const awaySelectionLocked = isSideSelectionLocked("away");
                          for (const s of slots) {
                            if (s.slot_type !== "singles" || s.id === slot.id) continue;
                            if (s.home_player1_id) homeSinglesCount.set(s.home_player1_id, (homeSinglesCount.get(s.home_player1_id) ?? 0) + 1);
                            if (s.away_player1_id) awaySinglesCount.set(s.away_player1_id, (awaySinglesCount.get(s.away_player1_id) ?? 0) + 1);
                          }
                          const homeSelection = getSinglesSelectionValue(slot, "home");
                          const awaySelection = getSinglesSelectionValue(slot, "away");
                          return (
                            <div key={`lineup-${slot.id}`} className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                              <p className="text-sm font-semibold text-slate-900">
                                {slot.slot_type === "doubles" ? `Frame ${slot.slot_no} · Doubles` : `Frame ${slot.slot_no} · Singles`}
                              </p>
                              <div className="mt-2 grid gap-2">
                                <div>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{teamById.get(selectedFixture.home_team_id)?.name ?? "Home"}</p>
                                  {slot.slot_type === "doubles" ? (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={slot.home_player1_id ?? ""} onChange={(e) => updateSlotLocal(slot.id, { home_player1_id: e.target.value || null, home_forfeit: false })} disabled={homeSelectionLocked}>
                                        <option value="">Home player 1</option>
                                        {homeDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.home_player2_id === id}>{namedWithHandicap(playerById.get(id))}</option>)}
                                      </select>
                                      <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={slot.home_player2_id ?? ""} onChange={(e) => updateSlotLocal(slot.id, { home_player2_id: e.target.value || null })} disabled={homeSelectionLocked}>
                                        <option value="">Home player 2</option>
                                        {homeDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.home_player1_id === id}>{namedWithHandicap(playerById.get(id))}</option>)}
                                      </select>
                                    </div>
                                  ) : (
                                    <select className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={homeSelection} onChange={(e) => applySinglesSelection(slot, "home", e.target.value)} disabled={homeSelectionLocked}>
                                      <option value="">Home player</option>
                                      {isWinterFormat && slot.slot_no === 4 ? <option value="__NO_SHOW__">No Show</option> : null}
                                      {isWinterFormat && slot.slot_no === 3 ? <option value="__NOMINATED__">Nominated Player</option> : null}
                                      {!isWinterFormat && slot.slot_type === "singles" && slot.slot_no >= 5 ? <option value="__NO_SHOW__">No Show</option> : null}
                                      {sortRosterIds(homeRosterIds).map((id) => (
                                        <option key={id} value={id} disabled={(homeSinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.home_player1_id !== id}>
                                          {namedWithHandicap(playerById.get(id))}
                                          {(homeSinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.home_player1_id !== id ? " (Already used in singles)" : ""}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{teamById.get(selectedFixture.away_team_id)?.name ?? "Away"}</p>
                                  {slot.slot_type === "doubles" ? (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={slot.away_player1_id ?? ""} onChange={(e) => updateSlotLocal(slot.id, { away_player1_id: e.target.value || null, away_forfeit: false })} disabled={awaySelectionLocked}>
                                        <option value="">Away player 1</option>
                                        {awayDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.away_player2_id === id}>{namedWithHandicap(playerById.get(id))}</option>)}
                                      </select>
                                      <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={slot.away_player2_id ?? ""} onChange={(e) => updateSlotLocal(slot.id, { away_player2_id: e.target.value || null })} disabled={awaySelectionLocked}>
                                        <option value="">Away player 2</option>
                                        {awayDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.away_player1_id === id}>{namedWithHandicap(playerById.get(id))}</option>)}
                                      </select>
                                    </div>
                                  ) : (
                                    <select className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={awaySelection} onChange={(e) => applySinglesSelection(slot, "away", e.target.value)} disabled={awaySelectionLocked}>
                                      <option value="">Away player</option>
                                      {isWinterFormat && slot.slot_no === 4 ? <option value="__NO_SHOW__">No Show</option> : null}
                                      {isWinterFormat && slot.slot_no === 3 ? <option value="__NOMINATED__">Nominated Player</option> : null}
                                      {!isWinterFormat && slot.slot_type === "singles" && slot.slot_no >= 5 ? <option value="__NO_SHOW__">No Show</option> : null}
                                      {sortRosterIds(awayRosterIds).map((id) => (
                                        <option key={id} value={id} disabled={(awaySinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.away_player1_id !== id}>
                                          {namedWithHandicap(playerById.get(id))}
                                          {(awaySinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.away_player1_id !== id ? " (Already used in singles)" : ""}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                  {activeEntryTab === "scorecard" && remoteScorecardChanged ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      This scorecard changed on another device. Refresh this page before continuing so you do not overwrite newer results.
                    </div>
                  ) : null}
                  {activeEntryTab === "scorecard" && pendingByFixture.has(selectedFixture.id) ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This fixture has been submitted and is pending Super User review. Your submitted details are shown below in read-only mode.
                    </div>
                  ) : null}
                  {activeEntryTab === "scorecard" ? (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        {isWinterFormat ? (
                          <p>
                            Winter format: 4 singles + 1 doubles. Singles 3 supports <span className="font-medium">Nominated Player</span>. Singles 4 supports <span className="font-medium">No Show</span>.
                          </p>
                        ) : (
                          <p>
                            Summer format: 6 singles. Each player can play a maximum of <span className="font-medium">2 singles frames</span>. Frames 5 and 6 support <span className="font-medium">No Show</span>.
                          </p>
                        )}
                        {selectedSeason?.handicap_enabled ? (
                          <div className="mt-1 space-y-1">
                            <p>In doubles, team handicap = (player 1 handicap + player 2 handicap) ÷ 2, with the live start capped at {MAX_SNOOKER_START}.</p>
                            <p>Reviewed handicaps still show the full assessed gap, but the frame start is capped to keep matches competitive.</p>
                            <p>The {MAX_SNOOKER_START}-point cap is a balance: it gives weaker players a meaningful chance without making the opening score decide too much too early. A lower cap such as 30 can leave bigger strength gaps under-compensated.</p>
                          </div>
                        ) : null}
                      </div>
                      {lineupPreviewRows.length > 0 ? (
                        <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-violet-900">Frame-by-frame lineup preview</p>
                              <p className="mt-1 text-xs text-violet-900">
                                Based on the current lineups, capped handicap starts, and current player Elo. This is a guide only, not a guarantee.
                              </p>
                            </div>
                            <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-800">
                              Max start {MAX_SNOOKER_START}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            {lineupPreviewRows.map((row) => (
                              <div key={row.slotId} className="rounded-xl border border-violet-200 bg-white p-3 shadow-sm">
                                <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                                <p className="mt-1 text-sm text-slate-700">{row.matchup}</p>
                                <p className="mt-1 text-xs text-slate-600">{row.startLabel}</p>
                                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                                    Home win chance: <strong>{row.homeProb}%</strong>
                                  </div>
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                                    Away win chance: <strong>{row.awayProb}%</strong>
                                  </div>
                                </div>
                                <p className="mt-3 text-xs font-medium text-violet-900">{row.guide}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {orderedScoreSlots.length > 0 ? (
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-cyan-900">Match-day frame journey</p>
                              <p className="mt-1 text-xs text-cyan-900">
                                Work through one frame at a time, save it, then continue. You can review and amend everything at the end before the final submission.
                              </p>
                            </div>
                            {!scorecardReviewMode && currentScorecardFrame ? (
                              <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-800">
                                Frame {currentScorecardFrame.slot_no} of {orderedScoreSlots.length}
                              </span>
                            ) : (
                              <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-800">
                                Final review
                              </span>
                            )}
                          </div>
                          <div className="mt-3 grid gap-2 lg:grid-cols-3">
                            {orderedScoreSlots.map((slot, index) => (
                              <div
                                key={`journey-${slot.id}`}
                                className={`rounded-xl border px-3 py-2 text-sm ${
                                  scorecardReviewMode
                                    ? "border-white bg-white"
                                    : index === scorecardCurrentIndex
                                      ? "border-cyan-300 bg-white shadow-sm"
                                      : isFrameComplete(slot)
                                        ? "border-emerald-200 bg-emerald-50"
                                        : "border-slate-200 bg-white/80"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-slate-900">Frame {slot.slot_no}</p>
                                  <span className="text-xs font-semibold text-slate-600">
                                    {isFrameComplete(slot)
                                      ? "Saved"
                                      : index === scorecardCurrentIndex && !scorecardReviewMode
                                        ? "Current"
                                        : isFrameStarted(slot)
                                          ? "In progress"
                                          : "Waiting"}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-600">
                                  {(slot.home_nominated_name?.trim() || named(playerById.get(slot.home_player1_id ?? "")) || "Home")} vs{" "}
                                  {(slot.away_nominated_name?.trim() || named(playerById.get(slot.away_player1_id ?? "")) || "Away")}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {lineupsLocked || preMatchPaperRecord ? (
                        <fieldset
                          disabled={!homeSideCanManageScorecard}
                          className={!homeSideCanManageScorecard ? "cursor-not-allowed opacity-80" : ""}
                        >
                  {scorecardFramesToDisplay.map((slot) => {
                    const homeSinglesCount = new Map<string, number>();
                    const awaySinglesCount = new Map<string, number>();
                    const homeSelectionLocked = isSideSelectionLocked("home");
                    const awaySelectionLocked = isSideSelectionLocked("away");
                    for (const s of slots) {
                      if (s.slot_type !== "singles" || s.id === slot.id) continue;
                      if (s.home_player1_id) homeSinglesCount.set(s.home_player1_id, (homeSinglesCount.get(s.home_player1_id) ?? 0) + 1);
                      if (s.away_player1_id) awaySinglesCount.set(s.away_player1_id, (awaySinglesCount.get(s.away_player1_id) ?? 0) + 1);
                    }
                    const homeSelection = getSinglesSelectionValue(slot, "home");
                    const awaySelection = getSinglesSelectionValue(slot, "away");
                    return (
                      <div
                        key={slot.id}
                        className={`rounded-xl border p-3 ${
                          slot.slot_type === "doubles"
                            ? "border-indigo-200 bg-indigo-50/70"
                            : "border-teal-200 bg-teal-50/70"
                        }`}
                      >
                          <p className="text-sm font-semibold text-slate-900">
                          {slot.slot_type === "doubles" ? `Frame ${slot.slot_no} · Doubles` : `Frame ${slot.slot_no} · Singles`}
                          </p>
                          {selectedSeason?.handicap_enabled ? (
                            <p className="mt-1 text-xs text-slate-600">
                              {slot.slot_type === "doubles"
                                ? `${doublesHandicapLabel(slot)} (combined player handicaps ÷ 2)`
                                : singlesHandicapLabel(slot)}
                            </p>
                          ) : null}
                        <div className="mt-2 grid gap-2 sm:grid-cols-5">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Home</div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-3">Player(s)</div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Points</div>

                          <div className="text-xs text-slate-600">{teamById.get(selectedFixture.home_team_id)?.name ?? "Home"}</div>
                          <div className="sm:col-span-3">
                            {slot.slot_type === "doubles" ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                  value={slot.home_player1_id ?? ""}
                                  onChange={(e) => updateSlotLocal(slot.id, { home_player1_id: e.target.value || null, home_forfeit: false })}
                                  disabled={homeSelectionLocked}
                                >
                                  <option value="">Home player 1</option>
                                  {homeDoublesOptions.map((id) => (
                                    <option key={id} value={id} disabled={slot.home_player2_id === id}>{namedWithHandicap(playerById.get(id))}</option>
                                  ))}
                                </select>
                                <select
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                  value={slot.home_player2_id ?? ""}
                                  onChange={(e) => updateSlotLocal(slot.id, { home_player2_id: e.target.value || null })}
                                  disabled={homeSelectionLocked}
                                >
                                  <option value="">Home player 2</option>
                                  {homeDoublesOptions.map((id) => (
                                    <option key={id} value={id} disabled={slot.home_player1_id === id}>{namedWithHandicap(playerById.get(id))}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <select
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                value={homeSelection}
                                onChange={(e) => applySinglesSelection(slot, "home", e.target.value)}
                                disabled={homeSelectionLocked}
                              >
                                <option value="">Home player</option>
                                {isWinterFormat && slot.slot_no === 4 ? <option value="__NO_SHOW__">No Show</option> : null}
                                {isWinterFormat && slot.slot_no === 3 ? <option value="__NOMINATED__">Nominated Player</option> : null}
                                {!isWinterFormat && slot.slot_type === "singles" && slot.slot_no >= 5 ? <option value="__NO_SHOW__">No Show</option> : null}
                                {sortRosterIds(homeRosterIds).map((id) => (
                                  <option key={id} value={id} disabled={(homeSinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.home_player1_id !== id}>
                                    {namedWithHandicap(playerById.get(id))}
                                    {(homeSinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.home_player1_id !== id ? " (Already used in singles)" : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min={0}
                            max={200}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                            value={slot.home_points_scored ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value === "" ? null : Number.parseInt(e.target.value, 10);
                              const parsed = raw === null || Number.isNaN(raw) ? null : Math.min(200, Math.max(0, raw));
                              updateSlotLocal(slot.id, { home_points_scored: slot.home_forfeit || slot.away_forfeit ? 0 : parsed });
                            }}
                            placeholder="0-200"
                          />

                          <div className="text-xs text-slate-600">{teamById.get(selectedFixture.away_team_id)?.name ?? "Away"}</div>
                          <div className="sm:col-span-3">
                            {slot.slot_type === "doubles" ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                  value={slot.away_player1_id ?? ""}
                                  onChange={(e) => updateSlotLocal(slot.id, { away_player1_id: e.target.value || null, away_forfeit: false })}
                                  disabled={awaySelectionLocked}
                                >
                                  <option value="">Away player 1</option>
                                  {awayDoublesOptions.map((id) => (
                                    <option key={id} value={id} disabled={slot.away_player2_id === id}>{namedWithHandicap(playerById.get(id))}</option>
                                  ))}
                                </select>
                                <select
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                  value={slot.away_player2_id ?? ""}
                                  onChange={(e) => updateSlotLocal(slot.id, { away_player2_id: e.target.value || null })}
                                  disabled={awaySelectionLocked}
                                >
                                  <option value="">Away player 2</option>
                                  {awayDoublesOptions.map((id) => (
                                    <option key={id} value={id} disabled={slot.away_player1_id === id}>{namedWithHandicap(playerById.get(id))}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <select
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                value={awaySelection}
                                onChange={(e) => applySinglesSelection(slot, "away", e.target.value)}
                                disabled={awaySelectionLocked}
                              >
                                <option value="">Away player</option>
                                {isWinterFormat && slot.slot_no === 4 ? <option value="__NO_SHOW__">No Show</option> : null}
                                {isWinterFormat && slot.slot_no === 3 ? <option value="__NOMINATED__">Nominated Player</option> : null}
                                {!isWinterFormat && slot.slot_type === "singles" && slot.slot_no >= 5 ? <option value="__NO_SHOW__">No Show</option> : null}
                                {sortRosterIds(awayRosterIds).map((id) => (
                                  <option key={id} value={id} disabled={(awaySinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.away_player1_id !== id}>
                                    {namedWithHandicap(playerById.get(id))}
                                    {(awaySinglesCount.get(id) ?? 0) >= singlesMaxPerPlayer && slot.away_player1_id !== id ? " (Already used in singles)" : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min={0}
                            max={200}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                            value={slot.away_points_scored ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value === "" ? null : Number.parseInt(e.target.value, 10);
                              const parsed = raw === null || Number.isNaN(raw) ? null : Math.min(200, Math.max(0, raw));
                              updateSlotLocal(slot.id, { away_points_scored: slot.home_forfeit || slot.away_forfeit ? 0 : parsed });
                            }}
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
                                  updateSlotLocal(slot.id, { home_nominated_name: e.target.value || null });
                                }}
                                disabled={homeSelectionLocked}
                              >
                                <option value="">Home nominated player (info)</option>
                                {homeNominatedOptions.map((id) => <option key={id} value={named(playerById.get(id))}>{namedWithHandicap(playerById.get(id))}</option>)}
                              </select>
                            ) : <div />}
                            {slot.away_nominated ? (
                              <select
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                value={nominatedNames[`${slot.id}:away`] ?? ""}
                                onChange={(e) => {
                                  setNominatedNames((prev) => ({ ...prev, [`${slot.id}:away`]: e.target.value }));
                                  updateSlotLocal(slot.id, { away_nominated_name: e.target.value || null });
                                }}
                                disabled={awaySelectionLocked}
                              >
                                <option value="">Away nominated player (info)</option>
                                {awayNominatedOptions.map((id) => <option key={id} value={named(playerById.get(id))}>{namedWithHandicap(playerById.get(id))}</option>)}
                              </select>
                            ) : <div />}
                          </div>
                        ) : null}

                        <p className="mt-2 text-xs text-slate-600">
                          Winner: {slot.winner_side === "home" ? (teamById.get(selectedFixture.home_team_id)?.name ?? "Home") : slot.winner_side === "away" ? (teamById.get(selectedFixture.away_team_id)?.name ?? "Away") : "Not decided"}
                        </p>
                      </div>
                    );
                  })}

                        </fieldset>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          Complete the team lineup tab first. The scorecard opens once both teams have submitted their lineups, or if paper record has been selected.
                        </div>
                      )}

                      {homeSideCanManageScorecard && currentScorecardFrame && !scorecardReviewMode ? (
                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              Current step: enter Frame {currentScorecardFrame.slot_no}, then save and continue.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setScorecardCurrentIndex((prev) => Math.max(prev - 1, 0))}
                                disabled={scorecardCurrentIndex === 0}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                              >
                                Previous frame
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveAndContinueCurrentFrame()}
                                className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white"
                              >
                                {scorecardCurrentIndex >= orderedScoreSlots.length - 1 ? "Save final frame" : "Save and continue"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {homeSideCanManageScorecard && scorecardReviewMode ? (
                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-sm text-slate-700">
                          Final review is open. You can amend any frame score below before you submit the match result.
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => {
                                setScorecardReviewMode(false);
                                setScorecardCurrentIndex(firstIncompleteScorecardIndex >= 0 ? firstIncompleteScorecardIndex : 0);
                              }}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                            >
                              Return to frame-by-frame journey
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {!homeSideCanManageScorecard ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          {pendingByFixture.has(selectedFixture.id)
                            ? "This scorecard is read-only while the submitted result is pending Super User review."
                            : selectedFixtureSide === "away"
                              ? "Away captain view: the home team is responsible for entering and submitting the scorecard."
                              : "This scorecard is read-only."}
                        </div>
                      ) : null}

                      <section className={`rounded-2xl border border-violet-200 bg-violet-50/70 p-4 ${!homeSideCanManageScorecard ? "opacity-80" : ""}`}>
                        <h3 className="text-base font-semibold text-slate-900">Breaks 30+</h3>
                        {currentScorecardFrame && !scorecardReviewMode ? (
                          <p className="mt-1 text-sm font-medium text-violet-900">
                            You are currently recording breaks while entering Frame {currentScorecardFrame.slot_no}.
                          </p>
                        ) : scorecardReviewMode ? (
                          <p className="mt-1 text-sm font-medium text-violet-900">
                            Final review mode: check every recorded 30+ break before you submit the match card.
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-600">
                          Record any 30+ breaks for this stage of the match before you move on. Three spaces are shown by default, and you can press <strong>More</strong> if a frame has extra breaks.
                        </p>
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
                                disabled={!homeSideCanManageScorecard}
                              >
                                <option value="">Select player</option>
                                {fixturePlayerOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                              </select>
                              <input
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                                placeholder="Or enter player name"
                                value={row.entered_player_name}
                                onChange={(e) => setBreakField(idx, { entered_player_name: e.target.value })}
                                disabled={!homeSideCanManageScorecard}
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
                                disabled={!homeSideCanManageScorecard}
                              />
                              <button
                                type="button"
                                onClick={() => setFixtureBreaks((prev) => prev.filter((_, i) => i !== idx))}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
                                disabled={!homeSideCanManageScorecard || (fixtureBreaks.length <= 3 && idx < 3)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={addBreakRow} disabled={!homeSideCanManageScorecard} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60">
                            More
                          </button>
                          <button
                            type="button"
                            onClick={saveBreaksOnly}
                            disabled={!homeSideCanManageScorecard}
                            className="rounded-xl border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-900 disabled:opacity-60"
                          >
                            Save breaks 30+
                          </button>
                        </div>
                      </section>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                        {homeSideCanManageScorecard ? (
                          <p className="mb-2 text-xs text-emerald-900">
                            Auto-save is active for live score updates. {lastAutoSavedAt ? `Last auto-saved at ${lastAutoSavedAt}.` : "Waiting for your next change."}
                          </p>
                        ) : null}
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                          <input
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            placeholder="Optional scorecard photo URL"
                            value={scorecardPhotoUrl}
                            onChange={(e) => { setScorecardDirty(true); setScorecardPhotoUrl(e.target.value); }}
                            disabled={!homeSideCanManageScorecard}
                          />
                          <button
                            type="button"
                            onClick={() => void saveProgress("manual")}
                            disabled={!homeSideCanManageScorecard}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                          >
                            Save progress
                          </button>
                          <button
                            type="button"
                            onClick={submit}
                            disabled={submitting || !homeSideCanManageScorecard}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                          >
                            {!homeSideCanManageScorecard
                              ? pendingByFixture.has(selectedFixture.id)
                                ? "Submission pending review"
                                : "Home team submits scorecard"
                              : submitting
                                ? "Submitting..."
                                : "Complete and submit scorecard"}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <MessageModal message={message} onClose={() => setMessage(null)} />
          <InfoModal open={Boolean(info)} title={info?.title ?? ""} description={info?.description ?? ""} onClose={() => setInfo(null)} />
          <ConfirmModal
            open={Boolean(frameAdvancePrompt)}
            title={frameAdvancePrompt?.isFinalFrame ? `Frame ${frameAdvancePrompt.slotNo} final check` : `Frame ${frameAdvancePrompt?.slotNo ?? ""} ready to save?`}
            description={
              currentScorecardFrame
                ? [
                    `Score entered: ${currentScorecardFrame.home_points_scored ?? 0}-${currentScorecardFrame.away_points_scored ?? 0}.`,
                    currentFrameBreakSummary.recorded.length > 0
                      ? `Recorded 30+ breaks: ${currentFrameBreakSummary.recorded.join(", ")}.`
                      : "No 30+ breaks recorded for this frame.",
                    currentFrameBreakSummary.hasPartial
                      ? "There is also an unfinished break row on the card. That draft will stay on this device until you complete it."
                      : frameAdvancePrompt?.isFinalFrame
                        ? "Saving this frame will open the final submit/amend prompt."
                        : "If everything looks right, save this frame and move on to the next one.",
                  ].join(" ")
                : ""
            }
            confirmLabel={frameAdvancePrompt?.isFinalFrame ? "Save final frame" : "Save and continue"}
            cancelLabel="Go back"
            onCancel={() => setFrameAdvancePrompt(null)}
            onConfirm={() => {
              setFrameAdvancePrompt(null);
              void confirmSaveAndContinueCurrentFrame();
            }}
          />
          <ConfirmModal
            open={confirmSubmitPromptOpen}
            title={submitPromptMode === "final_frame" ? "Final frame saved" : "Match card ready to submit"}
            description={
              submitPromptMode === "final_frame"
                ? "The final frame has been saved. You now need to either submit this match for Super User approval, or go back and amend the final frame score."
                : "All frame scores and recorded breaks have been saved. Do you want to submit this scorecard now for Super User approval?"
            }
            confirmLabel="Submit now"
            cancelLabel={submitPromptMode === "final_frame" ? "Amend final frame" : "Review first"}
            onCancel={() => {
              setConfirmSubmitPromptOpen(false);
              if (submitPromptMode === "final_frame") {
                setScorecardReviewMode(false);
                setScorecardCurrentIndex(Math.max(orderedScoreSlots.length - 1, 0));
              }
            }}
            onConfirm={() => {
              setConfirmSubmitPromptOpen(false);
              void submit();
            }}
          />
        </RequireAuth>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import InfoModal from "@/components/InfoModal";
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

const named = (p?: Player | null) => (p ? (p.full_name?.trim() ? p.full_name : p.display_name) : "Unknown");
const ratingOf = (p?: Player | null) => Number(p?.rating_snooker ?? 1000);
const sortLabelByFirstName = (a: string, b: string) => {
  const aParts = a.trim().split(/\s+/);
  const bParts = b.trim().split(/\s+/);
  const firstCompare = (aParts[0] ?? "").localeCompare(bParts[0] ?? "");
  if (firstCompare !== 0) return firstCompare;
  return a.localeCompare(b);
};

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
    { player_id: null, entered_player_name: "", break_value: "" },
  ]);

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
    const padded = [...rows];
    while (padded.length < 4) padded.push({ player_id: null, entered_player_name: "", break_value: "" });
    setFixtureBreaks(padded);
  };

  const loadAll = async () => {
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
        .select("id,season_id,home_team_id,away_team_id,fixture_date,week_no,status,pre_match_paper_record,pre_match_paper_at,pre_match_paper_by_user_id,home_lineup_submitted_at,home_lineup_submitted_by_user_id,away_lineup_submitted_at,away_lineup_submitted_by_user_id")
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
    if (initialFixtureRes.error && initialFixtureRes.error.message.toLowerCase().includes("pre_match_")) {
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
  };

  useEffect(() => {
    void loadAll();
  }, []);

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
  const homeLineupSubmitted = Boolean(selectedFixture?.home_lineup_submitted_at);
  const awayLineupSubmitted = Boolean(selectedFixture?.away_lineup_submitted_at);
  const lineupsLocked = Boolean(preMatchPaperRecord || (homeLineupSubmitted && awayLineupSubmitted));
  const lineupWindowOpen = Boolean(selectedFixture && isLineupSubmissionOpen(selectedFixture.fixture_date));
  const canSubmitHomeLineup = Boolean(
    selectedFixture &&
      selectedFixtureSide === "home" &&
      lineupWindowOpen &&
      !preMatchPaperRecord &&
      !homeLineupSubmitted &&
      !awayLineupSubmitted
  );
  const canSubmitAwayLineup = Boolean(
    selectedFixture &&
      selectedFixtureSide === "away" &&
      lineupWindowOpen &&
      !preMatchPaperRecord &&
      homeLineupSubmitted &&
      !awayLineupSubmitted
  );
  const canEditSubmittedHomeLineup = Boolean(
    selectedFixture &&
      selectedFixtureSide === "home" &&
      homeLineupSubmitted &&
      !awayLineupSubmitted &&
      isBeforeHomeLineupCutoff(selectedFixture.fixture_date)
  );
  const homeSideCanManageScorecard = Boolean(
    selectedFixture &&
      selectedFixtureSide === "home" &&
      !pendingByFixture.has(selectedFixture.id)
  );
  const homeLineupStepLabel = preMatchPaperRecord
    ? "Paper record selected"
    : canEditSubmittedHomeLineup
      ? "Submitted (editable)"
      : homeLineupSubmitted
      ? "Sent to opponent"
      : canSubmitHomeLineup
        ? "Ready for home captain"
        : "Waiting for home captain";
  const awayLineupStepLabel = preMatchPaperRecord
    ? "Paper record selected"
    : awayLineupSubmitted
      ? "Confirmed"
      : canSubmitAwayLineup
        ? "Ready for away captain"
        : homeLineupSubmitted
          ? "Waiting for away captain"
          : "Waiting for home lineup";
  const lineupNextAction = preMatchPaperRecord
    ? "Paper lineup selected. You can move to the scorecard whenever you are ready."
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
      if (pendingBreaks.length > 0) {
        const rows = pendingBreaks.map((row) => ({
          player_id: row.player_id ?? null,
          entered_player_name: row.entered_player_name ?? "",
          break_value: String(row.break_value ?? ""),
        }));
        while (rows.length < 4) rows.push({ player_id: null, entered_player_name: "", break_value: "" });
        setFixtureBreaks(rows);
      } else {
        setFixtureBreaks([
          { player_id: null, entered_player_name: "", break_value: "" },
          { player_id: null, entered_player_name: "", break_value: "" },
          { player_id: null, entered_player_name: "", break_value: "" },
          { player_id: null, entered_player_name: "", break_value: "" },
        ]);
      }
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
    if (typeof window !== "undefined") {
      const savedDraftRaw = window.localStorage.getItem(`rf_league_captain_draft_${selectedFixture.id}`);
      if (savedDraftRaw) {
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
          setInfo({
            title: "Saved progress restored",
            description: `Draft restored from ${new Date(savedDraft.savedAt).toLocaleString()}.`,
          });
          return;
        } catch {
          window.localStorage.removeItem(`rf_league_captain_draft_${selectedFixture.id}`);
        }
      }
    }
    void loadBreaks(selectedFixture.id);
  }, [selectedFixture, allSlots, pendingSubmissionMap]);

  useEffect(() => {
    if (!selectedFixture) return;
    if (homeLineupSubmitted && awayLineupSubmitted) {
      setActiveEntryTab("scorecard");
      return;
    }
    setActiveEntryTab("lineup");
  }, [selectedFixture, homeLineupSubmitted, awayLineupSubmitted]);

  const saveProgress = async () => {
    if (!selectedFixture || !draftStorageKey || typeof window === "undefined") return;
    const draft: CaptainResultDraft = {
      slots,
      fixtureBreaks,
      scorecardPhotoUrl,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    if (!homeSideCanManageScorecard || (!lineupsLocked && !preMatchPaperRecord)) {
      setInfo({ title: "Progress saved", description: "Your draft has been saved on this device and can be restored when you return." });
      return;
    }

    const client = supabase;
    if (!client) {
      setInfo({ title: "Progress saved", description: "Your draft has been saved on this device and can be restored when you return." });
      return;
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
    const breakRows = getValidatedBreakRows();
    if (breakRows.error) {
      setMessage(breakRows.error);
      return;
    }
    if (frameResults.length > 0) frameResults[0].break_entries = breakRows.rows;

    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token ?? null;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
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
      await loadAll();
      setInfo({
        title: "Progress saved",
        description: "Your draft has been saved on this device and the live match board has been updated.",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save live score progress.");
    }
  };

  const saveLineupDraft = () => {
    void saveProgress();
    setInfo({
      title: "Lineup draft saved",
      description: "Your lineup draft has been saved on this device. Only submit it once the team is final.",
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
      .map((id) => ({ id, label: named(playerById.get(id)) }))
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
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const merged = { ...s, ...patch } as FrameSlot;
        return { ...merged, winner_side: deriveWinnerFromFrame(merged) };
      })
    );
  };

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
          return `Complete every ${side} doubles slot before submitting the lineup.`;
        }
        continue;
      }
      const playerId = side === "home" ? slot.home_player1_id : slot.away_player1_id;
      const nominated = side === "home" ? slot.home_nominated : slot.away_nominated;
      const nominatedName = side === "home" ? slot.home_nominated_name : slot.away_nominated_name;
      const forfeit = side === "home" ? slot.home_forfeit : slot.away_forfeit;
      if (!playerId && !nominated && !forfeit) {
        return `Complete every ${side} singles slot before submitting the lineup.`;
      }
      if (nominated && !nominatedName?.trim()) {
        return `Enter the nominated player name for ${side} before submitting the lineup.`;
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
        title: side === "home" ? "Home lineup submitted" : "Away lineup submitted",
        description:
          side === "home"
            ? "Home lineup saved. The away captain can now complete and confirm the lineup for tonight's fixture."
            : "Away lineup saved. Lineups are now locked and the fixture is ready for score entry.",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to submit lineup.");
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
      setMessage(payload.error ?? "Failed to submit result.");
      return;
    }

    setInfo({ title: "Result Submitted", description: "Your result has been submitted for Super User approval." });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(`rf_league_captain_draft_${selectedFixture.id}`);
    }
    setScorecardPhotoUrl("");
    await loadAll();
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
                  {selectedFixtureSide === "home" ? (
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
                          Result submission responsibility: <strong>Home team by default</strong>
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
                        {canSubmitHomeLineup ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void submitLineupForSide("home")}
                              disabled={submitting}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                            >
                              {submitting ? "Saving..." : "Submit team to opponent"}
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
                            {submitting ? "Saving..." : "Submit and confirm lineup"}
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
                            Enter the players for frames 1-{slots.length}. Home team sends its lineup first. The away team then confirms against the home lineup already shown here.
                          </p>
                        </div>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                          {selectedFixtureSide === "home" ? "Home team view" : selectedFixtureSide === "away" ? "Away team view" : "Fixture view"}
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
                          <p className="mt-2 text-sm text-slate-700">Slots 1-6 should be submitted to the opponent by 19:15.</p>
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
                          <p className="mt-2 text-sm text-slate-700">Once the home team has sent its players, the away team should confirm by 19:30.</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <strong>What happens next:</strong> {lineupNextAction}
                      </div>
                      {selectedFixtureSide === "home" ? (
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
                                        {homeDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.home_player2_id === id}>{named(playerById.get(id))}</option>)}
                                      </select>
                                      <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={slot.home_player2_id ?? ""} onChange={(e) => updateSlotLocal(slot.id, { home_player2_id: e.target.value || null })} disabled={homeSelectionLocked}>
                                        <option value="">Home player 2</option>
                                        {homeDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.home_player1_id === id}>{named(playerById.get(id))}</option>)}
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
                                          {named(playerById.get(id))}
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
                                        {awayDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.away_player2_id === id}>{named(playerById.get(id))}</option>)}
                                      </select>
                                      <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={slot.away_player2_id ?? ""} onChange={(e) => updateSlotLocal(slot.id, { away_player2_id: e.target.value || null })} disabled={awaySelectionLocked}>
                                        <option value="">Away player 2</option>
                                        {awayDoublesOptions.map((id) => <option key={id} value={id} disabled={slot.away_player1_id === id}>{named(playerById.get(id))}</option>)}
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
                                          {named(playerById.get(id))}
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

                      {lineupsLocked || preMatchPaperRecord ? (
                        <fieldset
                          disabled={!homeSideCanManageScorecard}
                          className={!homeSideCanManageScorecard ? "cursor-not-allowed opacity-80" : ""}
                        >
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
                                    <option key={id} value={id} disabled={slot.home_player2_id === id}>{named(playerById.get(id))}</option>
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
                                    <option key={id} value={id} disabled={slot.home_player1_id === id}>{named(playerById.get(id))}</option>
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
                                    {named(playerById.get(id))}
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
                                    <option key={id} value={id} disabled={slot.away_player2_id === id}>{named(playerById.get(id))}</option>
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
                                    <option key={id} value={id} disabled={slot.away_player1_id === id}>{named(playerById.get(id))}</option>
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
                                    {named(playerById.get(id))}
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
                                {homeNominatedOptions.map((id) => <option key={id} value={named(playerById.get(id))}>{named(playerById.get(id))}</option>)}
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
                                {awayNominatedOptions.map((id) => <option key={id} value={named(playerById.get(id))}>{named(playerById.get(id))}</option>)}
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
                                disabled={!homeSideCanManageScorecard || (fixtureBreaks.length <= 4 && idx < 4)}
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
                        </div>
                      </section>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                          <input
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            placeholder="Optional scorecard photo URL"
                            value={scorecardPhotoUrl}
                            onChange={(e) => setScorecardPhotoUrl(e.target.value)}
                            disabled={!homeSideCanManageScorecard}
                          />
                          <button
                            type="button"
                            onClick={saveProgress}
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
        </RequireAuth>
      </div>
    </main>
  );
}

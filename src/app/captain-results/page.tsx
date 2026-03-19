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
};
type Player = {
  id: string;
  display_name: string;
  full_name: string | null;
  snooker_handicap?: number | null;
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
type FixtureChangeRequest = {
  id: string;
  fixture_id: string;
  requested_by_user_id: string;
  requester_team_id: string | null;
  request_type: "play_early" | "play_late";
  original_fixture_date: string | null;
  proposed_fixture_date: string;
  opposing_team_agreed: boolean;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
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

function isFixtureOpenForSubmission(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const fixtureStart = new Date(`${fixtureDate}T00:00:00`);
  if (Number.isNaN(fixtureStart.getTime())) return false;
  const submissionDeadline = new Date(fixtureStart);
  submissionDeadline.setDate(submissionDeadline.getDate() + 1);
  submissionDeadline.setHours(17, 0, 0, 0);
  const now = new Date();
  return now >= fixtureStart && now <= submissionDeadline;
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
  const [fixtureChangeRequests, setFixtureChangeRequests] = useState<FixtureChangeRequest[]>([]);
  const [changeRequestType, setChangeRequestType] = useState<"play_early" | "play_late">("play_early");
  const [changeRequestDate, setChangeRequestDate] = useState("");
  const [changeRequestReason, setChangeRequestReason] = useState("");
  const [changeRequestAgreed, setChangeRequestAgreed] = useState(false);
  const [changeRequestSubmitting, setChangeRequestSubmitting] = useState(false);

  const [slots, setSlots] = useState<FrameSlot[]>([]);
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

  const loadFixtureChangeRequests = async (fixtureId: string) => {
    const client = supabase;
    if (!client || !fixtureId) return;
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/league/fixture-change-requests?fixtureId=${encodeURIComponent(fixtureId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string; rows?: FixtureChangeRequest[] };
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to load fixture date requests.");
      return;
    }
    setFixtureChangeRequests(payload.rows ?? []);
  };

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

    const [seasonRes, teamRes, memberRes, fixtureRes, slotRes, pendingRes, playerRes] = await Promise.all([
      client
        .from("league_seasons")
        .select("id,name,is_published,handicap_enabled,singles_count,doubles_count")
        .eq("is_published", true)
        .order("created_at", { ascending: false }),
      client.from("league_teams").select("id,season_id,name"),
      client.from("league_team_members").select("season_id,team_id,player_id,is_captain,is_vice_captain"),
      client
        .from("league_fixtures")
        .select("id,season_id,home_team_id,away_team_id,fixture_date,week_no,status")
        .order("fixture_date", { ascending: true }),
      client
        .from("league_fixture_frames")
        .select("id,fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated,away_nominated,home_forfeit,away_forfeit,winner_side,home_nominated_name,away_nominated_name,home_points_scored,away_points_scored")
        .order("slot_no", { ascending: true }),
      client.from("league_result_submissions").select("fixture_id,status,frame_results,scorecard_photo_url").eq("status", "pending"),
      client.from("players").select("id,display_name,full_name,snooker_handicap").eq("is_archived", false),
    ]);

    const firstError =
      seasonRes.error?.message ||
      teamRes.error?.message ||
      memberRes.error?.message ||
      fixtureRes.error?.message ||
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
    setFixtures((fixtureRes.data ?? []) as Fixture[]);
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
    () => myFixtures.find((f) => f.id === selectedFixtureId) ?? null,
    [myFixtures, selectedFixtureId]
  );
  useEffect(() => {
    if (!selectedFixtureId) return;
    if (!myFixtures.some((f) => f.id === selectedFixtureId)) setSelectedFixtureId("");
  }, [selectedFixtureId, myFixtures]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedFixtureId = new URLSearchParams(window.location.search).get("fixtureId");
    if (!requestedFixtureId) return;
    if (myFixtures.some((fixture) => fixture.id === requestedFixtureId)) {
      setSelectedFixtureId(requestedFixtureId);
    }
  }, [myFixtures]);


  const selectedSeason = useMemo(
    () => (selectedFixture ? seasons.find((s) => s.id === selectedFixture.season_id) ?? null : null),
    [seasons, selectedFixture]
  );

  const isWinterFormat = (selectedSeason?.singles_count ?? 4) === 4 && (selectedSeason?.doubles_count ?? 1) === 1;
  const singlesMaxPerPlayer = (selectedSeason?.singles_count ?? 5) === 6 && (selectedSeason?.doubles_count ?? 1) === 0 ? 2 : 1;

  useEffect(() => {
    if (!selectedFixture) {
      setFixtureChangeRequests([]);
      setChangeRequestReason("");
      setChangeRequestAgreed(false);
      setChangeRequestType("play_early");
      setChangeRequestDate("");
      return;
    }
    setChangeRequestType("play_early");
    setChangeRequestReason("");
    setChangeRequestAgreed(false);
    setChangeRequestDate(selectedFixture.fixture_date ?? "");
    void loadFixtureChangeRequests(selectedFixture.id);
  }, [selectedFixtureId, selectedFixture?.fixture_date]);

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
    void loadBreaks(selectedFixture.id);
  }, [selectedFixture, allSlots, pendingSubmissionMap]);

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

  const doublesHandicapLabel = (slot: FrameSlot) => {
    const home = (playerHandicap(slot.home_player1_id) + playerHandicap(slot.home_player2_id)) / 2;
    const away = (playerHandicap(slot.away_player1_id) + playerHandicap(slot.away_player2_id)) / 2;
    const starts = calculateAdjustedScoresWithCap(0, 0, home, away);
    if (starts.homeStart > 0) return `Doubles handicap: Home receives ${starts.homeStart} start`;
    if (starts.awayStart > 0) return `Doubles handicap: Away receives ${starts.awayStart} start`;
    return "Doubles handicap: Level start";
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

  const requestTypeLabel = (value: "play_early" | "play_late") =>
    value === "play_early" ? "Play before league date" : "Exceptional postponement / later date";

  const submitFixtureChangeRequest = async () => {
    const client = supabase;
    if (!client || !selectedFixture) return;
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setChangeRequestSubmitting(true);
    let res: Response;
    try {
      res = await fetch("/api/league/fixture-change-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fixtureId: selectedFixture.id,
          requestType: changeRequestType,
          proposedFixtureDate: changeRequestDate,
          reason: changeRequestReason,
          opposingTeamAgreed: changeRequestAgreed,
        }),
      });
    } catch {
      setChangeRequestSubmitting(false);
      setMessage("Network error while submitting fixture date request.");
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setChangeRequestSubmitting(false);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to submit fixture date request.");
      return;
    }
    setInfo({ title: "Request submitted", description: "Your fixture date request is now pending League Secretary review." });
    await loadFixtureChangeRequests(selectedFixture.id);
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
    if (!isFixtureOpenForSubmission(selectedFixture.fixture_date)) return setMessage("Fixture is not open. Captains can submit from match night until 5pm on the following day.");
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
    setScorecardPhotoUrl("");
    await loadAll();
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Captain Result Submission" eyebrow="League" subtitle="Submit your team result for Super User approval." />
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
                <p className="mt-1 text-sm text-slate-600">Choose a fixture, complete each frame, then submit for review.</p>
              </div>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={selectedFixtureId}
                onChange={(e) => setSelectedFixtureId(e.target.value)}
              >
                <option value="">Select your fixture</option>
                {myFixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fixture_date ? new Date(`${f.fixture_date}T12:00:00`).toLocaleDateString() : `Week ${f.week_no ?? "-"}`} · {teamById.get(f.home_team_id)?.name ?? "Home"} vs {teamById.get(f.away_team_id)?.name ?? "Away"}
                    {pendingByFixture.has(f.id) ? " · pending review" : ""}
                  </option>
                ))}
              </select>

              {myCurrentWeekFixtures.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No fixtures are open for result submission right now. Captains and vice-captains can still open future fixtures here to request a date change.
                </p>
              ) : null}
              {selectedFixture ? (
                <div className="space-y-3">
                  {pendingByFixture.has(selectedFixture.id) ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This fixture has been submitted and is pending Super User review. Your submitted details are shown below in read-only mode.
                    </div>
                  ) : null}
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
                      <p className="mt-1">In doubles, team handicap = (player 1 handicap + player 2 handicap) ÷ 2, with the live start capped at {MAX_SNOOKER_START}.</p>
                    ) : null}
                  </div>

                  <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Fixture date request</h3>
                        <p className="mt-1 text-sm text-slate-700">
                          No postponements are allowed as standard. Teams may request to play before the league date by agreement, or request a later date only in exceptional circumstances and only with League Secretary approval.
                        </p>
                      </div>
                      {selectedFixture.fixture_date ? (
                        <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700">
                          Published date: {new Date(`${selectedFixture.fixture_date}T12:00:00`).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
                      <li>Play-before requests require opposing team agreement and League Secretary approval.</li>
                      <li>Later-date requests are for exceptional circumstances only: illness, severe weather, or bereavement for example.</li>
                      <li>Not having enough players is not treated as exceptional.</li>
                    </ul>
                    <div className="mt-4 grid gap-3 md:grid-cols-[220px_180px]">
                      <select
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={changeRequestType}
                        onChange={(e) => setChangeRequestType(e.target.value as "play_early" | "play_late")}
                      >
                        <option value="play_early">Play before league date</option>
                        <option value="play_late">Exceptional postponement / later date</option>
                      </select>
                      <input
                        type="date"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={changeRequestDate}
                        onChange={(e) => setChangeRequestDate(e.target.value)}
                      />
                    </div>
                    <textarea
                      className="mt-3 min-h-[96px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="Explain the request and confirm any agreement with the opposing team."
                      value={changeRequestReason}
                      onChange={(e) => setChangeRequestReason(e.target.value)}
                    />
                    <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={changeRequestAgreed}
                        onChange={(e) => setChangeRequestAgreed(e.target.checked)}
                        className="mt-1"
                      />
                      <span>The opposing team has agreed to this request. This is required for play-before requests.</span>
                    </label>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void submitFixtureChangeRequest()}
                        disabled={changeRequestSubmitting}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {changeRequestSubmitting ? "Submitting..." : "Submit fixture date request"}
                      </button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {fixtureChangeRequests.length === 0 ? (
                        <p className="text-sm text-slate-600">No fixture date requests logged for this fixture yet.</p>
                      ) : (
                        fixtureChangeRequests.map((request) => (
                          <div key={request.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-slate-900">{requestTypeLabel(request.request_type)} · {new Date(`${request.proposed_fixture_date}T12:00:00`).toLocaleDateString()}</p>
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${request.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : request.status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                                {request.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">Requested {new Date(request.created_at).toLocaleString()}</p>
                            <p className="mt-1">{request.reason}</p>
                            {request.review_notes ? <p className="mt-1 text-xs text-slate-600">League Secretary note: {request.review_notes}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <fieldset
                    disabled={pendingByFixture.has(selectedFixture.id) || !isFixtureOpenForSubmission(selectedFixture.fixture_date)}
                    className={pendingByFixture.has(selectedFixture.id) || !isFixtureOpenForSubmission(selectedFixture.fixture_date) ? "cursor-not-allowed opacity-80" : ""}
                  >
                  {slots.map((slot) => {
                    const homeSinglesCount = new Map<string, number>();
                    const awaySinglesCount = new Map<string, number>();
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
                          {slot.slot_type === "doubles" && selectedSeason?.handicap_enabled ? (
                            <p className="mt-1 text-xs text-slate-600">{doublesHandicapLabel(slot)} (combined player handicaps ÷ 2)</p>
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

                  {!isFixtureOpenForSubmission(selectedFixture.fixture_date) ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                      Result entry opens on match night and stays open until 5pm the following day. You can still submit a fixture date request above for future fixtures.
                    </div>
                  ) : null}

                  <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
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
                          >
                            <option value="">Select player</option>
                            {fixturePlayerOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
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
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={addBreakRow} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
                        More
                      </button>
                    </div>
                  </section>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <input
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Optional scorecard photo URL"
                        value={scorecardPhotoUrl}
                        onChange={(e) => setScorecardPhotoUrl(e.target.value)}
                        disabled={pendingByFixture.has(selectedFixture.id)}
                      />
                      <button
                        type="button"
                        onClick={submit}
                        disabled={submitting || pendingByFixture.has(selectedFixture.id) || !isFixtureOpenForSubmission(selectedFixture.fixture_date)}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {pendingByFixture.has(selectedFixture.id) ? "Submission pending review" : submitting ? "Submitting..." : "Submit for approval"}
                      </button>
                    </div>
                  </div>
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

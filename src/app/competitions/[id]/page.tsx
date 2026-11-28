"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MickWhiteFixtures from "@/components/MickWhiteFixtures";
import { competitionEntryFormat, competitionEntryTeamName, entrantsRequired, isMickWhiteCompetitionName, specialCompetitionScoring } from "@/lib/public-competition-entry";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { competitionDeadlineLabel, competitionEntriesOpen, usesFixedCompetitionHandicaps } from "@/lib/fixed-competition-handicaps";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import CompetitionOfficialDraw from "@/components/CompetitionOfficialDraw";
import CompetitionOfficerEntry from "@/components/CompetitionOfficerEntry";
import { entryRoster, isLeagueCup, knockoutBestOf, knockoutMatchSides, knockoutRosterProblems } from "@/lib/knockout-draw";
import CompetitionEntryWithdrawal from "@/components/CompetitionEntryWithdrawal";
import MessageModal from "@/components/MessageModal";
import { loadLastLeagueFixture, semiFinalScheduleWarning } from "@/lib/competition-schedule";

type Competition = {
  id: string;
  name: string;
  venue: string | null;
  sport_type: "snooker" | "billiards";
  competition_format: "knockout" | "league";
  match_mode?: "singles" | "doubles";
  app_assign_opening_break?: boolean;
  best_of: number;
  knockout_round_best_of?: {
    round1?: number;
    semi_final?: number;
    final?: number;
  } | null;
  signup_open?: boolean;
  signup_deadline?: string | null;
  final_scheduled_at?: string | null;
  final_venue_location_id?: string | null;
  max_entries?: number | null;
};
type VenueLocation = { id: string; name: string };
type Match = {
  id: string;
  round_no: number | null;
  match_no: number | null;
  best_of: number;
  status: "pending" | "in_progress" | "complete" | "bye";
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id?: string | null;
  team1_player2_id?: string | null;
  team2_player1_id?: string | null;
  team2_player2_id?: string | null;
  winner_player_id: string | null;
};
type Player = { id: string; display_name: string; full_name: string | null; is_archived: boolean; location_id: string | null };
type Frame = {
  match_id: string;
  winner_player_id: string | null;
  is_walkover_award: boolean;
};
type Entry = {
  id: string;
  competition_id: string;
  requester_user_id: string;
  player_id: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  created_at: string;
  note?: string | null;
};
type View = "fixtures" | "bracket";
type BracketNode = {
  id: string;
  roundNo: number;
  matchNo: number;
  bestOf: number;
  status: Match["status"] | "tbc";
  p1: string;
  p2: string;
  winnerId: string | null;
};
type FixtureRow = {
  id: string | null;
  roundNo: number;
  matchNo: number;
  bestOf: number;
  label: string;
  status: string;
  isPlaceholder: boolean;
  displayMatchNo: number;
};
const BRACKET_CARD_HEIGHT = 112;
const BRACKET_STEP = 136;

function getRoundLabel(roundNo: number, totalRounds: number): string {
  if (totalRounds <= 1) return "Final";
  if (roundNo === totalRounds) return "Final";
  if (roundNo === totalRounds - 1) return "Semi-final";
  if (roundNo === totalRounds - 2) return "Quarter-final";
  if (roundNo === totalRounds - 3) return "Last 16";
  return `Round ${roundNo}`;
}

function resolveWinnerSide(m: Match): 1 | 2 | 0 {
  if (!m.winner_player_id) return 0;
  if (m.team1_player1_id || m.team1_player2_id || m.team2_player1_id || m.team2_player2_id) {
    if (m.winner_player_id === m.team1_player1_id || m.winner_player_id === m.team1_player2_id) return 1;
    if (m.winner_player_id === m.team2_player1_id || m.winner_player_id === m.team2_player2_id) return 2;
    return 0;
  }
  if (m.winner_player_id === m.player1_id) return 1;
  if (m.winner_player_id === m.player2_id) return 2;
  return 0;
}
const entryStatusClass = (status: Entry["status"]) => {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
};
const matchStatusClass = (status: Match["status"]) => {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "in_progress") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  if (status === "complete" || status === "bye") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
};
const fixtureStatusClass = (status: string) => {
  if (status === "pending" || status === "Pending") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "in_progress" || status === "In progress") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  if (status === "complete" || status === "Complete" || status === "Locked") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
};

export default function CompetitionPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const admin = useAdminStatus();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [fixtureLoad, setFixtureLoad] = useState<{ competitionId: string; failed: boolean } | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [withdrawalRevision, setWithdrawalRevision] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [signupDeadlineInput, setSignupDeadlineInput] = useState("");
  const [signupMaxEntriesInput, setSignupMaxEntriesInput] = useState("");
  const [finalDateInput, setFinalDateInput] = useState("");
  const [finalVenueInput, setFinalVenueInput] = useState("");
  const [locations, setLocations] = useState<VenueLocation[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [lastLeagueDate, setLastLeagueDate] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<Array<{ round_no: number; deadline_at: string }>>([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [view, setView] = useState<View>("fixtures");
  const [message, setMessage] = useState<string | null>(null);
  const isSuperManager = admin.canManageLeague;

  useEffect(() => {
    const client = supabase;
    if (!client || !admin.userId) return;
    let active = true;
    void client.from("app_users").select("linked_player_id").eq("id", admin.userId).maybeSingle()
      .then(({ data }) => { if (active) setMyPlayerId(data?.linked_player_id ?? null); });
    return () => { active = false; };
  }, [admin.userId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !isSuperManager || !matches.length || competition?.competition_format !== "knockout") return;
    let active = true;
    void loadLastLeagueFixture(client)
      .then(({ data }) => { if (active) setLastLeagueDate(data?.fixture_date ?? null); });
    return () => { active = false; };
  }, [competition?.competition_format, isSuperManager, matches.length]);

  const updateSignupSettings = async (patch: Partial<Competition>) => {
    const client = supabase;
    if (!client || !competition) return;
    if (!isSuperManager) {
      setMessage("League management access is required to manage sign-up settings.");
      return;
    }
    const res = await client.from("competitions").update(patch).eq("id", competition.id);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    setCompetition({ ...competition, ...patch });
  };

  const reviewEntry = async (entryId: string, status: "approved" | "rejected") => {
    const client = supabase;
    if (!client || !admin.userId) return;
    if (!isSuperManager) {
      setMessage("League management access is required to approve or reject entries.");
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
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, status } : e)));
  };

  const manageCompetition = async (action: Record<string, unknown>) => {
    const { data } = await supabase?.auth.getSession() ?? {};
    const token = data?.session?.access_token;
    if (!token) {
      setMessage("Sign in as a league officer.");
      return false;
    }
    try {
      const response = await fetch("/api/league/manage-competition", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...action, competitionId: id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "The competition could not be updated.");
        return false;
      }
      setWithdrawalRevision((revision) => revision + 1);
      setMessage(action.action === "publish_draw" ? "Draw published." : "Approved entry added.");
      return true;
    } catch {
      setMessage("The competition could not be updated. Refresh to check before retrying.");
      return false;
    }
  };

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    let active = true;
    const load = async () => {
      const [cRes, mRes, pRes, locRes, entryRes, deadlineRes] = await Promise.all([
        client
          .from("competitions")
          .select("id,name,venue,sport_type,competition_format,match_mode,app_assign_opening_break,best_of,knockout_round_best_of,signup_open,signup_deadline,final_scheduled_at,final_venue_location_id,max_entries")
          .eq("id", id)
          .single(),
        client
          .from("matches")
          .select("id,round_no,match_no,best_of,status,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,winner_player_id")
          .eq("competition_id", id)
          .eq("is_archived", false)
          .order("round_no")
          .order("match_no"),
        client.from("players").select("id,display_name,full_name,is_archived,location_id"),
        client.from("locations").select("id,name").order("name", { ascending: true }),
        client.from("competition_entries")
          .select("id,competition_id,requester_user_id,player_id,status,created_at,note")
          .eq("competition_id", id).order("created_at", { ascending: false }),
        client.from("competition_round_deadlines").select("round_no,deadline_at").eq("competition_id", id),

      ]);
      if (!active) return;
      if (cRes.error || !cRes.data) {
        setMessage(cRes.error?.message ?? "Failed to load competition.");
        return;
      }
      const comp = cRes.data as Competition;
      let loadedMatches = (mRes.data ?? []) as Match[];
      if (mRes.error || entryRes.error || deadlineRes?.error) {
        setMessage(mRes.error?.message ?? entryRes.error?.message ?? deadlineRes?.error?.message ?? "Competition details could not be loaded.");
      }
      setCompetition(comp);
      const changed = isSuperManager && !isMickWhiteCompetitionName(comp.name) && !mRes.error && await ensureKnockoutNextRoundMatches(client, comp, loadedMatches);
      if (changed) {
        const refreshed = await client
          .from("matches")
          .select("id,round_no,match_no,best_of,status,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,winner_player_id")
          .eq("competition_id", id)
          .eq("is_archived", false)
          .order("round_no")
          .order("match_no");
        if (refreshed.data) loadedMatches = refreshed.data as Match[];
      }
      if (!active) return;
      setMatches(loadedMatches);
      setFixtureLoad({ competitionId: id, failed: Boolean(mRes.error) });
      setPlayers((pRes.data ?? []) as Player[]);
      setLocations((locRes.data ?? []) as VenueLocation[]);
      if (!active) return;
      if (entryRes.data) setEntries(entryRes.data as Entry[]);
      setEntriesLoaded(!mRes.error && !entryRes.error && !deadlineRes?.error);
      setDeadlines(deadlineRes?.data ?? []);
      setSignupDeadlineInput(comp.signup_deadline ? new Date(comp.signup_deadline).toISOString().slice(0, 16) : "");
      setSignupMaxEntriesInput(comp.max_entries ? String(comp.max_entries) : "");
      setFinalDateInput(comp.final_scheduled_at ? new Date(comp.final_scheduled_at).toISOString().slice(0, 16) : "");
      setFinalVenueInput(comp.final_venue_location_id ?? "");
      const matchIds = loadedMatches.map((m) => m.id);
      if (matchIds.length > 0) {
        const fRes = await client
          .from("frames")
          .select("match_id,winner_player_id,is_walkover_award")
          .in("match_id", matchIds);
        if (fRes.data) setFrames((fRes.data ?? []) as Frame[]);
      } else {
        setFrames([]);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id, withdrawalRevision, isSuperManager]);

  useEffect(() => {
    if (!entriesLoaded) return;
    const anchor = window.location.hash.slice(1);
    if (anchor === "manual-entry" || anchor === "official-draw") {
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    }
  }, [entriesLoaded]);

  const shortMap = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);
  const fullMap = useMemo(
    () => new Map(players.map((p) => [p.id, p.full_name?.trim() ? p.full_name : p.display_name])),
    [players]
  );
  const entryLabel = (entry: Pick<Entry, "player_id" | "note">) => {
    if (!entry.player_id && isMickWhiteCompetitionName(competition?.name ?? "")) {
      return competitionEntryTeamName(entry.note ?? null);
    }
    const name = fullMap.get(entry.player_id) ?? shortMap.get(entry.player_id) ?? "Unknown player";
    try {
      const note = JSON.parse(entry.note ?? "{}");
      const partners = note.teamMemberNames;
      return Array.isArray(partners) ? [name, ...partners].join(" & ") : name;
    } catch {
      return name;
    }
  };

  const rounds = useMemo(() => {
    const grouped = new Map<number, Match[]>();
    for (const m of matches) {
      const round = m.round_no ?? 1;
      if (!grouped.has(round)) grouped.set(round, []);
      grouped.get(round)!.push(m);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([roundNo, list]) => ({
        roundNo,
        list: [...list].sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0)),
      }));
  }, [matches]);
  const round1MatchCount = useMemo(
    () => Math.max(1, matches.filter((m) => (m.round_no ?? 1) === 1).reduce((max, m) => Math.max(max, m.match_no ?? 1), 1)),
    [matches]
  );
  const pendingEntries = useMemo(() => entries.filter((e) => e.status === "pending"), [entries]);
  const approvedEntries = useMemo(() => entries.filter((e) => e.status === "approved"), [entries]);

  const getDisplayMatchNo = (roundNo: number, roundMatchNo: number) => {
    if (!competition || competition.competition_format !== "knockout") return roundMatchNo;
    let offset = 0;
    for (let r = 1; r < roundNo; r += 1) {
      offset += Math.max(1, Math.floor(round1MatchCount / Math.pow(2, r - 1)));
    }
    return offset + roundMatchNo;
  };

  const getRoundBestOf = (roundNo: number, totalRounds: number, fallback: number) =>
    knockoutBestOf(competition?.knockout_round_best_of, fallback, roundNo, totalRounds);

  const getSinglesWinner = (m: Match): string | null => {
    if (!(m.status === "complete" || m.status === "bye")) return null;
    if (m.winner_player_id && (m.winner_player_id === m.player1_id || m.winner_player_id === m.player2_id)) return m.winner_player_id;
    return null;
  };

  const getDoublesWinnerTeam = (m: Match): { p1: string; p2: string } | null => {
    if (!(m.status === "complete" || m.status === "bye") || !m.winner_player_id) return null;
    const sides = knockoutMatchSides(m);
    const side = sides.home.includes(m.winner_player_id) ? sides.home : sides.away;
    if (side.length === 2 && side.includes(m.winner_player_id)) {
      return { p1: side[0], p2: side[1] };
    }
    return null;
  };

  const ensureKnockoutNextRoundMatches = async (
    client: NonNullable<typeof supabase>,
    comp: Competition,
    loadedMatches: Match[]
  ): Promise<boolean> => {
    if (comp.competition_format !== "knockout") return false;
    const byKey = new Map<string, Match>();
    loadedMatches.forEach((m) => byKey.set(`${m.round_no ?? 1}-${m.match_no ?? 1}`, m));
    const round1Count = Math.max(
      1,
      loadedMatches.filter((m) => (m.round_no ?? 1) === 1).reduce((max, m) => Math.max(max, m.match_no ?? 1), 1)
    );
    const totalRounds = Math.max(1, Math.log2(round1Count * 2));
    let changed = false;

    for (let roundNo = 1; roundNo < totalRounds; roundNo += 1) {
      const feederCount = Math.max(1, Math.floor(round1Count / Math.pow(2, roundNo - 1)));
      const nextCount = Math.max(1, Math.floor(feederCount / 2));
      for (let nextMatchNo = 1; nextMatchNo <= nextCount; nextMatchNo += 1) {
        const feederA = byKey.get(`${roundNo}-${(nextMatchNo * 2) - 1}`);
        const feederB = byKey.get(`${roundNo}-${nextMatchNo * 2}`);
        if (!feederA || !feederB) continue;
        if (byKey.has(`${roundNo + 1}-${nextMatchNo}`)) continue;

        if ((comp.match_mode ?? "singles") === "doubles") {
          const aTeam = getDoublesWinnerTeam(feederA);
          const bTeam = getDoublesWinnerTeam(feederB);
          if (!aTeam || !bTeam) continue;
          const breakerChoices = [aTeam.p1, aTeam.p2, bTeam.p1, bTeam.p2];
          const openingBreaker = comp.app_assign_opening_break
            ? breakerChoices[Math.floor(Math.random() * breakerChoices.length)]
            : null;
          const payload = {
            competition_id: comp.id,
            round_no: roundNo + 1,
            match_no: nextMatchNo,
            best_of: knockoutBestOf(comp.knockout_round_best_of, comp.best_of, roundNo + 1, totalRounds),
            status: "pending" as const,
            match_mode: "doubles" as const,
            player1_id: null,
            player2_id: null,
            team1_player1_id: aTeam.p1,
            team1_player2_id: aTeam.p2,
            team2_player1_id: bTeam.p1,
            team2_player2_id: bTeam.p2,
            winner_player_id: null,
            opening_break_player_id: openingBreaker,
          };
          const ins = await client.from("matches").insert(payload).select("id").single();
          if (!ins.error && ins.data) {
            changed = true;
            byKey.set(`${roundNo + 1}-${nextMatchNo}`, { ...payload, id: ins.data.id } as Match);
          }
        } else {
          const aWinner = getSinglesWinner(feederA);
          const bWinner = getSinglesWinner(feederB);
          if (!aWinner || !bWinner) continue;
          const openingBreaker = comp.app_assign_opening_break ? (Math.random() < 0.5 ? aWinner : bWinner) : null;
          const payload = {
            competition_id: comp.id,
            round_no: roundNo + 1,
            match_no: nextMatchNo,
            best_of: knockoutBestOf(comp.knockout_round_best_of, comp.best_of, roundNo + 1, totalRounds),
            status: "pending" as const,
            match_mode: "singles" as const,
            player1_id: aWinner,
            player2_id: bWinner,
            team1_player1_id: null,
            team1_player2_id: null,
            team2_player1_id: null,
            team2_player2_id: null,
            winner_player_id: null,
            opening_break_player_id: openingBreaker,
          };
          const ins = await client.from("matches").insert(payload).select("id").single();
          if (!ins.error && ins.data) {
            changed = true;
            byKey.set(`${roundNo + 1}-${nextMatchNo}`, { ...payload, id: ins.data.id } as Match);
          }
        }
      }
    }
    return changed;
  };

  const rosterByLead = useMemo(() => new Map(
    entries.filter((entry) => entry.status === "approved" || entry.status === "withdrawn").reverse()
      .map((entry) => [entry.player_id, entryRoster(entry)]),
  ), [entries]);
  const teamLabelFor = (team: string[]) => {
    const roster = team.length === 2 ? rosterByLead.get(team[0]) : undefined;
    const ids = roster?.length === 3 ? roster : team;
    return ids.map((id) => shortMap.get(id) ?? "TBC").join(" & ");
  };

  const bracketRounds = useMemo(() => {
    if (!competition || competition.competition_format !== "knockout") return [];

    const byKey = new Map<string, Match>();
    matches.forEach((m) => {
      byKey.set(`${m.round_no ?? 1}-${m.match_no ?? 1}`, m);
    });

    const totalRounds = Math.max(1, Math.log2(round1MatchCount * 2));

    const out: BracketNode[][] = [];
    for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
      const matchCount = Math.max(1, Math.floor(round1MatchCount / Math.pow(2, roundNo - 1)));
      const row: BracketNode[] = [];
      for (let matchNo = 1; matchNo <= matchCount; matchNo += 1) {
        const live = byKey.get(`${roundNo}-${matchNo}`);
        let p1 = shortMap.get(live?.player1_id ?? "") ?? "TBC";
        let p2 = shortMap.get(live?.player2_id ?? "") ?? "TBC";
        let status: BracketNode["status"] = live?.status ?? "tbc";
        let winnerId = live?.winner_player_id ?? null;

        const displayWinner = (feeder: Match | undefined) => {
          if (!feeder || (feeder.status !== "complete" && feeder.status !== "bye")) return "TBC";
          const winner = resolveWinnerSide(feeder);
          const sides = knockoutMatchSides(feeder);
          return winner ? teamLabelFor(winner === 1 ? sides.home : sides.away) : "TBC";
        };
        if (!live && roundNo > 1) {
          p1 = displayWinner(byKey.get(`${roundNo - 1}-${matchNo * 2 - 1}`));
          p2 = displayWinner(byKey.get(`${roundNo - 1}-${matchNo * 2}`));
        }
        if (live) {
          const sides = knockoutMatchSides(live);
          p1 = teamLabelFor(sides.home) || "TBC";
          p2 = status === "bye" ? "BYE" : teamLabelFor(sides.away) || "TBC";
        }

        row.push({
          id: live?.id ?? `tbc-${roundNo}-${matchNo}`,
          roundNo,
          matchNo,
          bestOf: live?.best_of ?? getRoundBestOf(roundNo, totalRounds, competition.best_of),
          status,
          p1,
          p2,
          winnerId,
        });
      }
      out.push(row);
    }
    return out;
  }, [competition, matches, shortMap, round1MatchCount, rosterByLead]);
  const totalBracketRounds = bracketRounds.length;
  const knockout = competition?.competition_format === "knockout";
  const mickWhite = Boolean(competition && isMickWhiteCompetitionName(competition.name));
  const fixturesReady = fixtureLoad?.competitionId === id && !fixtureLoad.failed;
  const finalReady = knockout && fixturesReady && matches.some((match) => {
    if ((match.round_no ?? 1) !== totalBracketRounds || match.status === "bye") return false;
    const sides = knockoutMatchSides(match);
    return sides.home.length > 0 && sides.away.length > 0;
  });
  const entriesOpen = Boolean(competition?.signup_open && competitionEntriesOpen(competition.signup_deadline));
  let officerStatus: { label: string; detail?: string; target?: string } | null = null;
  if (competition && knockout && isSuperManager && entriesLoaded && fixturesReady) {
    const minimum = isLeagueCup(competition.name) ? 4 : 2;
    const { incomplete, duplicated } = knockoutRosterProblems(approvedEntries, entrantsRequired(competition));
    if (matches.length) {
      officerStatus = finalReady && (!competition.final_scheduled_at || !competition.final_venue_location_id)
        ? { label: "Schedule the final", detail: "Set the date and neutral venue.", target: "#final-scheduling" }
        : { label: "Draw published", target: "#competition-fixtures" };
    } else if (entriesOpen) {
      officerStatus = {
        label: "Entries open",
        detail: competition.signup_deadline ? `Closes ${competitionDeadlineLabel(competition.signup_deadline)} (UK time).` : undefined,
        target: "#competition-entries",
      };
    } else if (pendingEntries.length) {
      officerStatus = { label: "Review pending entries", detail: `${pendingEntries.length} awaiting approval.`, target: "#competition-entries" };
    } else if (mickWhite) {
      officerStatus = { label: "Cup fixtures", detail: "Manage the official draw and enter the agreed dates for each tie.", target: "#competition-fixtures" };
    } else if (approvedEntries.length < minimum) {
      officerStatus = { label: "Confirm the competition format", detail: `${minimum - approvedEntries.length} more needed for a standard knockout.`, target: "#official-draw" };
    } else if (incomplete.length || duplicated) {
      officerStatus = { label: "Check player records", detail: "Resolve incomplete or duplicate entries.", target: "#official-draw" };
    } else {
      officerStatus = { label: "Ready to draw", detail: "Run the official draw when you’re ready to publish the fixtures.", target: "#official-draw" };
    }
  }

  const matchesByKey = useMemo(() => {
    const m = new Map<string, Match>();
    for (const match of matches) m.set(`${match.round_no ?? 1}-${match.match_no ?? 1}`, match);
    return m;
  }, [matches]);

  const getMatchLabel = (m: Match) => {
    const sides = knockoutMatchSides(m);
    return `${teamLabelFor(sides.home) || "TBC"} vs ${m.status === "bye" ? "BYE" : teamLabelFor(sides.away) || "TBC"}`;
  };

  const walkoverMatchIds = useMemo(() => new Set(frames.filter((frame) => frame.is_walkover_award).map((frame) => frame.match_id)), [frames]);
  const getStatusLabel = (m: Match) => walkoverMatchIds.has(m.id) ? "Walkover" : m.status === "bye" ? "Locked" : m.status.replace("_", " ");
  const fixtureRowsByRound = useMemo(() => {
    if (!competition) return [] as Array<{ roundNo: number; title: string; bestOf: number; rows: FixtureRow[] }>;
    const roundCount = Math.max(1, totalBracketRounds);
    const out: Array<{ roundNo: number; title: string; bestOf: number; rows: FixtureRow[] }> = [];
    for (let roundNo = 1; roundNo <= roundCount; roundNo += 1) {
      const count = Math.max(1, Math.floor(round1MatchCount / Math.pow(2, roundNo - 1)));
      const bestOf = getRoundBestOf(roundNo, roundCount, competition.best_of);
      const rows: FixtureRow[] = [];
      for (let matchNo = 1; matchNo <= count; matchNo += 1) {
        const live = matchesByKey.get(`${roundNo}-${matchNo}`);
        const displayMatchNo = getDisplayMatchNo(roundNo, matchNo);
        if (live) {
          rows.push({
            id: live.id,
            roundNo,
            matchNo,
            bestOf: live.best_of,
            label: getMatchLabel(live),
            status: getStatusLabel(live),
            isPlaceholder: false,
            displayMatchNo,
          });
        } else if (roundNo > 1) {
          const leftDisplay = getDisplayMatchNo(roundNo - 1, (matchNo * 2) - 1);
          const rightDisplay = getDisplayMatchNo(roundNo - 1, matchNo * 2);
          rows.push({
            id: null,
            roundNo,
            matchNo,
            bestOf,
            label: `Winner of Match ${leftDisplay} vs Winner of Match ${rightDisplay}`,
            status: "Pending",
            isPlaceholder: true,
            displayMatchNo,
          });
        } else {
          rows.push({
            id: null,
            roundNo,
            matchNo,
            bestOf,
            label: "TBC vs TBC",
            status: "Pending",
            isPlaceholder: true,
            displayMatchNo,
          });
        }
      }
      out.push({
        roundNo,
        title: getRoundLabel(roundNo, roundCount),
        bestOf,
        rows,
      });
    }
    return out;
  }, [competition, totalBracketRounds, round1MatchCount, matchesByKey, walkoverMatchIds, rosterByLead, shortMap]);

  const deadlineByRound = new Map(deadlines.map(({ round_no, deadline_at }) => [round_no, deadline_at]));
  const leagueDateFormat = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London",
  });
  const playableMatches = matches.filter((match) => {
    if (match.status !== "pending" && match.status !== "in_progress") return false;
    const { home, away } = knockoutMatchSides(match);
    return home.length > 0 && away.length > 0;
  });
  const currentRound = playableMatches[0]?.round_no ?? 1;
  const myMatch = myPlayerId ? playableMatches.find((match) => {
    const { home, away } = knockoutMatchSides(match);
    return [home, away].some((side) => (side.length > 1 ? rosterByLead.get(side[0]) ?? side : side).includes(myPlayerId));
  }) : null;
  const myRound = myMatch?.round_no ?? 1;
  const overdueMatches = playableMatches.filter((match) => {
    const deadline = deadlineByRound.get(match.round_no ?? 1);
    return deadline && new Date(deadline).getTime() < Date.now();
  });
  const semiRound = totalBracketRounds - 1;
  const semiDeadline = deadlineByRound.get(semiRound);
  const semiMatches = matches.filter((match) => match.round_no === semiRound);
  const semiFinalsComplete = finalReady || (semiMatches.length === 2 && semiMatches.every(({ status }) => status === "complete" || status === "bye"));
  const scheduleNotice = semiRound > 0 && !semiFinalsComplete
    ? semiFinalScheduleWarning(lastLeagueDate, semiDeadline) : null;

  const leagueTable = useMemo(() => {
    if (!competition || competition.competition_format !== "league") return [];
    const isWalkoverMatch = (m: Match) => {
      const rows = frames.filter((f) => f.match_id === m.id);
      return rows.length > 0 && rows.every((f) => f.is_walkover_award);
    };
    const map = new Map<string, { id: string; label: string; played: number; won: number; lost: number; framesFor: number; framesAgainst: number; points: number }>();
    for (const m of matches) {
      if (m.status !== "complete") continue;
      if (isWalkoverMatch(m)) continue;
      if ((competition.match_mode ?? "singles") === "doubles") {
        if (!m.team1_player1_id || !m.team1_player2_id || !m.team2_player1_id || !m.team2_player2_id) continue;
        const teamA = `${m.team1_player1_id}|${m.team1_player2_id}`;
        const teamB = `${m.team2_player1_id}|${m.team2_player2_id}`;
        const teamALabel = `${fullMap.get(m.team1_player1_id) ?? "TBC"} & ${fullMap.get(m.team1_player2_id) ?? "TBC"}`;
        const teamBLabel = `${fullMap.get(m.team2_player1_id) ?? "TBC"} & ${fullMap.get(m.team2_player2_id) ?? "TBC"}`;
        if (!map.has(teamA)) map.set(teamA, { id: teamA, label: teamALabel, played: 0, won: 0, lost: 0, framesFor: 0, framesAgainst: 0, points: 0 });
        if (!map.has(teamB)) map.set(teamB, { id: teamB, label: teamBLabel, played: 0, won: 0, lost: 0, framesFor: 0, framesAgainst: 0, points: 0 });
        const a = map.get(teamA)!;
        const b = map.get(teamB)!;
        a.played += 1;
        b.played += 1;
        const winnerIsTeam1 = m.winner_player_id === m.team1_player1_id || m.winner_player_id === m.team1_player2_id;
        const winnerIsTeam2 = m.winner_player_id === m.team2_player1_id || m.winner_player_id === m.team2_player2_id;
        if (winnerIsTeam1) {
          a.won += 1;
          b.lost += 1;
          a.points += 2;
        } else if (winnerIsTeam2) {
          b.won += 1;
          a.lost += 1;
          b.points += 2;
        }
        const ff = frames.filter((f) => f.match_id === m.id && !f.is_walkover_award);
        for (const f of ff) {
          const frameTeam1 = f.winner_player_id === m.team1_player1_id || f.winner_player_id === m.team1_player2_id;
          const frameTeam2 = f.winner_player_id === m.team2_player1_id || f.winner_player_id === m.team2_player2_id;
          if (frameTeam1) {
            a.framesFor += 1;
            b.framesAgainst += 1;
          } else if (frameTeam2) {
            b.framesFor += 1;
            a.framesAgainst += 1;
          }
        }
      } else {
        if (!m.player1_id || !m.player2_id) continue;
        const p1 = m.player1_id;
        const p2 = m.player2_id;
        if (!map.has(p1)) map.set(p1, { id: p1, label: fullMap.get(p1) ?? "TBC", played: 0, won: 0, lost: 0, framesFor: 0, framesAgainst: 0, points: 0 });
        if (!map.has(p2)) map.set(p2, { id: p2, label: fullMap.get(p2) ?? "TBC", played: 0, won: 0, lost: 0, framesFor: 0, framesAgainst: 0, points: 0 });
        const a = map.get(p1)!;
        const b = map.get(p2)!;
        a.played += 1;
        b.played += 1;
        if (m.winner_player_id === p1) {
          a.won += 1;
          b.lost += 1;
          a.points += 2;
        } else if (m.winner_player_id === p2) {
          b.won += 1;
          a.lost += 1;
          b.points += 2;
        }
        const ff = frames.filter((f) => f.match_id === m.id && !f.is_walkover_award);
        for (const f of ff) {
          if (f.winner_player_id === p1) {
            a.framesFor += 1;
            b.framesAgainst += 1;
          } else if (f.winner_player_id === p2) {
            b.framesFor += 1;
            a.framesAgainst += 1;
          }
        }
      }
    }
    return [...map.values()].sort((a, b) => b.points - a.points || (b.framesFor - b.framesAgainst) - (a.framesFor - a.framesAgainst) || a.label.localeCompare(b.label));
  }, [competition, matches, frames, fullMap]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="Competition"
            eyebrow="Event"
            subtitle="Fixtures, bracket, and live status."
          />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          {competition ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-3xl font-semibold text-slate-900">{competition.name}</h2>
                <p className="mt-1 text-slate-700">Venue: {competition.venue || "-"}</p>
                <p className="mt-1 text-slate-700">Format: {competition.competition_format}</p>
                <p className="mt-1 text-slate-700">
                  {competitionEntryFormat(competition).sport} · {competitionEntryFormat(competition).mode}
                </p>
                <p className="mt-1 text-slate-700">
                  {specialCompetitionScoring(competition.name) ?? `Best of ${competition.best_of} frames`}
                </p>
                {officerStatus ? (
                  <aside className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
                    <a href={officerStatus.target} className="font-semibold underline underline-offset-4">{officerStatus.label}</a>
                    {officerStatus.detail ? <p className="mt-1">{officerStatus.detail}</p> : null}
                  </aside>
                ) : null}
              </section>
              <section id="competition-entries" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-semibold text-slate-900">Competition Entries</p>
                  <Link href="/signups" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    View competition entries
                  </Link>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {!officerStatus ? `Entries ${entriesOpen ? "open" : "closed"} · ` : ""}
                  {approvedEntries.length} approved · {pendingEntries.length} awaiting approval
                  {competition.max_entries ? ` / Max ${competition.max_entries}` : ""}
                </p>
                {usesFixedCompetitionHandicaps(competition.name) ? (
                  <p className="mt-2 text-sm font-medium text-teal-900">Handicaps are fixed when entries close. Division One players use their Elo-suggested handicap plus 8 points. Premier players use their published handicap.</p>
                ) : null}
                {competition.signup_deadline ? (
                  <p className="mt-1 text-sm text-slate-600">Deadline: {competitionDeadlineLabel(competition.signup_deadline)} (UK time)</p>
                ) : null}
                {competition.final_scheduled_at ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Final: {new Date(competition.final_scheduled_at).toLocaleString()}
                    {competition.final_venue_location_id
                      ? ` · ${locations.find((l) => l.id === competition.final_venue_location_id)?.name ?? "Venue selected"}`
                      : ""}
                  </p>
                ) : null}
                {isSuperManager ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => void updateSignupSettings({ signup_open: !competition.signup_open })}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      {competition.signup_open ? "Close Sign-ups" : "Open Sign-ups"}
                    </button>
                    <input
                      type="datetime-local"
                      value={signupDeadlineInput}
                      onChange={(e) => setSignupDeadlineInput(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Max entries (optional)"
                      value={signupMaxEntriesInput}
                      onChange={(e) => setSignupMaxEntriesInput(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void updateSignupSettings({
                          signup_deadline: signupDeadlineInput ? new Date(signupDeadlineInput).toISOString() : null,
                          max_entries: signupMaxEntriesInput ? Number.parseInt(signupMaxEntriesInput, 10) : null,
                        })
                      }
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                    >
                      Save Sign-up Settings
                    </button>
                  </div>
                ) : null}
                {isSuperManager ? (
                  <details id="final-scheduling" open={finalReady} className="mt-3 scroll-mt-28 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-900">Final scheduling (League Officers)</summary>
                    <p className="mt-2 text-xs text-slate-600">{mickWhite ? "Set the neutral venue here, then save the agreed date on the final tie." : "Set final date and neutral venue after semi-finals are complete."}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!mickWhite ? <input
                        type="datetime-local"
                        value={finalDateInput}
                        onChange={(e) => setFinalDateInput(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      /> : null}
                      <select
                        value={finalVenueInput}
                        onChange={(e) => setFinalVenueInput(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
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
                        onClick={() =>
                          void updateSignupSettings({
                            ...(mickWhite ? {} : { final_scheduled_at: finalDateInput ? new Date(finalDateInput).toISOString() : null }),
                            final_venue_location_id: finalVenueInput || null,
                          })
                        }
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        Save final details
                      </button>
                    </div>
                  </details>
                ) : null}
                {!mickWhite && isSuperManager && entriesLoaded && (competition.competition_format !== "knockout" || !matches.length) ? (
                  <CompetitionOfficerEntry key={`entry-${id}`} competition={competition} players={players.filter((player) => !player.is_archived)} locations={locations}
                    usedPlayerIds={new Set([...pendingEntries, ...approvedEntries].flatMap(entryRoster))}
                    onAdd={(playerIds, dateOfBirth) => manageCompetition({ action: "add_entry", playerIds, dateOfBirth })} />
                ) : null}
                {isSuperManager && entriesLoaded && competition.competition_format === "knockout" && matches.length > 0 ? (
                  <p id="manual-entry" className="mt-3 scroll-mt-28 text-sm text-slate-700">
                    <span id="official-draw">The draw has been published. See the fixture list below.</span>
                  </p>
                ) : null}
                {isSuperManager && entriesLoaded && competition.competition_format === "knockout" && !mickWhite && !matches.length ? (
                  <CompetitionOfficialDraw key={`draw-${id}`} competition={competition} entries={approvedEntries} pendingCount={pendingEntries.length}
                    entryLabel={entryLabel} deadlines={deadlines}
                    onPublish={(entryIds) => manageCompetition({ action: "publish_draw", entryIds })} />
                ) : null}
                {entries.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {entries.filter((entry) => isSuperManager || entry.status !== "withdrawn").map((entry) => (
                      <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-sm text-slate-800">
                          {entryLabel(entry)}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${entryStatusClass(entry.status)}`}>{entry.status}</span>
                          {isSuperManager && entry.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void reviewEntry(entry.id, "approved")}
                                className="rounded-lg bg-emerald-700 px-2 py-1 text-xs text-white"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => void reviewEntry(entry.id, "rejected")}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {isSuperManager && competition.competition_format === "knockout" && ["approved", "pending", "withdrawn"].includes(entry.status) ? (
                            <CompetitionEntryWithdrawal entryId={entry.id} withdrawn={entry.status === "withdrawn"}
                              label={entryLabel(entry)}
                              mayAwardWalkover={matches.some((match) => (match.status === "pending" || match.status === "in_progress") &&
                                [match.player1_id, match.player2_id, match.team1_player1_id, match.team1_player2_id, match.team2_player1_id, match.team2_player2_id].includes(entry.player_id))}
                              onDone={(message) => { setMessage(message); setWithdrawalRevision((revision) => revision + 1); }} />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No entries yet.</p>
                )}
              </section>
              {competition.competition_format === "league" ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-xl font-semibold text-slate-900">League table</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="text-slate-700">
                          <th className="py-2 pr-4">{(competition.match_mode ?? "singles") === "doubles" ? "Team" : "Player"}</th>
                          <th className="py-2 pr-4">P</th>
                          <th className="py-2 pr-4">W</th>
                          <th className="py-2 pr-4">L</th>
                          <th className="py-2 pr-4">F</th>
                          <th className="py-2 pr-4">A</th>
                          <th className="py-2 pr-4">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leagueTable.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="py-2 pr-4 font-medium text-slate-900">{row.label}</td>
                            <td className="py-2 pr-4">{row.played}</td>
                            <td className="py-2 pr-4">{row.won}</td>
                            <td className="py-2 pr-4">{row.lost}</td>
                            <td className="py-2 pr-4">{row.framesFor}</td>
                            <td className="py-2 pr-4">{row.framesAgainst}</td>
                            <td className="py-2 pr-4">{row.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!leagueTable.length ? <p className="text-slate-600">No league results yet.</p> : null}
                  </div>
                </section>
              ) : null}
              {mickWhite ? (
                <MickWhiteFixtures key={id} competitionId={id} canManage={isSuperManager} entriesOpen={entriesOpen}
                  entryRevision={approvedEntries.map(({ id }) => id).join(",")} pendingCount={pendingEntries.length}
                  finalVenueId={competition.final_venue_location_id ?? null} />
              ) : !fixturesReady || !matches.length ? (
                <section id="competition-fixtures" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-900">
                    {!fixturesReady ? (fixtureLoad?.competitionId === id && fixtureLoad.failed ? "Fixtures could not be loaded" : "Loading fixtures…")
                      : knockout ? "Awaiting official draw" : "No fixtures yet"}
                  </h3>
                  {fixturesReady && knockout ? <p className="mt-1 text-sm text-slate-600">Fixtures will appear once the league publishes the draw.</p> : null}
                </section>
              ) : (
              <section id="competition-fixtures" className="scroll-mt-28 space-y-2">
                {knockout && playableMatches.length ? (
                  <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
                    <h3 className="text-lg font-bold text-teal-950">{myMatch ? "My competition match" : "Current round"}</h3>
                    <p className="mt-1 text-sm font-semibold text-teal-950">{getRoundLabel(myMatch ? myRound : currentRound, totalBracketRounds)}</p>
                    {myMatch ? <p className="mt-1 text-sm text-slate-800">{getMatchLabel(myMatch)}</p> : null}
                    {deadlineByRound.get(myMatch ? myRound : currentRound) ? (
                      <p className="mt-1 text-sm text-slate-700">Play by {leagueDateFormat.format(new Date(deadlineByRound.get(myMatch ? myRound : currentRound)!))}</p>
                    ) : <p className="mt-1 text-sm text-slate-700">Play-by date to be confirmed</p>}
                    {myMatch ? (
                      <Link href={`/matches/${myMatch.id}`} className="mt-3 inline-flex rounded-xl bg-teal-800 px-4 py-2 text-sm font-bold text-white">Submit result</Link>
                    ) : null}
                  </section>
                ) : null}
                {knockout && isSuperManager && (overdueMatches.length || scheduleNotice) ? (
                  <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <h3 className="font-bold">Schedule watch</h3>
                    {scheduleNotice ? <p className="mt-1 text-sm">{scheduleNotice} Last league fixture: {leagueDateFormat.format(new Date(lastLeagueDate!))}.</p> : null}
                    {overdueMatches.length ? (
                      <ul className="mt-2 space-y-1 text-sm">
                        {overdueMatches.map((match) => <li key={match.id}><Link className="font-semibold underline" href={`/matches/${match.id}`}>{getMatchLabel(match)}</Link> · Overdue</li>)}
                      </ul>
                    ) : null}
                  </section>
                ) : null}
                {!isSuperManager ? (
                  <p className="text-xs text-slate-600">One player from the winning side submits each result for officer approval. <Link className="font-semibold underline" href="/competition-scorecard">Share the public results form</Link></p>
                ) : null}
                <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setView("fixtures")}
                    className={`rounded-md px-3 py-1 text-sm ${view === "fixtures" ? "bg-teal-600 text-white" : "text-slate-700"}`}
                  >
                    Fixture List
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("bracket")}
                    className={`rounded-md px-3 py-1 text-sm ${view === "bracket" ? "bg-teal-600 text-white" : "text-slate-700"}`}
                  >
                    Bracket
                  </button>
                </div>

                {view === "fixtures" ? (
                  <div className="space-y-2">
                    {fixtureRowsByRound.map((round) => (
                      <div key={`fixtures-round-${round.roundNo}`} className="space-y-2">
                        <div className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2">
                          <p className="text-sm font-semibold text-teal-900">
                            {round.title} · {specialCompetitionScoring(competition.name, round.roundNo >= totalBracketRounds - 1 ? "late" : "early") ?? `Best of ${round.bestOf} frames`}
                          </p>
                        </div>
                        {round.rows.map((m) => (
                          <article key={`${round.roundNo}-${m.matchNo}-${m.id ?? "placeholder"}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm text-slate-600">
                              Round {m.roundNo} · Match {m.displayMatchNo}{deadlineByRound.get(m.roundNo) && !m.isPlaceholder ? ` · Play by ${leagueDateFormat.format(new Date(deadlineByRound.get(m.roundNo)!))}` : ""}
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-slate-900">{m.label}</p>
                            <p className="mt-1 text-slate-700">Status: {m.status}</p>
                            <p className="mt-1">
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${fixtureStatusClass(m.status)}`}>{m.status}</span>
                            </p>
                            {m.id ? (
                              <Link href={`/matches/${m.id}`} className="mt-2 inline-block text-sm font-medium text-teal-700 underline">
                                {m.status === "complete" || m.status === "Walkover" ? "View result" : isSuperManager ? "Open match" : "Submit result"}
                              </Link>
                            ) : (
                              <p className="mt-2 text-sm text-slate-500">Match will auto-create when feeder results are ready.</p>
                            )}
                          </article>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex min-w-max gap-6 py-2">
                      {bracketRounds.map((round, roundIndex) => (
                        <div key={roundIndex} className="w-72 shrink-0">
                          <h3 className="mb-2 h-5 text-sm font-medium text-slate-600">
                            {getRoundLabel(roundIndex + 1, totalBracketRounds)}
                          </h3>
                          <div
                            className="relative"
                            style={{ height: `${Math.max(1, bracketRounds[0]?.length ?? 1) * BRACKET_STEP}px` }}
                          >
                            {round.map((node) => {
                              const block = Math.pow(2, roundIndex);
                              const centerY = ((node.matchNo - 0.5) * block * BRACKET_STEP);
                              const top = centerY - (BRACKET_CARD_HEIGHT / 2);
                              return (
                                <div key={`${node.roundNo}-${node.matchNo}`} className="absolute left-0 right-0" style={{ top: `${top}px` }}>
                                  <article className="h-28 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-xs text-slate-600">
                                      Match {getDisplayMatchNo(node.roundNo, node.matchNo)}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">{node.p1} vs {node.p2}</p>
                                    <p className="mt-1 text-xs text-slate-700">
                                      {specialCompetitionScoring(competition.name, node.roundNo >= totalBracketRounds - 1 ? "late" : "early") ?? `Best of ${node.bestOf} frames`}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-700">
                                      Status: {node.status === "bye" ? "Locked" : node.status === "tbc" ? "TBC" : node.status.replace("_", " ")}
                                    </p>
                                  </article>
                                  {roundIndex < bracketRounds.length - 1 ? (
                                    <div className="pointer-events-none absolute -right-6 top-1/2 h-px w-6 -translate-y-1/2 bg-amber-300" />
                                  ) : null}
                                </div>
                              );
                            })}
                            {roundIndex < bracketRounds.length - 1
                              ? Array.from({ length: Math.floor(round.length / 2) }, (_, pairIdx) => {
                                  const a = (pairIdx * 2) + 1;
                                  const b = a + 1;
                                  const block = Math.pow(2, roundIndex);
                                  const centerA = ((a - 0.5) * block * BRACKET_STEP);
                                  const centerB = ((b - 0.5) * block * BRACKET_STEP);
                                  return (
                                    <div
                                      key={`join-${roundIndex}-${pairIdx}`}
                                      className="pointer-events-none absolute -right-6 w-px bg-amber-300"
                                      style={{ top: `${centerA}px`, height: `${centerB - centerA}px` }}
                                    />
                                  );
                                })
                              : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              )}
            </>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}

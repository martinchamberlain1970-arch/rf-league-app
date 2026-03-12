"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import MessageModal from "@/components/MessageModal";

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
type Player = { id: string; display_name: string; full_name: string | null };
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
const isHodgeCompetitionName = (name: string) =>
  name === "Hodge Cup (Triples)" || name.startsWith("Hodge Cup (Triples) - ");
const isHamiltonCompetitionName = (name: string) =>
  name === "Hamilton Cup (Singles Billiards)" ||
  name.startsWith("Hamilton Cup (Singles Billiards) - ") ||
  name === "Hamilton Cup (Billiards Singles)" ||
  name.startsWith("Hamilton Cup (Billiards Singles) - ");
const isAlberyCompetitionName = (name: string) =>
  name === "Albery Cup (Billiards 3-Man Team)" || name.startsWith("Albery Cup (Billiards 3-Man Team) - ");
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
  const [players, setPlayers] = useState<Player[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [signupDeadlineInput, setSignupDeadlineInput] = useState("");
  const [signupMaxEntriesInput, setSignupMaxEntriesInput] = useState("");
  const [finalDateInput, setFinalDateInput] = useState("");
  const [finalVenueInput, setFinalVenueInput] = useState("");
  const [locations, setLocations] = useState<VenueLocation[]>([]);
  const [offlinePlayerId, setOfflinePlayerId] = useState("");
  const [offlineExtraNames, setOfflineExtraNames] = useState("");
  const [view, setView] = useState<View>("fixtures");
  const [message, setMessage] = useState<string | null>(null);
  const isSuperManager = admin.isSuper;

  const updateSignupSettings = async (patch: Partial<Competition>) => {
    const client = supabase;
    if (!client || !competition) return;
    if (!isSuperManager) {
      setMessage("Only Super User can manage sign-up settings.");
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
      setMessage("Only Super User can approve or reject entries.");
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

  const addOfflineEntry = async () => {
    const client = supabase;
    if (!client || !competition || !admin.userId) return;
    if (!isSuperManager) {
      setMessage("Only Super User can add offline entries.");
      return;
    }
    const pid = offlinePlayerId.trim();
    if (!pid) {
      setMessage("Select a player to add an offline entry.");
      return;
    }
    const existing = entries.find((e) => e.player_id === pid && (e.status === "pending" || e.status === "approved"));
    if (existing) {
      setMessage("This player already has an active entry.");
      return;
    }
    const extraNames = offlineExtraNames
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const note =
      extraNames.length > 0
        ? JSON.stringify({
            source: "offline_superuser_entry",
            teamMemberNames: extraNames,
          })
        : "offline_superuser_entry";
    const ins = await client.from("competition_entries").insert({
      competition_id: competition.id,
      requester_user_id: admin.userId,
      player_id: pid,
      status: "approved",
      reviewed_by_user_id: admin.userId,
      reviewed_at: new Date().toISOString(),
      note,
    });
    if (ins.error) {
      setMessage(ins.error.message);
      return;
    }
    setOfflinePlayerId("");
    setOfflineExtraNames("");
    const entryRes = await client
      .from("competition_entries")
      .select("id,competition_id,requester_user_id,player_id,status,created_at,note")
      .eq("competition_id", competition.id)
      .neq("status", "withdrawn")
      .order("created_at", { ascending: false });
    if (!entryRes.error && entryRes.data) setEntries(entryRes.data as Entry[]);
  };

  const generateRoundOneDraw = async () => {
    const client = supabase;
    if (!client || !competition) return;
    if (!isSuperManager) {
      setMessage("Only Super User can generate the draw.");
      return;
    }
    if (competition.competition_format !== "knockout") {
      setMessage("Draw generation is for knockout competitions only.");
      return;
    }
    if ((competition.match_mode ?? "singles") !== "singles") {
      setMessage("Auto-draw currently supports singles only. Doubles/triples draw will follow.");
      return;
    }
    const existingRound1 = matches.filter((m) => (m.round_no ?? 1) === 1);
    if (existingRound1.length > 0) {
      setMessage("Round 1 matches already exist. Delete/reset them first if you want to regenerate.");
      return;
    }
    const approved = entries.filter((e) => e.status === "approved");
    if (approved.length < 2) {
      setMessage("Approve at least 2 entries before generating the draw.");
      return;
    }

    const seeds = [...approved].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let bracketSize = 1;
    while (bracketSize < seeds.length) bracketSize *= 2;

    const baseBestOf = competition.knockout_round_best_of?.round1 ?? competition.best_of;
    const inserts: Array<Record<string, unknown>> = [];
    for (let i = 0; i < bracketSize; i += 2) {
      const p1 = seeds[i]?.player_id ?? null;
      const p2 = seeds[i + 1]?.player_id ?? null;
      const isBye = Boolean(p1 && !p2);
      inserts.push({
        competition_id: competition.id,
        round_no: 1,
        match_no: (i / 2) + 1,
        best_of: baseBestOf,
        status: isBye ? "bye" : "pending",
        match_mode: "singles",
        player1_id: p1,
        player2_id: p2,
        team1_player1_id: null,
        team1_player2_id: null,
        team2_player1_id: null,
        team2_player2_id: null,
        winner_player_id: isBye ? p1 : null,
        opening_break_player_id: competition.app_assign_opening_break && p1 && p2 ? (Math.random() < 0.5 ? p1 : p2) : null,
      });
    }
    const res = await client
      .from("matches")
      .insert(inserts)
      .select("id,round_no,match_no,best_of,status,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,winner_player_id");
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    setMatches((prev) => [...prev, ...((res.data ?? []) as Match[])].sort((a, b) => (a.round_no ?? 1) - (b.round_no ?? 1) || (a.match_no ?? 1) - (b.match_no ?? 1)));
    setMessage("Round 1 draw generated from approved entries.");
  };

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    let active = true;
    const load = async () => {
      const [cRes, mRes, pRes, locRes] = await Promise.all([
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
        client.from("players").select("id,display_name,full_name"),
        client.from("locations").select("id,name").order("name", { ascending: true }),
      ]);
      if (!active) return;
      if (cRes.error || !cRes.data) {
        setMessage(cRes.error?.message ?? "Failed to load competition.");
        return;
      }
      const comp = cRes.data as Competition;
      let loadedMatches = (mRes.data ?? []) as Match[];
      setCompetition(comp);
      const changed = await ensureKnockoutNextRoundMatches(client, comp, loadedMatches);
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
      setMatches(loadedMatches);
      setPlayers((pRes.data ?? []) as Player[]);
      setLocations((locRes.data ?? []) as VenueLocation[]);
      const entryRes = await client
        .from("competition_entries")
        .select("id,competition_id,requester_user_id,player_id,status,created_at,note")
        .eq("competition_id", id)
        .neq("status", "withdrawn")
        .order("created_at", { ascending: false });
      if (entryRes.data) setEntries(entryRes.data as Entry[]);
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
  }, [id]);

  const shortMap = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);
  const fullMap = useMemo(
    () => new Map(players.map((p) => [p.id, p.full_name?.trim() ? p.full_name : p.display_name])),
    [players]
  );
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

  const getRoundBestOf = (roundNo: number, totalRounds: number, fallback: number) => {
    const cfg = competition?.knockout_round_best_of;
    if (!cfg) return fallback;
    if (roundNo >= totalRounds) return cfg.final ?? fallback;
    if (roundNo === totalRounds - 1) return cfg.semi_final ?? fallback;
    return cfg.round1 ?? fallback;
  };

  const getSinglesWinner = (m: Match): string | null => {
    if (!(m.status === "complete" || m.status === "bye")) return null;
    if (m.winner_player_id && (m.winner_player_id === m.player1_id || m.winner_player_id === m.player2_id)) return m.winner_player_id;
    return null;
  };

  const getDoublesWinnerTeam = (m: Match): { p1: string; p2: string } | null => {
    if (!(m.status === "complete" || m.status === "bye") || !m.winner_player_id) return null;
    if (!m.team1_player1_id || !m.team1_player2_id || !m.team2_player1_id || !m.team2_player2_id) return null;
    if (m.winner_player_id === m.team1_player1_id || m.winner_player_id === m.team1_player2_id) {
      return { p1: m.team1_player1_id, p2: m.team1_player2_id };
    }
    if (m.winner_player_id === m.team2_player1_id || m.winner_player_id === m.team2_player2_id) {
      return { p1: m.team2_player1_id, p2: m.team2_player2_id };
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
            best_of: getRoundBestOf(roundNo + 1, totalRounds, comp.best_of),
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
            best_of: getRoundBestOf(roundNo + 1, totalRounds, comp.best_of),
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

        if (!live && roundNo > 1) {
          const prevA = byKey.get(`${roundNo - 1}-${(matchNo * 2) - 1}`);
          const prevB = byKey.get(`${roundNo - 1}-${matchNo * 2}`);
          const prevASide = prevA ? resolveWinnerSide(prevA) : 0;
          const prevBSide = prevB ? resolveWinnerSide(prevB) : 0;
          const prevAWinner = prevA && (prevA.status === "complete" || prevA.status === "bye") && prevASide
            ? (
                prevA.team1_player1_id || prevA.team2_player1_id
                  ? (
                      prevASide === 1
                        ? `${shortMap.get(prevA.team1_player1_id ?? "") ?? "TBC"} & ${shortMap.get(prevA.team1_player2_id ?? "") ?? "TBC"}`
                        : `${shortMap.get(prevA.team2_player1_id ?? "") ?? "TBC"} & ${shortMap.get(prevA.team2_player2_id ?? "") ?? "TBC"}`
                    )
                  : (shortMap.get(prevA.winner_player_id ?? "") ?? "TBC")
              )
            : "TBC";
          const prevBWinner = prevB && (prevB.status === "complete" || prevB.status === "bye") && prevBSide
            ? (
                prevB.team1_player1_id || prevB.team2_player1_id
                  ? (
                      prevBSide === 1
                        ? `${shortMap.get(prevB.team1_player1_id ?? "") ?? "TBC"} & ${shortMap.get(prevB.team1_player2_id ?? "") ?? "TBC"}`
                        : `${shortMap.get(prevB.team2_player1_id ?? "") ?? "TBC"} & ${shortMap.get(prevB.team2_player2_id ?? "") ?? "TBC"}`
                    )
                  : (shortMap.get(prevB.winner_player_id ?? "") ?? "TBC")
              )
            : "TBC";
          p1 = prevAWinner;
          p2 = prevBWinner;
        }

        if (status === "bye" && live?.player1_id && live.player1_id === live.player2_id) {
          p2 = "BYE";
        }
        if (live && (live.team1_player1_id || live.team2_player1_id)) {
          const t1a = shortMap.get(live.team1_player1_id ?? "") ?? "TBC";
          const t1b = shortMap.get(live.team1_player2_id ?? "") ?? "TBC";
          const t2a = shortMap.get(live.team2_player1_id ?? "") ?? "TBC";
          const t2b = shortMap.get(live.team2_player2_id ?? "") ?? "TBC";
          p1 = `${t1a} & ${t1b}`;
          p2 = `${t2a} & ${t2b}`;
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
  }, [competition, matches, shortMap, round1MatchCount]);
  const totalBracketRounds = bracketRounds.length;
  const matchesByKey = useMemo(() => {
    const m = new Map<string, Match>();
    for (const match of matches) m.set(`${match.round_no ?? 1}-${match.match_no ?? 1}`, match);
    return m;
  }, [matches]);

  const getMatchLabel = (m: Match) => {
    if (m.team1_player1_id || m.team1_player2_id || m.team2_player1_id || m.team2_player2_id) {
      const t1a = shortMap.get(m.team1_player1_id ?? "") ?? "TBC";
      const t1b = shortMap.get(m.team1_player2_id ?? "") ?? "TBC";
      const t2a = shortMap.get(m.team2_player1_id ?? "") ?? "TBC";
      const t2b = shortMap.get(m.team2_player2_id ?? "") ?? "TBC";
      return `${t1a} & ${t1b} vs ${t2a} & ${t2b}`;
    }
    if (m.status === "bye" && m.player1_id && m.player1_id === m.player2_id) {
      return `${shortMap.get(m.player1_id) ?? "TBC"} vs BYE`;
    }
    return `${shortMap.get(m.player1_id ?? "") ?? "TBC"} vs ${shortMap.get(m.player2_id ?? "") ?? "TBC"}`;
  };

  const getStatusLabel = (m: Match) => (m.status === "bye" ? "Locked" : m.status.replace("_", " "));
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
  }, [competition, totalBracketRounds, round1MatchCount, matchesByKey]);

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
                  {isHodgeCompetitionName(competition.name)
                    ? "Triples · First to 5 points (9-point format)"
                    : isHamiltonCompetitionName(competition.name)
                      ? "Billiards Singles · 200 up + handicap (SF/Final 400 up + handicap x2)"
                      : isAlberyCompetitionName(competition.name)
                        ? "Billiards 3-man team · race to 300 (legs to 100 / 200 / 300)"
                        : `Best of ${competition.best_of}`}
                </p>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-semibold text-slate-900">Competition Sign-ups</p>
                  <Link href="/signups" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    Open Sign-up Page
                  </Link>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Status: {competition.signup_open ? "Open" : "Closed"} · Pending {pendingEntries.length} · Approved {approvedEntries.length}
                  {competition.max_entries ? ` / Max ${competition.max_entries}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${competition.signup_open ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-700"}`}>
                    Entries {competition.signup_open ? "open" : "closed"}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${competition.final_scheduled_at && competition.final_venue_location_id ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {competition.final_scheduled_at && competition.final_venue_location_id ? "Final set" : "Final pending"}
                  </span>
                </div>
                {competition.signup_deadline ? (
                  <p className="mt-1 text-sm text-slate-600">Deadline: {new Date(competition.signup_deadline).toLocaleString()}</p>
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
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Final scheduling (Super User)</p>
                    <p className="text-xs text-slate-600">Set final date and neutral venue after semi-finals are complete.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        value={finalDateInput}
                        onChange={(e) => setFinalDateInput(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
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
                            final_scheduled_at: finalDateInput ? new Date(finalDateInput).toISOString() : null,
                            final_venue_location_id: finalVenueInput || null,
                          })
                        }
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        Save final details
                      </button>
                    </div>
                  </div>
                ) : null}
                {isSuperManager && competition.competition_format === "knockout" ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void generateRoundOneDraw()}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
                    >
                      Generate Round 1 Draw (from approved entries)
                    </button>
                  </div>
                ) : null}
                {entries.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {entries.map((entry) => (
                      <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-sm text-slate-800">
                          {fullMap.get(entry.player_id) ?? shortMap.get(entry.player_id) ?? "Unknown player"}
                          {(() => {
                            if (!entry.note) return null;
                            try {
                              const parsed = JSON.parse(entry.note) as { teamMemberNames?: string[] };
                              if (!Array.isArray(parsed.teamMemberNames) || parsed.teamMemberNames.length === 0) return null;
                              return ` + ${parsed.teamMemberNames.join(" + ")}`;
                            } catch {
                              return null;
                            }
                          })()}
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
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No entries yet.</p>
                )}
                {isSuperManager ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Add Offline Entry (Super User)</p>
                    <p className="text-xs text-slate-600">
                      Use this for WhatsApp, email, or paper entries from players not registered online.
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        value={offlinePlayerId}
                        onChange={(e) => setOfflinePlayerId(e.target.value)}
                      >
                        <option value="">Select player</option>
                        {players
                          .slice()
                          .sort((a, b) => (a.full_name?.trim() || a.display_name).localeCompare(b.full_name?.trim() || b.display_name))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name?.trim() || p.display_name}
                            </option>
                          ))}
                      </select>
                      <input
                        value={offlineExtraNames}
                        onChange={(e) => setOfflineExtraNames(e.target.value)}
                        placeholder="Extra names (comma separated)"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => void addOfflineEntry()}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        Add approved entry
                      </button>
                    </div>
                  </div>
                ) : null}
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
              <section className="space-y-2">
                {!isSuperManager ? (
                  <p className="text-xs text-slate-600">Any player entered in this competition can submit the final score, regardless of draw side.</p>
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
                            {round.title} · {isHodgeCompetitionName(competition.name) ? "First to 5 points (9-point format)" : `Best of ${round.bestOf} frames`}
                          </p>
                        </div>
                        {round.rows.map((m) => (
                          <article key={`${round.roundNo}-${m.matchNo}-${m.id ?? "placeholder"}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm text-slate-600">
                              Round {m.roundNo} · Match {m.displayMatchNo}
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-slate-900">{m.label}</p>
                            <p className="mt-1 text-slate-700">Status: {m.status}</p>
                            <p className="mt-1">
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${fixtureStatusClass(m.status)}`}>{m.status}</span>
                            </p>
                            {m.id ? (
                              <Link href={`/matches/${m.id}`} className="mt-2 inline-block text-sm font-medium text-teal-700 underline">
                                {m.status === "complete" ? "View submitted result" : isSuperManager ? "Open match" : "Submit result"}
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
                                      {isHodgeCompetitionName(competition.name) ? "First to 5 points (9-point format)" : `Best of ${node.bestOf}`}
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
            </>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}

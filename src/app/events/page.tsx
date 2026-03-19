"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import ScreenHeader from "@/components/ScreenHeader";
import { logAudit } from "@/lib/audit";
import ConfirmModal from "@/components/ConfirmModal";
import InfoModal from "@/components/InfoModal";
import MessageModal from "@/components/MessageModal";

type Competition = {
  id: string;
  name: string;
  sport_type: "snooker";
  competition_format: "knockout" | "league";
  match_mode: "singles" | "doubles";
  best_of: number;
  is_practice: boolean;
  is_archived: boolean;
  is_completed: boolean;
  created_at: string;
};

type MatchRow = {
  competition_id: string;
  status: "pending" | "in_progress" | "complete" | "bye";
  updated_at: string;
  is_archived?: boolean | null;
};

type LeagueTeamMember = {
  season_id: string;
  team_id: string;
  player_id: string;
};
type LeagueFramePerf = {
  fixture_id: string;
  slot_no: number | null;
  slot_type: "singles" | "doubles" | null;
  winner_side: "home" | "away" | null;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_forfeit?: boolean | null;
  away_forfeit?: boolean | null;
};
type LeaguePlayer = {
  id: string;
  display_name: string;
  full_name: string | null;
  rating_snooker: number | null;
  snooker_handicap: number | null;
};

type LeagueFixture = {
  id: string;
  season_id: string;
  week_no: number | null;
  fixture_date: string | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
  home_points: number | null;
  away_points: number | null;
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
type LeagueReportInsert = {
  report_type: "match" | "weekly";
  season_id: string;
  week_no: number | null;
  fixture_id: string | null;
  target_team_id: string;
  title: string;
  body: string;
};

type LeagueTeam = {
  id: string;
  name: string;
};
type UserCompetitionMatch = {
  matchId: string;
  competitionName: string;
  status: "pending" | "in_progress" | "complete" | "bye";
  roundNo: number | null;
  matchNo: number | null;
  opponentLabel: string;
};

type LeagueFixtureSummary = {
  key: string;
  label: string;
  seasonName: string;
  lastFixture: LeagueFixture | null;
  nextFixture: LeagueFixture | null;
  followingFixture: LeagueFixture | null;
};

type Tab = "open" | "completed" | "archived";
type PredictionStyle = "balanced" | "form" | "handicap";
const PREDICTION_STYLE_KEY = "rf_prediction_style";

function tabFromUrl(): Tab {
  if (typeof window === "undefined") return "open";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "completed" || t === "archived" ? t : "open";
}

const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const formatFixtureReschedule = (request?: FixtureChangeRequest | null) => {
  if (!request || request.status !== "rescheduled" || !request.original_fixture_date || !request.agreed_fixture_date) return null;
  const movedEarlier = request.agreed_fixture_date < request.original_fixture_date;
  return {
    chip: movedEarlier ? "Brought forward" : "Rescheduled",
    detail: `Originally ${new Date(`${request.original_fixture_date}T12:00:00`).toLocaleDateString("en-GB")} · now ${new Date(`${request.agreed_fixture_date}T12:00:00`).toLocaleDateString("en-GB")}`,
  };
};

export default function EventsPage() {
  const admin = useAdminStatus();
  const [rows, setRows] = useState<Competition[]>([]);
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [leagueMode, setLeagueMode] = useState(false);
  const [teamLabel, setTeamLabel] = useState<string | null>(null);
  const [lastFixture, setLastFixture] = useState<LeagueFixture | null>(null);
  const [fixtureChangeRequests, setFixtureChangeRequests] = useState<FixtureChangeRequest[]>([]);
  const [nextFixture, setNextFixture] = useState<LeagueFixture | null>(null);
  const [followingFixture, setFollowingFixture] = useState<LeagueFixture | null>(null);
  const [leagueSummaries, setLeagueSummaries] = useState<LeagueFixtureSummary[]>([]);
  const [seasonFixtures, setSeasonFixtures] = useState<LeagueFixture[]>([]);
  const [seasonMembers, setSeasonMembers] = useState<LeagueTeamMember[]>([]);
  const [seasonFrames, setSeasonFrames] = useState<LeagueFramePerf[]>([]);
  const [seasonPlayers, setSeasonPlayers] = useState<LeaguePlayer[]>([]);
  const [teamById, setTeamById] = useState<Map<string, string>>(new Map());
  const [userCompetitionMatches, setUserCompetitionMatches] = useState<UserCompetitionMatch[]>([]);
  const [predictionFixture, setPredictionFixture] = useState<LeagueFixture | null>(null);
  const [predictionStyle, setPredictionStyle] = useState<PredictionStyle>("balanced");
  const [reportFixture, setReportFixture] = useState<LeagueFixture | null>(null);
  const [roundupWeek, setRoundupWeek] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [infoModal, setInfoModal] = useState<{ title: string; description: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    tone?: "default" | "danger";
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const cardBaseClass = "rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm";
  const pillBaseClass = "rounded-full border px-3 py-1 text-sm transition";
  const pillActiveClass = `${pillBaseClass} border-teal-700 bg-teal-700 text-white`;
  const pillInactiveClass = `${pillBaseClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
  const buttonPrimaryClass = "rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800";
  const actionSecondaryClass = "inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-50";
  const actionDangerClass = "inline-flex items-center rounded-xl border border-rose-300 bg-white px-3 py-1 text-sm font-medium text-rose-700 transition hover:bg-rose-50";
  const actionSuccessClass = "inline-flex items-center rounded-xl border border-emerald-300 bg-white px-3 py-1 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50";

  useEffect(() => {
    setTab(tabFromUrl());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(PREDICTION_STYLE_KEY);
    if (raw === "balanced" || raw === "form" || raw === "handicap") setPredictionStyle(raw);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREDICTION_STYLE_KEY, predictionStyle);
  }, [predictionStyle]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      setMessage("Supabase is not configured.");
      return;
    }
    let active = true;
    const load = async () => {
      const isMissingTable = (msg: string | undefined) =>
        (msg ?? "").toLowerCase().includes("could not find the table");
      const loadLeagueSummary = async () => {
        const authRes = await client.auth.getUser();
        const userId = authRes.data.user?.id ?? null;
        if (!userId) return;

        const appRes = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
        const linkedPlayerId = (appRes.data?.linked_player_id as string | null) ?? null;
        if (!linkedPlayerId) {
          setLeagueSummaries([]);
          return;
        }

        const seasonsRes = await client
          .from("league_seasons")
          .select("id,name,is_published,created_at")
          .eq("is_published", true)
          .order("created_at", { ascending: false });
        const publishedSeasons = (seasonsRes.data ?? []) as Array<{ id: string; name: string | null }>;
        const publishedSeasonIds = publishedSeasons.map((season) => season.id);
        if (publishedSeasonIds.length === 0) {
          setLeagueSummaries([]);
          return;
        }

        const memberRes = await client
          .from("league_team_members")
          .select("season_id,team_id,player_id")
          .eq("player_id", linkedPlayerId)
          .in("season_id", publishedSeasonIds);
        const members = (memberRes.data ?? []) as LeagueTeamMember[];
        if (members.length === 0) {
          setLeagueSummaries([]);
          return;
        }

        const relevantSeasonIds = Array.from(new Set(members.map((m) => m.season_id)));
        const memberTeamIds = Array.from(new Set(members.map((m) => m.team_id)));

        const [teamsRes, fixturesRes, sessionRes] = await Promise.all([
          client.from("league_teams").select("id,name,season_id").in("season_id", relevantSeasonIds),
          client
            .from("league_fixtures")
            .select("id,season_id,week_no,fixture_date,home_team_id,away_team_id,status,home_points,away_points")
            .in("season_id", relevantSeasonIds)
            .order("fixture_date", { ascending: true }),
          client.auth.getSession(),
        ]);
        const teamMap = new Map(((teamsRes.data ?? []) as LeagueTeam[]).map((t) => [t.id, t.name]));
        setTeamById(teamMap);

        const allSeasonFixtures = ((fixturesRes.data ?? []) as LeagueFixture[]).filter(
          (fixture) => memberTeamIds.includes(fixture.home_team_id) || memberTeamIds.includes(fixture.away_team_id)
        );
        const token = sessionRes.data.session?.access_token;
        if (token) {
          const requestRes = await fetch("/api/league/fixture-change-requests?scope=published", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = (await requestRes.json().catch(() => ({}))) as { rows?: FixtureChangeRequest[] };
          if (requestRes.ok) {
            setFixtureChangeRequests(payload.rows ?? []);
          } else {
            setFixtureChangeRequests([]);
          }
        } else {
          setFixtureChangeRequests([]);
        }
        const fixturesForMemberTeams = allSeasonFixtures.filter(
          (fixture) => memberTeamIds.includes(fixture.home_team_id) || memberTeamIds.includes(fixture.away_team_id)
        );

        const now = new Date();
        const toDayKey = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const keyOf = (f: LeagueFixture) => {
          if (!f.fixture_date) return Number.POSITIVE_INFINITY;
          const d = new Date(`${f.fixture_date}T12:00:00`);
          return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
        };

        const seasonNameById = new Map(publishedSeasons.map((season) => [season.id, season.name?.trim() || "League"]));
        const summaryRows = members
          .map((member) => {
            const teamName = teamMap.get(member.team_id) ?? "My Team";
            const seasonName = seasonNameById.get(member.season_id) ?? "League";
            const teamFixtures = fixturesForMemberTeams.filter(
              (fixture) =>
                fixture.season_id === member.season_id &&
                (fixture.home_team_id === member.team_id || fixture.away_team_id === member.team_id)
            );
            const past = teamFixtures.filter((f) => keyOf(f) <= toDayKey).sort((a, b) => keyOf(b) - keyOf(a));
            const future = teamFixtures.filter((f) => keyOf(f) > toDayKey).sort((a, b) => keyOf(a) - keyOf(b));
            return {
              key: `${member.season_id}:${member.team_id}`,
              label: teamName,
              seasonName,
              lastFixture: past[0] ?? null,
              nextFixture: future[0] ?? null,
              followingFixture: future[1] ?? null,
            } satisfies LeagueFixtureSummary;
          })
          .sort((a, b) => a.seasonName.localeCompare(b.seasonName) || a.label.localeCompare(b.label));
        setLeagueSummaries(summaryRows);
        setTeamLabel(summaryRows[0]?.label ?? "My Team");
        setLastFixture(summaryRows[0]?.lastFixture ?? null);
        const primaryNextFixture = [...summaryRows]
          .map((summary) => summary.nextFixture)
          .filter((fixture): fixture is LeagueFixture => Boolean(fixture))
          .sort((a, b) => keyOf(a) - keyOf(b))[0] ?? null;
        setNextFixture(primaryNextFixture);
        setFollowingFixture(summaryRows[0]?.followingFixture ?? null);
        setSeasonFixtures(allSeasonFixtures);
        const fixtureIds = allSeasonFixtures.map((f) => f.id);
        const [membersResAll, framesResAll, playersResAll] = await Promise.all([
          client
            .from("league_team_members")
            .select("season_id,team_id,player_id")
            .in("season_id", relevantSeasonIds),
          fixtureIds.length
            ? client
                .from("league_fixture_frames")
                .select("fixture_id,slot_no,slot_type,winner_side,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_forfeit,away_forfeit")
                .in("fixture_id", fixtureIds)
            : Promise.resolve({ data: [] as LeagueFramePerf[] }),
          client
            .from("players")
            .select("id,display_name,full_name,rating_snooker,snooker_handicap")
            .eq("is_archived", false),
        ]);
        setSeasonMembers((membersResAll.data ?? []) as LeagueTeamMember[]);
        setSeasonFrames((framesResAll.data ?? []) as LeagueFramePerf[]);
        setSeasonPlayers((playersResAll.data ?? []) as LeaguePlayer[]);

        const compMatchRes = await client
          .from("matches")
          .select(
            "id,competition_id,status,round_no,match_no,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id"
          )
          .eq("is_archived", false)
          .not("competition_id", "is", null)
          .or(
            [
              `player1_id.eq.${linkedPlayerId}`,
              `player2_id.eq.${linkedPlayerId}`,
              `team1_player1_id.eq.${linkedPlayerId}`,
              `team1_player2_id.eq.${linkedPlayerId}`,
              `team2_player1_id.eq.${linkedPlayerId}`,
              `team2_player2_id.eq.${linkedPlayerId}`,
            ].join(",")
          )
          .order("created_at", { ascending: false })
          .limit(30);
        if (!compMatchRes.error) {
          const matchRows = (compMatchRes.data ?? []) as Array<{
            id: string;
            competition_id: string | null;
            status: "pending" | "in_progress" | "complete" | "bye";
            round_no: number | null;
            match_no: number | null;
            player1_id: string | null;
            player2_id: string | null;
            team1_player1_id: string | null;
            team1_player2_id: string | null;
            team2_player1_id: string | null;
            team2_player2_id: string | null;
          }>;
          const compIds = Array.from(new Set(matchRows.map((m) => m.competition_id).filter(Boolean))) as string[];
          const allPlayerIds = Array.from(
            new Set(
              matchRows.flatMap((m) =>
                [
                  m.player1_id,
                  m.player2_id,
                  m.team1_player1_id,
                  m.team1_player2_id,
                  m.team2_player1_id,
                  m.team2_player2_id,
                ].filter(Boolean)
              )
            )
          ) as string[];
          const [compRes, playersRes] = await Promise.all([
            compIds.length ? client.from("competitions").select("id,name,is_archived,is_completed").in("id", compIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string; is_archived: boolean | null; is_completed: boolean | null }> }),
            allPlayerIds.length ? client.from("players").select("id,full_name,display_name").in("id", allPlayerIds) : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; display_name: string | null }> }),
          ]);
          const compNameById = new Map(
            ((compRes.data ?? []) as Array<{ id: string; name: string; is_archived: boolean | null; is_completed: boolean | null }>)
              .filter((competition) => !competition.is_archived && !competition.is_completed)
              .map((competition) => [competition.id, competition.name])
          );
          const playerNameById = new Map(
            ((playersRes.data ?? []) as Array<{ id: string; full_name: string | null; display_name: string | null }>).map((p) => [
              p.id,
              p.full_name?.trim() || p.display_name || "Unknown",
            ])
          );
          const mapped: UserCompetitionMatch[] = matchRows
            .filter((m) => Boolean(m.competition_id) && compNameById.has(m.competition_id ?? ""))
            .map((m) => {
              const ids = [
                m.player1_id,
                m.player2_id,
                m.team1_player1_id,
                m.team1_player2_id,
                m.team2_player1_id,
                m.team2_player2_id,
              ].filter(Boolean) as string[];
              const opponents = ids.filter((id) => id !== linkedPlayerId).map((id) => playerNameById.get(id) ?? "Opponent");
              return {
                matchId: m.id,
                competitionName: compNameById.get(m.competition_id ?? "") ?? "Competition",
                status: m.status,
                roundNo: m.round_no,
                matchNo: m.match_no,
                opponentLabel: opponents.length ? opponents.join(" / ") : "Opponent TBC",
              };
            });
          setUserCompetitionMatches(mapped);
        }
      };

      if (!admin.isSuper) {
        // In league-user mode, Events is a team fixture summary (last/next/following).
        setLeagueMode(true);
        await loadLeagueSummary();
        setLoading(false);
        return;
      }

      const [compRes, matchesRes] = await Promise.all([
        client
          .from("competitions")
          .select("id,name,sport_type,competition_format,match_mode,best_of,is_practice,is_archived,is_completed,created_at")
          .order("created_at", { ascending: false }),
        client
          .from("matches")
          .select("competition_id,status,updated_at,is_archived"),
      ]);
      if (!active) return;
      if (compRes.error || !compRes.data) {
        if (isMissingTable(compRes.error?.message)) {
          setLeagueMode(true);
          await loadLeagueSummary();
          setLoading(false);
          return;
        }
        setMessage(compRes.error?.message ?? "Failed to load events.");
        setLoading(false);
        return;
      }
      setLeagueMode(false);
      setRows(compRes.data as Competition[]);
      setMatchRows((matchesRes.data ?? []) as MatchRow[]);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [admin.isSuper]);

  const leagueFixtureLabel = (f: LeagueFixture | null) => {
    if (!f) return "No fixture";
    const home = teamById.get(f.home_team_id) ?? "Home";
    const away = teamById.get(f.away_team_id) ?? "Away";
    return `${home} vs ${away}`;
  };
  const fixtureChangeByFixtureId = useMemo(() => {
    const map = new Map<string, FixtureChangeRequest>();
    for (const request of fixtureChangeRequests) {
      if (!map.has(request.fixture_id) || request.status === "rescheduled") {
        map.set(request.fixture_id, request);
      }
    }
    return map;
  }, [fixtureChangeRequests]);
  const leagueFixtureReschedule = (f: LeagueFixture | null) => (f ? formatFixtureReschedule(fixtureChangeByFixtureId.get(f.id)) : null);
  const leagueFixtureDate = (f: LeagueFixture | null) =>
    f?.fixture_date ? new Date(`${f.fixture_date}T12:00:00`).toLocaleDateString("en-GB") : "Date TBC";
  const leagueFixtureScore = (f: LeagueFixture | null) => {
    if (!f) return "Not played";
    if (f.status !== "complete") return "Awaiting result";
    if (f.home_points === null && f.away_points === null) return "Result not entered";
    return `${f.home_points ?? 0}-${f.away_points ?? 0}`;
  };
  const playersByTeam = useMemo(() => {
    const map = new Map<string, LeaguePlayer[]>();
    const byId = new Map(seasonPlayers.map((p) => [p.id, p]));
    for (const m of seasonMembers) {
      const player = byId.get(m.player_id);
      if (!player) continue;
      const prev = map.get(m.team_id) ?? [];
      prev.push(player);
      map.set(m.team_id, prev);
    }
    return map;
  }, [seasonMembers, seasonPlayers]);
  const teamStats = useMemo(() => {
    const map = new Map<string, { played: number; won: number; lost: number; draw: number; points: number; framesFor: number; framesAgainst: number; recent: ("W" | "L" | "D")[] }>();
    const complete = seasonFixtures
      .filter((f) => f.status === "complete")
      .sort((a, b) => {
        const da = a.fixture_date ? new Date(`${a.fixture_date}T12:00:00`).getTime() : 0;
        const db = b.fixture_date ? new Date(`${b.fixture_date}T12:00:00`).getTime() : 0;
        return da - db;
      });
    for (const f of complete) {
      const home = f.home_team_id;
      const away = f.away_team_id;
      const hp = Number(f.home_points ?? 0);
      const ap = Number(f.away_points ?? 0);
      const hs = map.get(home) ?? { played: 0, won: 0, lost: 0, draw: 0, points: 0, framesFor: 0, framesAgainst: 0, recent: [] };
      const as = map.get(away) ?? { played: 0, won: 0, lost: 0, draw: 0, points: 0, framesFor: 0, framesAgainst: 0, recent: [] };
      hs.played += 1; as.played += 1;
      hs.framesFor += hp; hs.framesAgainst += ap;
      as.framesFor += ap; as.framesAgainst += hp;
      if (hp > ap) {
        hs.won += 1; as.lost += 1; hs.points += 2;
        hs.recent.push("W"); as.recent.push("L");
      } else if (ap > hp) {
        as.won += 1; hs.lost += 1; as.points += 2;
        hs.recent.push("L"); as.recent.push("W");
      } else {
        hs.draw += 1; as.draw += 1; hs.points += 1; as.points += 1;
        hs.recent.push("D"); as.recent.push("D");
      }
      map.set(home, hs);
      map.set(away, as);
    }
    return map;
  }, [seasonFixtures]);
  const teamPosition = useMemo(() => {
    const rows = Array.from(teamStats.entries()).map(([teamId, s]) => ({
      teamId,
      points: s.points,
      frameDiff: s.framesFor - s.framesAgainst,
      framesFor: s.framesFor,
    }));
    rows.sort((a, b) => b.points - a.points || b.frameDiff - a.frameDiff || b.framesFor - a.framesFor);
    const pos = new Map<string, number>();
    rows.forEach((r, idx) => pos.set(r.teamId, idx + 1));
    return pos;
  }, [teamStats]);
  const prediction = useMemo(() => {
    const f = predictionFixture ?? nextFixture;
    if (!f) return null;
    const homePlayers = playersByTeam.get(f.home_team_id) ?? [];
    const awayPlayers = playersByTeam.get(f.away_team_id) ?? [];
    const homeStats = teamStats.get(f.home_team_id) ?? { played: 0, won: 0, lost: 0, draw: 0, points: 0, framesFor: 0, framesAgainst: 0, recent: [] };
    const awayStats = teamStats.get(f.away_team_id) ?? { played: 0, won: 0, lost: 0, draw: 0, points: 0, framesFor: 0, framesAgainst: 0, recent: [] };
    const avg = (nums: number[], fallback: number) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : fallback);
    const homeRating = avg(homePlayers.map((p) => Number(p.rating_snooker ?? 1000)), 1000);
    const awayRating = avg(awayPlayers.map((p) => Number(p.rating_snooker ?? 1000)), 1000);
    const homeHcp = avg(homePlayers.map((p) => Number(p.snooker_handicap ?? 0)), 0);
    const awayHcp = avg(awayPlayers.map((p) => Number(p.snooker_handicap ?? 0)), 0);
    const formScore = (recent: ("W" | "L" | "D")[]) =>
      recent.slice(-5).reduce((acc, r) => acc + (r === "W" ? 1 : r === "D" ? 0.5 : 0), 0);
    const homeForm = formScore(homeStats.recent);
    const awayForm = formScore(awayStats.recent);
    const maxTeams = Math.max(2, teamPosition.size);
    const homePos = teamPosition.get(f.home_team_id) ?? maxTeams;
    const awayPos = teamPosition.get(f.away_team_id) ?? maxTeams;
    const styleWeights: Record<PredictionStyle, { rating: number; handicap: number; form: number; table: number; home: number; scale: number }> = {
      balanced: { rating: 0.18, handicap: 1.6, form: 12, table: 3.5, home: 2, scale: 12 },
      form: { rating: 0.14, handicap: 1.2, form: 16, table: 4, home: 2, scale: 12 },
      handicap: { rating: 0.12, handicap: 2.2, form: 10, table: 3, home: 2, scale: 12 },
    };
    const w = styleWeights[predictionStyle];
    // Weighted prediction model tuned for league snooker:
    // rating (Elo-like), handicap, recent form, and table position.
    const ratingComponent = (homeRating - awayRating) * w.rating;
    const handicapComponent = (awayHcp - homeHcp) * w.handicap;
    const formComponent = (homeForm - awayForm) * w.form;
    const positionComponent = (awayPos - homePos) * w.table;
    const homeAdvantage = w.home;
    const diff = ratingComponent + handicapComponent + formComponent + positionComponent + homeAdvantage;
    const homeProb = 1 / (1 + Math.exp(-diff / w.scale));
    const awayProb = 1 - homeProb;
    const winnerSide: "home" | "away" = homeProb >= awayProb ? "home" : "away";
    const homeTeam = teamById.get(f.home_team_id) ?? "Home";
    const awayTeam = teamById.get(f.away_team_id) ?? "Away";
    const completedFixtureIds = new Set(seasonFixtures.filter((x) => x.status === "complete").map((x) => x.id));
    const frameRecordFor = (playerId: string) => {
      let won = 0;
      let lost = 0;
      for (const fr of seasonFrames) {
        if (!completedFixtureIds.has(fr.fixture_id) || !fr.winner_side || fr.home_forfeit || fr.away_forfeit) continue;
        const inHome = fr.home_player1_id === playerId || fr.home_player2_id === playerId;
        const inAway = fr.away_player1_id === playerId || fr.away_player2_id === playerId;
        if (!inHome && !inAway) continue;
        const isWin = (inHome && fr.winner_side === "home") || (inAway && fr.winner_side === "away");
        if (isWin) won += 1;
        else lost += 1;
      }
      return { won, lost };
    };
    const describeTopPlayer = (teamPlayers: LeaguePlayer[]) => {
      if (teamPlayers.length === 0) return "No registered player history yet for this team.";
      const sorted = [...teamPlayers].sort(
        (a, b) =>
          Number(b.rating_snooker ?? 1000) - Number(a.rating_snooker ?? 1000) ||
          Number(a.snooker_handicap ?? 0) - Number(b.snooker_handicap ?? 0)
      );
      const p = sorted[0];
      const rec = frameRecordFor(p.id);
      return `${p.full_name?.trim() || p.display_name} leads on rating (${Math.round(Number(p.rating_snooker ?? 1000))}) with handicap ${Number(p.snooker_handicap ?? 0)} and frame form ${rec.won}-${rec.lost}.`;
    };
    const playerBlurbs = (teamPlayers: LeaguePlayer[]) => {
      const sorted = [...teamPlayers].sort(
        (a, b) =>
          Number(b.rating_snooker ?? 1000) - Number(a.rating_snooker ?? 1000) ||
          Number(a.snooker_handicap ?? 0) - Number(b.snooker_handicap ?? 0)
      );
      return sorted.slice(0, 3).map((p) => {
        const rec = frameRecordFor(p.id);
        const name = p.full_name?.trim() || p.display_name;
        return `${name}: rating ${Math.round(Number(p.rating_snooker ?? 1000))}, handicap ${Number(p.snooker_handicap ?? 0)}, frame record ${rec.won}-${rec.lost}.`;
      });
    };
    return {
      fixture: f,
      homeTeam,
      awayTeam,
      homeProb: Math.round(homeProb * 100),
      awayProb: Math.round(awayProb * 100),
      winnerSide,
      homePos,
      awayPos,
      homeForm: homeStats.recent.slice(-5).join("") || "-",
      awayForm: awayStats.recent.slice(-5).join("") || "-",
      style: predictionStyle,
      ratingComponent: Math.round(ratingComponent * 10) / 10,
      handicapComponent: Math.round(handicapComponent * 10) / 10,
      formComponent: Math.round(formComponent * 10) / 10,
      positionComponent: Math.round(positionComponent * 10) / 10,
      homeAdvantage,
      homeTop: homePlayers.slice(0, 3).map((p) => `${p.full_name?.trim() || p.display_name} (R${Math.round(Number(p.rating_snooker ?? 1000))}, H${Number(p.snooker_handicap ?? 0)})`),
      awayTop: awayPlayers.slice(0, 3).map((p) => `${p.full_name?.trim() || p.display_name} (R${Math.round(Number(p.rating_snooker ?? 1000))}, H${Number(p.snooker_handicap ?? 0)})`),
      homeNarrative: describeTopPlayer(homePlayers),
      awayNarrative: describeTopPlayer(awayPlayers),
      homeBlurbs: playerBlurbs(homePlayers),
      awayBlurbs: playerBlurbs(awayPlayers),
    };
  }, [predictionFixture, nextFixture, playersByTeam, teamStats, teamPosition, teamById, seasonFixtures, seasonFrames, predictionStyle]);
  const playerNameMap = useMemo(
    () => new Map(seasonPlayers.map((p) => [p.id, p.full_name?.trim() || p.display_name])),
    [seasonPlayers]
  );
  const weekOptions = useMemo(() => {
    const completeByWeek = new Map<number, { total: number; complete: number }>();
    for (const f of seasonFixtures) {
      if (typeof f.week_no !== "number") continue;
      const prev = completeByWeek.get(f.week_no) ?? { total: 0, complete: 0 };
      prev.total += 1;
      if (f.status === "complete") prev.complete += 1;
      completeByWeek.set(f.week_no, prev);
    }
    return Array.from(completeByWeek.entries())
      .filter(([, v]) => v.total > 0 && v.total === v.complete)
      .map(([week]) => week)
      .sort((a, b) => b - a);
  }, [seasonFixtures]);
  useEffect(() => {
    if (weekOptions.length === 0) {
      setRoundupWeek("");
      return;
    }
    if (!roundupWeek || !weekOptions.includes(roundupWeek)) setRoundupWeek(weekOptions[0]);
  }, [weekOptions, roundupWeek]);
  const matchupReport = useMemo(() => {
    if (!reportFixture) return null;
    const frames = seasonFrames
      .filter((fr) => fr.fixture_id === reportFixture.id)
      .slice()
      .sort((a, b) => Number(a.slot_no ?? 0) - Number(b.slot_no ?? 0));
    const home = teamById.get(reportFixture.home_team_id) ?? "Home";
    const away = teamById.get(reportFixture.away_team_id) ?? "Away";
    const joined = (a: string | null, b: string | null) => [a, b].filter(Boolean).join(" / ");
    const frameRows = frames.map((fr, idx) => {
      const homeName = joined(playerNameMap.get(fr.home_player1_id ?? "") ?? null, playerNameMap.get(fr.home_player2_id ?? "") ?? null) || "TBC";
      const awayName = joined(playerNameMap.get(fr.away_player1_id ?? "") ?? null, playerNameMap.get(fr.away_player2_id ?? "") ?? null) || "TBC";
      const winner = fr.winner_side === "home" ? homeName : fr.winner_side === "away" ? awayName : "No winner";
      return {
        label: `${(fr.slot_type ?? "Frame").replace(/^./, (m) => m.toUpperCase())} ${fr.slot_no ?? idx + 1}`,
        homeName,
        awayName,
        winner,
      };
    });
    const wins = new Map<string, number>();
    for (const fr of frames) {
      if (!fr.winner_side || fr.home_forfeit || fr.away_forfeit) continue;
      const ids =
        fr.winner_side === "home"
          ? [fr.home_player1_id, fr.home_player2_id]
          : [fr.away_player1_id, fr.away_player2_id];
      for (const id of ids) {
        if (!id) continue;
        wins.set(id, (wins.get(id) ?? 0) + 1);
      }
    }
    const top = Array.from(wins.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id, n]) => `${playerNameMap.get(id) ?? "Player"} (${n} frame${n === 1 ? "" : "s"})`);
    return {
      home,
      away,
      score: `${reportFixture.home_points ?? 0}-${reportFixture.away_points ?? 0}`,
      frameRows,
      headline:
        (reportFixture.home_points ?? 0) > (reportFixture.away_points ?? 0)
          ? `${home} beat ${away} ${reportFixture.home_points ?? 0}-${reportFixture.away_points ?? 0}.`
          : (reportFixture.away_points ?? 0) > (reportFixture.home_points ?? 0)
            ? `${away} beat ${home} ${reportFixture.away_points ?? 0}-${reportFixture.home_points ?? 0}.`
            : `${home} and ${away} drew ${reportFixture.home_points ?? 0}-${reportFixture.away_points ?? 0}.`,
      top,
    };
  }, [reportFixture, seasonFrames, teamById, playerNameMap]);
  const weeklyRoundup = useMemo(() => {
    if (!roundupWeek) return null;
    const weekFixtures = seasonFixtures
      .filter((f) => f.week_no === roundupWeek)
      .sort((a, b) => (a.fixture_date ?? "").localeCompare(b.fixture_date ?? ""));
    if (weekFixtures.length === 0 || weekFixtures.some((f) => f.status !== "complete")) return null;
    const lines = weekFixtures.map((f) => {
      const home = teamById.get(f.home_team_id) ?? "Home";
      const away = teamById.get(f.away_team_id) ?? "Away";
      const hp = Number(f.home_points ?? 0);
      const ap = Number(f.away_points ?? 0);
      const outcome = hp > ap ? `${home} won` : ap > hp ? `${away} won` : "Draw";
      return { id: f.id, text: `${home} ${hp}-${ap} ${away} · ${outcome}` };
    });
    const fixtureIds = new Set(weekFixtures.map((f) => f.id));
    const wins = new Map<string, number>();
    for (const fr of seasonFrames) {
      if (!fixtureIds.has(fr.fixture_id) || !fr.winner_side || fr.home_forfeit || fr.away_forfeit) continue;
      const ids =
        fr.winner_side === "home"
          ? [fr.home_player1_id, fr.home_player2_id]
          : [fr.away_player1_id, fr.away_player2_id];
      for (const id of ids) {
        if (!id) continue;
        wins.set(id, (wins.get(id) ?? 0) + 1);
      }
    }
    const star = Array.from(wins.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      lines,
      star: star ? `${playerNameMap.get(star[0]) ?? "Player"} was standout with ${star[1]} frame win${star[1] === 1 ? "" : "s"}.` : "No standout player recorded this week yet.",
    };
  }, [roundupWeek, seasonFixtures, teamById, seasonFrames, playerNameMap]);
  const matchReportText = useMemo(() => {
    if (!matchupReport || !reportFixture) return "";
    const lines = [
      `${matchupReport.home} vs ${matchupReport.away} (${leagueFixtureDate(reportFixture)})`,
      `Result: ${matchupReport.score}`,
      matchupReport.headline,
      matchupReport.top.length ? `Key performers: ${matchupReport.top.join(" · ")}` : "",
      "",
      "Frame summary:",
      ...matchupReport.frameRows.map((r) => `- ${r.label}: ${r.homeName} vs ${r.awayName} | Winner: ${r.winner}`),
    ].filter(Boolean);
    return lines.join("\n");
  }, [matchupReport, reportFixture]);
  const weeklyRoundupText = useMemo(() => {
    if (!weeklyRoundup || !roundupWeek) return "";
    const lines = [
      `Week ${roundupWeek} Round-up`,
      ...weeklyRoundup.lines.map((l) => `- ${l.text}`),
      "",
      weeklyRoundup.star,
    ];
    return lines.join("\n");
  }, [weeklyRoundup, roundupWeek]);
  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (!text.trim()) {
        setMessage(`No ${label.toLowerCase()} text available to copy.`);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API not available");
      }
      setInfoModal({ title: "Copied", description: `${label} copied to clipboard.` });
    } catch (e) {
      setMessage(`Unable to copy ${label.toLowerCase()}.`);
      console.error(e);
    }
  };
  const notifyCaptains = async (rows: LeagueReportInsert[], summary: string) => {
    const client = supabase;
    if (!client) return;
    if (!admin.isSuper) {
      setMessage("Only Super User can send captain notifications.");
      return;
    }
    if (!rows.length) {
      setMessage("No captain notification targets found.");
      return;
    }
    const insert = await client.from("league_reports").insert(rows);
    if (insert.error) {
      setMessage(`Failed to notify captains: ${insert.error.message}`);
      return;
    }
    await logAudit("league_report_notified", {
      entityType: "league_report",
      summary,
      meta: { count: rows.length },
    });
    setInfoModal({ title: "Captain Notifications Sent", description: `Sent ${rows.length} captain inbox notification${rows.length === 1 ? "" : "s"}.` });
  };
  const sendMatchReportToCaptains = async () => {
    if (!reportFixture || !matchupReport) return;
    const rows: LeagueReportInsert[] = [];
    const teams = [reportFixture.home_team_id, reportFixture.away_team_id];
    for (const teamId of teams) {
      rows.push({
        report_type: "match",
        season_id: reportFixture.season_id,
        week_no: reportFixture.week_no ?? null,
        fixture_id: reportFixture.id,
        target_team_id: teamId,
        title: `Match report: ${matchupReport.home} vs ${matchupReport.away}`,
        body: matchReportText,
      });
    }
    await notifyCaptains(rows, `Sent match report notifications for ${matchupReport.home} vs ${matchupReport.away}.`);
  };
  const sendWeeklyRoundupToCaptains = async () => {
    if (!weeklyRoundup || !roundupWeek) return;
    const teams = new Set<string>();
    for (const f of seasonFixtures) {
      if (f.week_no !== roundupWeek) continue;
      teams.add(f.home_team_id);
      teams.add(f.away_team_id);
    }
    const teamIds = Array.from(teams);
    const selectedSeasonId = seasonFixtures.find((f) => f.week_no === roundupWeek)?.season_id ?? null;
    if (!selectedSeasonId) {
      setMessage("Cannot determine season for this round-up.");
      return;
    }
    const rows: LeagueReportInsert[] = teamIds.map((teamId) => ({
      report_type: "weekly",
      season_id: selectedSeasonId,
      week_no: roundupWeek,
      fixture_id: null,
      target_team_id: teamId,
      title: `Week ${roundupWeek} round-up`,
      body: weeklyRoundupText,
    }));
    await notifyCaptains(rows, `Sent weekly round-up notifications for week ${roundupWeek}.`);
  };

  const open = useMemo(() => rows.filter((r) => !r.is_archived && !r.is_completed), [rows]);
  const completed = useMemo(() => rows.filter((r) => !r.is_archived && r.is_completed), [rows]);
  const archived = useMemo(() => rows.filter((r) => r.is_archived), [rows]);
  const activeRows = tab === "archived" ? archived : tab === "completed" ? completed : open;
  const statsByComp = useMemo(() => {
    const map = new Map<string, { total: number; done: number; inProgress: number; lastUpdated: string | null }>();
    for (const m of matchRows) {
      if (m.is_archived) continue;
      const prev = map.get(m.competition_id) ?? { total: 0, done: 0, inProgress: 0, lastUpdated: null };
      prev.total += 1;
      if (m.status === "complete" || m.status === "bye") prev.done += 1;
      if (m.status === "in_progress") prev.inProgress += 1;
      if (!prev.lastUpdated || new Date(m.updated_at).getTime() > new Date(prev.lastUpdated).getTime()) {
        prev.lastUpdated = m.updated_at;
      }
      map.set(m.competition_id, prev);
    }
    return map;
  }, [matchRows]);

  const deleteEvent = async (row: Competition) => {
    const client = supabase;
    if (!client) return;
    setMessage(null);
    const matchIdRes = await client.from("matches").select("id").eq("competition_id", row.id);
    if (matchIdRes.error) {
      setMessage(`Failed to load event matches: ${matchIdRes.error.message}`);
      return;
    }
    const matchIds = (matchIdRes.data ?? []).map((m) => m.id as string);
    if (matchIds.length > 0) {
      const subRes = await client.from("result_submissions").delete().in("match_id", matchIds);
      if (subRes.error) {
        setMessage(`Failed to delete result submissions: ${subRes.error.message}`);
        return;
      }
      const frameRes = await client.from("frames").delete().in("match_id", matchIds);
      if (frameRes.error) {
        setMessage(`Failed to delete frames: ${frameRes.error.message}`);
        return;
      }
      const matchRes = await client.from("matches").delete().eq("competition_id", row.id);
      if (matchRes.error) {
        setMessage(`Failed to delete matches: ${matchRes.error.message}`);
        return;
      }
    }
    const compRes = await client.from("competitions").delete().eq("id", row.id);
    if (compRes.error) {
      setMessage(`Failed to delete event: ${compRes.error.message}`);
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== row.id));
    setMatchRows((prev) => prev.filter((m) => m.competition_id !== row.id));
    await logAudit("competition_deleted", {
      entityType: "competition",
      entityId: row.id,
      summary: `Competition deleted permanently: ${row.name}.`,
    });
    setInfoModal({ title: "Event Deleted", description: `Event "${row.name}" deleted permanently.` });
  };

  const archiveEvent = async (row: Competition) => {
    const client = supabase;
    if (!client) return;
    const res = await client.from("competitions").update({ is_archived: true }).eq("id", row.id);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    await logAudit("competition_archived", {
      entityType: "competition",
      entityId: row.id,
      summary: `Competition archived: ${row.name}.`,
    });
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_archived: true } : x)));
  };

  const restoreEvent = async (row: Competition) => {
    const client = supabase;
    if (!client) return;
    const res = await client.from("competitions").update({ is_archived: false }).eq("id", row.id);
    if (res.error) {
      setMessage(res.error.message);
      return;
    }
    await logAudit("competition_restored", {
      entityType: "competition",
      entityId: row.id,
      summary: `Competition restored: ${row.name}.`,
    });
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_archived: false } : x)));
  };

  const changeTab = (next: Tab) => {
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-3 sm:space-y-4">
        <RequireAuth>
          <ScreenHeader title="Events" eyebrow="Events" subtitle={leagueMode ? "Team fixture timeline and competition activity." : "View open, completed, and archived events."} />

          <div className="flex items-center gap-2">
            {admin.isAdmin ? (
              <Link href="/events/new" className={buttonPrimaryClass}>
                Create Competition
              </Link>
            ) : null}
          </div>

          {!leagueMode ? (
            <section className={cardBaseClass}>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => changeTab("open")} className={tab === "open" ? pillActiveClass : pillInactiveClass}>Open ({open.length})</button>
                <button type="button" onClick={() => changeTab("completed")} className={tab === "completed" ? pillActiveClass : pillInactiveClass}>Completed ({completed.length})</button>
                <button type="button" onClick={() => changeTab("archived")} className={tab === "archived" ? pillActiveClass : pillInactiveClass}>Archived ({archived.length})</button>
              </div>
            </section>
          ) : null}

          {loading ? <p className={cardBaseClass}>Loading events...</p> : null}
          <MessageModal message={message} onClose={() => setMessage(null)} />

          {leagueMode ? (
            <section className="space-y-3">
              {leagueSummaries.length === 0 ? (
                <article className={cardBaseClass}>
                  <h2 className="text-lg font-semibold text-slate-900">{teamLabel ?? "My Team"}</h2>
                  <p className="mt-1 text-sm text-slate-600">Recent and upcoming league fixtures.</p>
                </article>
              ) : (
                leagueSummaries.map((summary) => (
                  <article key={summary.key} className={cardBaseClass}>
                    <h2 className="text-lg font-semibold text-slate-900">{summary.label}</h2>
                    <p className="mt-1 text-sm text-slate-600">{summary.seasonName}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Match</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{leagueFixtureLabel(summary.lastFixture)}</p>
                        <p className="text-xs text-slate-600">{leagueFixtureDate(summary.lastFixture)} · {leagueFixtureScore(summary.lastFixture)}</p>
                        {leagueFixtureReschedule(summary.lastFixture) ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded-full border px-2 py-0.5 font-semibold ${leagueFixtureReschedule(summary.lastFixture)?.chip === "Brought forward" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                              {leagueFixtureReschedule(summary.lastFixture)?.chip}
                            </span>
                            <span className="text-slate-600">{leagueFixtureReschedule(summary.lastFixture)?.detail}</span>
                          </div>
                        ) : null}
                        {summary.lastFixture?.status === "complete" ? (
                          <button
                            type="button"
                            onClick={() => setReportFixture(summary.lastFixture)}
                            className="mt-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                          >
                            View match report
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => summary.nextFixture && setPredictionFixture(summary.nextFixture)}
                        className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-left transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={!summary.nextFixture}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Next Match</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{leagueFixtureLabel(summary.nextFixture)}</p>
                        <p className="text-xs text-slate-600">{leagueFixtureDate(summary.nextFixture)}</p>
                        {leagueFixtureReschedule(summary.nextFixture) ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded-full border px-2 py-0.5 font-semibold ${leagueFixtureReschedule(summary.nextFixture)?.chip === "Brought forward" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                              {leagueFixtureReschedule(summary.nextFixture)?.chip}
                            </span>
                            <span className="text-slate-600">{leagueFixtureReschedule(summary.nextFixture)?.detail}</span>
                          </div>
                        ) : null}
                        <p className="mt-2 text-xs font-medium text-indigo-800">Click to view match preview</p>
                      </button>
                      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Future Match</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{leagueFixtureLabel(summary.followingFixture)}</p>
                        <p className="text-xs text-slate-600">{leagueFixtureDate(summary.followingFixture)}</p>
                        {leagueFixtureReschedule(summary.followingFixture) ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded-full border px-2 py-0.5 font-semibold ${leagueFixtureReschedule(summary.followingFixture)?.chip === "Brought forward" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                              {leagueFixtureReschedule(summary.followingFixture)?.chip}
                            </span>
                            <span className="text-slate-600">{leagueFixtureReschedule(summary.followingFixture)?.detail}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              )}
              {predictionFixture && prediction ? (
                <article className={cardBaseClass}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Next Match Preview</h3>
                      <p className="text-sm text-slate-600">
                        {prediction.homeTeam} vs {prediction.awayTeam} · {leagueFixtureDate(prediction.fixture)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPredictionFixture(null)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPredictionStyle("balanced")}
                      className={predictionStyle === "balanced" ? "rounded-full border border-indigo-700 bg-indigo-700 px-3 py-1 text-xs font-medium text-white" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"}
                    >
                      Balanced
                    </button>
                    <button
                      type="button"
                      onClick={() => setPredictionStyle("form")}
                      className={predictionStyle === "form" ? "rounded-full border border-indigo-700 bg-indigo-700 px-3 py-1 text-xs font-medium text-white" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"}
                    >
                      Form-heavy
                    </button>
                    <button
                      type="button"
                      onClick={() => setPredictionStyle("handicap")}
                      className={predictionStyle === "handicap" ? "rounded-full border border-indigo-700 bg-indigo-700 px-3 py-1 text-xs font-medium text-white" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"}
                    >
                      Handicap-heavy
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{prediction.homeTeam}</p>
                      <p className="text-xs text-slate-600">League position: {prediction.homePos} · Form (last 5): {prediction.homeForm}</p>
                      <p className="mt-1 text-xs text-slate-700">{prediction.homeNarrative}</p>
                      <div className="mt-2 space-y-1">
                        {prediction.homeBlurbs.map((line) => (
                          <p key={`h-${line}`} className="text-[11px] text-slate-700">{line}</p>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{prediction.awayTeam}</p>
                      <p className="text-xs text-slate-600">League position: {prediction.awayPos} · Form (last 5): {prediction.awayForm}</p>
                      <p className="mt-1 text-xs text-slate-700">{prediction.awayNarrative}</p>
                      <div className="mt-2 space-y-1">
                        {prediction.awayBlurbs.map((line) => (
                          <p key={`a-${line}`} className="text-[11px] text-slate-700">{line}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-900">
                      Expected result: {prediction.winnerSide === "home" ? prediction.homeTeam : prediction.awayTeam}
                    </p>
                    <p className="text-xs text-emerald-900">
                      Win probability estimate: {prediction.homeTeam} {prediction.homeProb}% · {prediction.awayTeam} {prediction.awayProb}%
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-800">
                      Based on team form, player ratings, handicaps, and current league position.
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-800">
                      Model factors: rating {prediction.ratingComponent >= 0 ? "+" : ""}{prediction.ratingComponent}, handicap {prediction.handicapComponent >= 0 ? "+" : ""}{prediction.handicapComponent}, form {prediction.formComponent >= 0 ? "+" : ""}{prediction.formComponent}, table {prediction.positionComponent >= 0 ? "+" : ""}{prediction.positionComponent}, home {prediction.homeAdvantage >= 0 ? "+" : ""}{prediction.homeAdvantage}.
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-800">Active style: {prediction.style === "balanced" ? "Balanced" : prediction.style === "form" ? "Form-heavy" : "Handicap-heavy"}.</p>
                  </div>
                </article>
              ) : null}
              {reportFixture && matchupReport ? (
                <article className={cardBaseClass}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Match Report</h3>
                      <p className="text-sm text-slate-600">{matchupReport.home} vs {matchupReport.away} · {leagueFixtureDate(reportFixture)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReportFixture(null)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                  <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2 text-sm font-medium text-sky-900">{matchupReport.headline}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(matchReportText, "Match report")}
                      className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
                    >
                      Copy report
                    </button>
                    {admin.isSuper ? (
                      <button
                        type="button"
                        onClick={() => void sendMatchReportToCaptains()}
                        className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        Notify captains
                      </button>
                    ) : null}
                  </div>
                  {matchupReport.top.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-700">Key performers: {matchupReport.top.join(" · ")}</p>
                  ) : null}
                  <div className="mt-3 space-y-1">
                    {matchupReport.frameRows.map((row) => (
                      <div key={`${row.label}-${row.homeName}-${row.awayName}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                        <span className="font-semibold text-slate-900">{row.label}:</span>{" "}
                        <span className="text-slate-700">{row.homeName} vs {row.awayName}</span>{" "}
                        <span className="text-slate-900">· Winner: {row.winner}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}
              <article className={cardBaseClass}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">Weekly Round-up</h3>
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    value={roundupWeek}
                    onChange={(e) => setRoundupWeek(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">Select completed week</option>
                    {weekOptions.map((w) => (
                      <option key={w} value={w}>
                        Week {w}
                      </option>
                    ))}
                  </select>
                </div>
                {!weeklyRoundup ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Weekly round-up appears when all fixtures in a selected week are complete and confirmed.
                  </p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(weeklyRoundupText, "Weekly round-up")}
                        className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
                      >
                        Copy round-up
                      </button>
                      {admin.isSuper ? (
                        <button
                          type="button"
                          onClick={() => void sendWeeklyRoundupToCaptains()}
                          className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                        >
                          Notify captains
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1">
                      {weeklyRoundup.lines.map((line) => (
                        <p key={line.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-800">
                          {line.text}
                        </p>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-700">{weeklyRoundup.star}</p>
                  </>
                )}
              </article>
              <article className={cardBaseClass}>
                <h2 className="text-lg font-semibold text-slate-900">Knockout Competitions</h2>
                {userCompetitionMatches.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">
                    No competition matches assigned yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {userCompetitionMatches.slice(0, 5).map((m) => (
                      <div key={m.matchId} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <p className="text-sm font-semibold text-slate-900">{m.competitionName}</p>
                        <p className="text-xs text-slate-600">
                          Round {m.roundNo ?? 1} · Match {m.matchNo ?? 1} · vs {m.opponentLabel}
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${
                              m.status === "complete"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : m.status === "in_progress"
                                  ? "border-sky-200 bg-sky-50 text-sky-800"
                                  : "border-amber-200 bg-amber-50 text-amber-800"
                            }`}
                          >
                            {m.status === "pending" ? "assigned" : m.status}
                          </span>
                          <Link href={`/matches/${m.matchId}`} className="text-xs font-medium text-teal-700 underline">
                            Open match
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          ) : (
            <section className="space-y-3">
            {activeRows.length === 0 ? <p className={`${cardBaseClass} text-slate-600`}>No events.</p> : null}
            {activeRows.map((r) => (
              <article key={r.id} className={cardBaseClass}>
                <h2 className="text-xl font-semibold text-slate-900">{r.name}</h2>
                <p className="mt-1 text-slate-700">
                  Snooker · {r.competition_format === "knockout" ? "Knockout" : "League"}{r.is_practice ? " · Practice" : ""}
                </p>
                <p className="mt-1 text-slate-700">Mode: {r.match_mode === "doubles" ? "Doubles" : "Singles"}</p>
                <p className="mt-1 text-slate-700">Best of {r.best_of}</p>
                {statsByComp.get(r.id) ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Progress: {statsByComp.get(r.id)!.done}/{statsByComp.get(r.id)!.total} complete
                    {statsByComp.get(r.id)!.inProgress > 0 ? ` · ${statsByComp.get(r.id)!.inProgress} in progress` : ""}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-slate-500">Created {fmtDate.format(new Date(r.created_at))}</p>
                <Link href={`/competitions/${r.id}`} className={`${buttonPrimaryClass} mt-2 inline-flex`}>Open competition</Link>
                {admin.isAdmin && tab !== "archived" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          title: "Archive Event",
                          description: `Archive "${r.name}"? This hides the event but keeps all stats.`,
                          confirmLabel: "Archive",
                          onConfirm: async () => {
                            await archiveEvent(r);
                            setConfirmModal(null);
                          },
                        })
                      }
                      className={`ml-2 mt-2 ${actionSecondaryClass}`}
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          title: "Delete Event Permanently",
                          description: "Are you sure? All match and player data will be permanently deleted.",
                          confirmLabel: "Delete Permanently",
                          tone: "danger",
                          onConfirm: async () => {
                            await deleteEvent(r);
                            setConfirmModal(null);
                          },
                        })
                      }
                      className={`ml-2 mt-2 ${actionDangerClass}`}
                    >
                      Delete permanently
                    </button>
                  </>
                ) : admin.isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => restoreEvent(r)}
                      className={`ml-2 mt-2 ${actionSuccessClass}`}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          title: "Delete Event Permanently",
                          description: "Are you sure? All match and player data will be permanently deleted.",
                          confirmLabel: "Delete Permanently",
                          tone: "danger",
                          onConfirm: async () => {
                            await deleteEvent(r);
                            setConfirmModal(null);
                          },
                        })
                      }
                      className={`ml-2 mt-2 ${actionDangerClass}`}
                    >
                      Delete permanently
                    </button>
                  </>
                ) : null}
              </article>
            ))}
          </section>
          )}
        </RequireAuth>
        <InfoModal
          open={Boolean(infoModal)}
          title={infoModal?.title ?? ""}
          description={infoModal?.description ?? ""}
          onClose={() => setInfoModal(null)}
        />
        <ConfirmModal
          open={Boolean(confirmModal)}
          title={confirmModal?.title ?? ""}
          description={confirmModal?.description ?? ""}
          confirmLabel={confirmModal?.confirmLabel ?? "Confirm"}
          tone={confirmModal?.tone ?? "default"}
          onCancel={() => setConfirmModal(null)}
          onConfirm={() => confirmModal?.onConfirm()}
        />
      </div>
    </main>
  );
}

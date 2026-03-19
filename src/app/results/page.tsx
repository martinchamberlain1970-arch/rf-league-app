"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import ConfirmModal from "@/components/ConfirmModal";

type SubmissionBreakEntry = {
  player_id?: string | null;
  entered_player_name?: string | null;
  break_value?: number;
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
  submitted_by_user_id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected" | "needs_correction";
  rejection_reason?: string | null;
  frame_results?: SubmissionFrameResult[] | null;
};
type CompetitionSubmission = {
  id: string;
  match_id: string;
  competition_id: string;
  submitted_by_user_id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected" | "needs_correction";
  rejection_reason?: string | null;
  payload?: {
    mode?: "standard" | "albery";
    winnerSide?: "home" | "away";
    homeScore?: number | null;
    awayScore?: number | null;
    albery?: {
      homePlayers?: [string, string, string];
      awayPlayers?: [string, string, string];
      leg1?: { home: number; away: number };
      leg2?: { home: number; away: number };
      leg3?: { home: number; away: number };
    } | null;
  } | null;
};

type FixtureRow = {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
  home_points: number;
  away_points: number;
  fixture_date: string | null;
};

type TeamRow = { id: string; name: string };
type SeasonRow = { id: string; name: string };
type PlayerRow = { id: string; display_name: string; full_name: string | null };
type MatchRow = {
  id: string;
  competition_id: string | null;
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id?: string | null;
  team1_player2_id?: string | null;
  team2_player1_id?: string | null;
  team2_player2_id?: string | null;
};
type CompetitionRow = { id: string; name: string };
type FixtureChangeRequest = {
  id: string;
  fixture_id: string;
  requested_by_user_id: string;
  requester_team_id: string | null;
  request_type: "play_early" | "play_late";
  original_fixture_date: string | null;
  proposed_fixture_date: string | null;
  agreed_fixture_date?: string | null;
  opposing_team_agreed: boolean;
  reason: string;
  status: "pending" | "approved_outstanding" | "rescheduled" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const named = (p?: PlayerRow | null) => (p ? (p.full_name?.trim() ? p.full_name : p.display_name) : "Unknown");

export default function ResultsQueuePage() {
  const admin = useAdminStatus();
  const [submissions, setSubmissions] = useState<LeagueSubmission[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [competitionSubmissions, setCompetitionSubmissions] = useState<CompetitionSubmission[]>([]);
  const [competitionMatches, setCompetitionMatches] = useState<MatchRow[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRow[]>([]);
  const [fixtureChangeRequests, setFixtureChangeRequests] = useState<FixtureChangeRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [agreedDates, setAgreedDates] = useState<Record<string, string>>({});
  const [confirmReview, setConfirmReview] = useState<{ submissionId: string; decision: "approved" | "rejected" } | null>(null);
  const [query, setQuery] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [expandedPending, setExpandedPending] = useState<Set<string>>(new Set());
  const [reviewedLimit, setReviewedLimit] = useState(20);
  const [queueTab, setQueueTab] = useState<"league" | "competition" | "fixture_changes">("league");

  const load = async () => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    if (!admin.loading && !admin.isAdmin && !admin.userId) return;

    let query = client
      .from("league_result_submissions")
      .select("id,fixture_id,submitted_by_user_id,created_at,status,rejection_reason,frame_results")
      .order("created_at", { ascending: false });

    if (!admin.isAdmin && admin.userId) {
      query = query.eq("submitted_by_user_id", admin.userId);
    }

    const sRes = await query;
    if (sRes.error) {
      setMessage(sRes.error.message || "Failed to load results queue.");
      return;
    }

    const submissionRows = (sRes.data ?? []) as LeagueSubmission[];
    setSubmissions(submissionRows);

    const [competitionSubmissionRes] = await Promise.all([
      client
        .from("competition_result_submissions")
        .select("id,match_id,competition_id,submitted_by_user_id,created_at,status,rejection_reason,payload")
        .order("created_at", { ascending: false }),
    ]);

    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    let loadedFixtureChangeRequests: FixtureChangeRequest[] = [];
    if (token) {
      const fixtureChangeRes = await fetch(`/api/league/fixture-change-requests?scope=${admin.isAdmin ? "admin" : "mine"}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await fixtureChangeRes.json().catch(() => ({}))) as { error?: string; rows?: FixtureChangeRequest[] };
      if (!fixtureChangeRes.ok) {
        setMessage(payload.error ?? "Failed to load fixture date requests.");
        return;
      }
      loadedFixtureChangeRequests = payload.rows ?? [];
      setFixtureChangeRequests(loadedFixtureChangeRequests);
    }
    if (!competitionSubmissionRes.error) {
      setCompetitionSubmissions((competitionSubmissionRes.data ?? []) as CompetitionSubmission[]);
    }

    const fixtureIds = Array.from(
      new Set([...submissionRows.map((s) => s.fixture_id).filter(Boolean), ...loadedFixtureChangeRequests.map((r) => r.fixture_id).filter(Boolean)])
    );
    if (!fixtureIds.length) {
      setFixtures([]);
      setTeams([]);
      setSeasons([]);
      setPlayers([]);
      return;
    }

    const fRes = await client
      .from("league_fixtures")
      .select("id,season_id,home_team_id,away_team_id,status,home_points,away_points,fixture_date")
      .in("id", fixtureIds);
    if (fRes.error) {
      setMessage(fRes.error.message || "Failed to load fixtures.");
      return;
    }
    const fixtureRows = (fRes.data ?? []) as FixtureRow[];
    setFixtures(fixtureRows);

    const teamIds = Array.from(new Set(fixtureRows.flatMap((f) => [f.home_team_id, f.away_team_id]).filter(Boolean)));
    const seasonIds = Array.from(new Set(fixtureRows.map((f) => f.season_id).filter(Boolean)));

    const competitionMatchIds = Array.from(new Set(((competitionSubmissionRes.data ?? []) as CompetitionSubmission[]).map((s) => s.match_id).filter(Boolean)));
    const competitionIds = Array.from(new Set(((competitionSubmissionRes.data ?? []) as CompetitionSubmission[]).map((s) => s.competition_id).filter(Boolean)));

    const [tRes, seasonRes, playersRes, competitionMatchesRes, competitionsRes] = await Promise.all([
      teamIds.length ? client.from("league_teams").select("id,name").in("id", teamIds) : Promise.resolve({ data: [] as TeamRow[], error: null as any }),
      seasonIds.length ? client.from("league_seasons").select("id,name").in("id", seasonIds) : Promise.resolve({ data: [] as SeasonRow[], error: null as any }),
      client.from("players").select("id,display_name,full_name").eq("is_archived", false),
      competitionMatchIds.length
        ? client
            .from("matches")
            .select("id,competition_id,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id")
            .in("id", competitionMatchIds)
        : Promise.resolve({ data: [] as MatchRow[], error: null as any }),
      competitionIds.length
        ? client.from("competitions").select("id,name").in("id", competitionIds)
        : Promise.resolve({ data: [] as CompetitionRow[], error: null as any }),
    ]);

    if (tRes.error) {
      setMessage(tRes.error.message || "Failed to load teams.");
      return;
    }
    if (seasonRes.error) {
      setMessage(seasonRes.error.message || "Failed to load seasons.");
      return;
    }
    if (playersRes.error) {
      setMessage(playersRes.error.message || "Failed to load players.");
      return;
    }
    if (competitionMatchesRes.error) {
      setMessage(competitionMatchesRes.error.message || "Failed to load competition matches.");
      return;
    }
    if (competitionsRes.error) {
      setMessage(competitionsRes.error.message || "Failed to load competitions.");
      return;
    }

    setTeams((tRes.data ?? []) as TeamRow[]);
    setSeasons((seasonRes.data ?? []) as SeasonRow[]);
    setPlayers((playersRes.data ?? []) as PlayerRow[]);
    setCompetitionMatches((competitionMatchesRes.data ?? []) as MatchRow[]);
    setCompetitions((competitionsRes.data ?? []) as CompetitionRow[]);
  };

  useEffect(() => {
    void load();
  }, [admin.loading, admin.isAdmin, admin.userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !admin.isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "fixture_changes" || tab === "competition" || tab === "league") {
      setQueueTab(tab);
    }
  }, [admin.isAdmin]);

  const fixtureById = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const seasonById = useMemo(() => new Map(seasons.map((s) => [s.id, s.name])), [seasons]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");
  const competitionPending = competitionSubmissions.filter((s) => s.status === "pending");
  const competitionReviewed = competitionSubmissions.filter((s) => s.status !== "pending");
  const fixtureChangePending = fixtureChangeRequests.filter((r) => r.status === "pending");
  const fixtureChangeOutstanding = fixtureChangeRequests.filter((r) => r.status === "approved_outstanding");
  const fixtureChangeReviewed = fixtureChangeRequests.filter((r) => r.status === "rescheduled" || r.status === "rejected");
  const leaguePendingCount = pending.length;
  const competitionPendingCount = competitionPending.length;
  const fixtureChangePendingCount = fixtureChangePending.length + fixtureChangeOutstanding.length;
  const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  const tintedCardClass = "rounded-2xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-5 shadow-sm";
  const itemClass = "rounded-xl border border-slate-200 bg-white p-3";

  const playerLabel = (side: "home" | "away", row: SubmissionFrameResult) => {
    const p1 = side === "home" ? row.home_player1_id : row.away_player1_id;
    const p2 = side === "home" ? row.home_player2_id : row.away_player2_id;
    const nominated = side === "home" ? row.home_nominated : row.away_nominated;
    const forfeit = side === "home" ? row.home_forfeit : row.away_forfeit;
    const nominatedName = side === "home" ? row.home_nominated_name : row.away_nominated_name;
    if (forfeit) return "No Show";
    if (nominated) {
      const label = nominatedName?.trim();
      return label ? `Nominated Player (${label})` : "Nominated Player";
    }
    if (row.slot_type === "doubles") {
      return `${named(playerById.get(p1 ?? ""))} & ${named(playerById.get(p2 ?? ""))}`;
    }
    return named(playerById.get(p1 ?? ""));
  };

  const competitionById = useMemo(() => new Map(competitions.map((c) => [c.id, c.name])), [competitions]);
  const competitionMatchById = useMemo(() => new Map(competitionMatches.map((m) => [m.id, m])), [competitionMatches]);

  const competitionMatchLabel = (m?: MatchRow | null) => {
    if (!m) return "Match";
    const home =
      m.team1_player1_id || m.team1_player2_id
        ? `${named(playerById.get(m.team1_player1_id ?? ""))} & ${named(playerById.get(m.team1_player2_id ?? ""))}`
        : named(playerById.get(m.player1_id ?? ""));
    const away =
      m.team2_player1_id || m.team2_player2_id
        ? `${named(playerById.get(m.team2_player1_id ?? ""))} & ${named(playerById.get(m.team2_player2_id ?? ""))}`
        : named(playerById.get(m.player2_id ?? ""));
    return `${home} vs ${away}`;
  };

  const onReview = async (submissionId: string, decision: "approved" | "rejected") => {
    const client = supabase;
    if (!client) return;
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setBusyId(submissionId);
    let res: Response;
    try {
      res = await fetch("/api/league/review-submission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          submissionId,
          decision,
          rejectionReason: rejectReasons[submissionId] ?? "",
        }),
      });
    } catch {
      setBusyId(null);
      setMessage("Network error while reviewing submission.");
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to review submission.");
      return;
    }
    await load();
  };

  const onReviewFixtureChange = async (requestId: string, decision: "approved" | "rejected") => {
    const client = supabase;
    if (!client) return;
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setBusyId(requestId);
    let res: Response;
    try {
      res = await fetch("/api/league/review-fixture-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          decision,
          reviewNotes: rejectReasons[requestId] ?? "",
        }),
      });
    } catch {
      setBusyId(null);
      setMessage("Network error while reviewing fixture date request.");
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to review fixture date request.");
      return;
    }
    await load();
  };

  const onScheduleFixtureChange = async (requestId: string) => {
    const client = supabase;
    if (!client) return;
    const agreedFixtureDate = agreedDates[requestId] ?? "";
    if (!agreedFixtureDate) {
      setMessage("Choose the agreed fixture date first.");
      return;
    }
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setBusyId(requestId);
    let res: Response;
    try {
      res = await fetch("/api/league/schedule-fixture-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          agreedFixtureDate,
          reviewNotes: rejectReasons[requestId] ?? "",
        }),
      });
    } catch {
      setBusyId(null);
      setMessage("Network error while scheduling fixture date.");
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to schedule fixture date.");
      return;
    }
    await load();
  };

  const onReviewCompetition = async (submissionId: string, decision: "approved" | "rejected") => {
    const client = supabase;
    if (!client) return;
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setBusyId(submissionId);
    let res: Response;
    try {
      res = await fetch("/api/competition/review-submission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          submissionId,
          decision,
          rejectionReason: rejectReasons[submissionId] ?? "",
        }),
      });
    } catch {
      setBusyId(null);
      setMessage("Network error while reviewing competition submission.");
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to review competition submission.");
      return;
    }
    await load();
  };

  const seasonOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const s of submissions) {
      const f = fixtureById.get(s.fixture_id);
      if (f?.season_id) ids.add(f.season_id);
    }
    return Array.from(ids)
      .map((id) => ({ id, name: seasonById.get(id) ?? "League" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions, fixtureById, seasonById]);

  const matchesFilter = (s: LeagueSubmission) => {
    const f = fixtureById.get(s.fixture_id);
    if (seasonFilter !== "all" && f?.season_id !== seasonFilter) return false;
    const home = f ? teamById.get(f.home_team_id) ?? "Home" : "Home";
    const away = f ? teamById.get(f.away_team_id) ?? "Away" : "Away";
    const seasonName = f ? seasonById.get(f.season_id) ?? "League" : "League";
    const haystack = `${home} ${away} ${seasonName}`.toLowerCase();
    return query.trim().length === 0 || haystack.includes(query.trim().toLowerCase());
  };

  const filteredPending = useMemo(() => pending.filter(matchesFilter), [pending, seasonFilter, query, fixtureById, teamById, seasonById]);
  const filteredReviewed = useMemo(() => reviewed.filter(matchesFilter), [reviewed, seasonFilter, query, fixtureById, teamById, seasonById]);
  const filteredMySubmissions = useMemo(() => submissions.filter(matchesFilter), [submissions, seasonFilter, query, fixtureById, teamById, seasonById]);

  const statusChipClass = (status: LeagueSubmission["status"] | FixtureChangeRequest["status"]) => {
    if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-800";
    if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (status === "approved_outstanding") return "border-indigo-200 bg-indigo-50 text-indigo-800";
    if (status === "rescheduled") return "border-sky-200 bg-sky-50 text-sky-800";
    if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-800";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

  const requestTypeLabel = (value: "play_early" | "play_late") =>
    value === "play_early" ? "Play before league date" : "Exceptional postponement / later date";

  const fixtureChangeQueueSection = (
    <section className={cardClass}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900">Fixture date requests ({fixtureChangePending.length})</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
          Pending {fixtureChangePending.length} · Outstanding {fixtureChangeOutstanding.length}
        </span>
      </div>
      <p className="text-sm text-slate-600">Early-play requests can be approved straight onto the agreed date. Exceptional postponement requests stay outstanding until you set the new agreed date.</p>
      <div className="mt-3 space-y-3">
        {fixtureChangePending.length === 0 ? <p className="text-sm text-slate-600">No pending fixture date requests.</p> : null}
        {fixtureChangePending.map((r) => {
          const f = fixtureById.get(r.fixture_id);
          const home = f ? teamById.get(f.home_team_id) ?? "Home" : "Home";
          const away = f ? teamById.get(f.away_team_id) ?? "Away" : "Away";
          const seasonName = f ? seasonById.get(f.season_id) ?? "League" : "League";
          return (
            <article key={r.id} className={itemClass}>
              <p className="text-sm text-slate-600">{seasonName}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xl font-semibold text-slate-900">{home} vs {away}</p>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">pending</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{requestTypeLabel(r.request_type)}</p>
              {r.request_type === "play_early" && r.proposed_fixture_date ? (
                <p className="text-xs text-slate-600">Requested early-play date: {new Date(`${r.proposed_fixture_date}T12:00:00`).toLocaleDateString()}</p>
              ) : null}
              <p className="text-xs text-slate-600">Original date: {r.original_fixture_date ? new Date(`${r.original_fixture_date}T12:00:00`).toLocaleDateString() : "Not set"}</p>
              <p className="mt-2 text-sm text-slate-700">{r.reason}</p>
              <p className="mt-1 text-xs text-slate-600">Opposing team agreed: {r.opposing_team_agreed ? "Yes" : "No"}</p>
              {admin.isSuper ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <input
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="League Secretary note (optional)"
                    value={rejectReasons[r.id] ?? ""}
                    onChange={(e) => setRejectReasons((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs text-white disabled:opacity-60"
                    onClick={() => void onReviewFixtureChange(r.id, "approved")}
                    disabled={busyId === r.id}
                  >
                    {r.request_type === "play_early" ? "Approve date" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs text-rose-800 disabled:opacity-60"
                    onClick={() => void onReviewFixtureChange(r.id, "rejected")}
                    disabled={busyId === r.id}
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-600">Only the Super User can approve or reject fixture-date requests.</p>
              )}
            </article>
          );
        })}
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900">Fixtures to be rescheduled ({fixtureChangeOutstanding.length})</h3>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800">Awaiting agreed date</span>
        </div>
        {fixtureChangeOutstanding.length === 0 ? <p className="text-sm text-slate-600">No approved outstanding fixtures.</p> : null}
        {fixtureChangeOutstanding.map((r) => {
          const f = fixtureById.get(r.fixture_id);
          const home = f ? teamById.get(f.home_team_id) ?? "Home" : "Home";
          const away = f ? teamById.get(f.away_team_id) ?? "Away" : "Away";
          const seasonName = f ? seasonById.get(f.season_id) ?? "League" : "League";
          return (
            <article key={r.id} className={itemClass}>
              <p className="text-sm text-slate-600">{seasonName}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xl font-semibold text-slate-900">{home} vs {away}</p>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold uppercase text-indigo-800">outstanding</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{requestTypeLabel(r.request_type)}</p>
              <p className="text-xs text-slate-600">Original date: {r.original_fixture_date ? new Date(`${r.original_fixture_date}T12:00:00`).toLocaleDateString() : "Not set"}</p>
              <p className="mt-2 text-sm text-slate-700">{r.reason}</p>
              <p className="mt-1 text-xs text-slate-600">If the fixture is not played by the agreed date, the home team will receive a 5-0 walkover victory.</p>
              {admin.isSuper ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                  <input
                    type="date"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={agreedDates[r.id] ?? ""}
                    onChange={(e) => setAgreedDates((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <input
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="League Secretary note (optional)"
                    value={rejectReasons[r.id] ?? ""}
                    onChange={(e) => setRejectReasons((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-sky-700 px-2.5 py-1 text-xs text-white disabled:opacity-60"
                    onClick={() => void onScheduleFixtureChange(r.id)}
                    disabled={busyId === r.id}
                  >
                    Set agreed date
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-600">Awaiting the Super User to set the agreed date.</p>
              )}
            </article>
          );
        })}
      </div>
      {fixtureChangeReviewed.length > 0 ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Reviewed fixture date requests ({fixtureChangeReviewed.length})</summary>
          <div className="mt-2 space-y-2">
            {fixtureChangeReviewed.slice(0, reviewedLimit).map((r) => {
              const f = fixtureById.get(r.fixture_id);
              const home = f ? teamById.get(f.home_team_id) ?? "Home" : "Home";
              const away = f ? teamById.get(f.away_team_id) ?? "Away" : "Away";
              return (
                <div key={r.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>{home} vs {away} · {requestTypeLabel(r.request_type)}</span>
                    <span className={`rounded-full border px-2 py-0.5 ${statusChipClass(r.status)}`}>{r.status}</span>
                  </div>
                  {r.agreed_fixture_date ? <p className="mt-1 text-slate-600">Agreed date: {new Date(`${r.agreed_fixture_date}T12:00:00`).toLocaleDateString()}</p> : null}
                  {r.review_notes ? <p className="mt-1 text-slate-600">Note: {r.review_notes}</p> : null}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </section>
  );

  const competitionQueueSection = (
    <section className={cardClass}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900">Competition submissions ({competitionPending.length})</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
          Pending {competitionPending.length}
        </span>
      </div>
      {competitionPending.length === 0 ? <p className="text-sm text-slate-600">No pending competition result submissions.</p> : null}
      <div className="mt-3 space-y-3">
        {competitionPending.map((s) => {
          const compName = competitionById.get(s.competition_id) ?? "Competition";
          const match = competitionMatchById.get(s.match_id);
          const detail = s.payload?.mode === "albery"
            ? `Winner: ${s.payload?.winnerSide === "home" ? "Home" : "Away"} · Albery legs entered`
            : `Winner: ${s.payload?.winnerSide === "home" ? "Home" : "Away"} · ${s.payload?.homeScore ?? 0}-${s.payload?.awayScore ?? 0}`;
          return (
            <article key={s.id} className={itemClass}>
              <p className="text-sm font-semibold text-slate-900">{compName}</p>
              <p className="text-sm text-slate-700">{competitionMatchLabel(match)}</p>
              <p className="text-xs text-slate-600">{detail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link href={`/matches/${s.match_id}`} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
                  Open match entry
                </Link>
                {admin.isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs text-white disabled:opacity-60"
                      onClick={() => void onReviewCompetition(s.id, "approved")}
                      disabled={busyId === s.id}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs text-rose-800 disabled:opacity-60"
                      onClick={() => void onReviewCompetition(s.id, "rejected")}
                      disabled={busyId === s.id}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {competitionReviewed.length > 0 ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Reviewed competition submissions ({competitionReviewed.length})</summary>
          <div className="mt-2 space-y-2">
            {competitionReviewed.slice(0, reviewedLimit).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <span>{competitionById.get(s.competition_id) ?? "Competition"}</span>
                <span className={`rounded-full border px-2 py-0.5 ${statusChipClass(s.status)}`}>{s.status}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Results Queue" eyebrow="Results" subtitle="Review captain submissions and history." />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          {admin.isAdmin ? (
            <section className={tintedCardClass}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQueueTab("league")}
                  className={`rounded-full border px-4 py-1.5 text-sm ${queueTab === "league" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  League-Night Submissions ({leaguePendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueTab("competition")}
                  className={`rounded-full border px-4 py-1.5 text-sm ${queueTab === "competition" ? "border-fuchsia-700 bg-fuchsia-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  Competition Submissions ({competitionPendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueTab("fixture_changes")}
                  className={`rounded-full border px-4 py-1.5 text-sm ${queueTab === "fixture_changes" ? "border-indigo-700 bg-indigo-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  Fixture Date Requests ({fixtureChangePendingCount})
                </button>
              </div>
              {queueTab === "league" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_260px]">
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="Search by team or league"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    value={seasonFilter}
                    onChange={(e) => setSeasonFilter(e.target.value)}
                  >
                    <option value="all">All leagues</option>
                    {seasonOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : queueTab === "competition" ? (
                <p className="mt-3 text-sm text-slate-600">Competition result approvals are separated here for knockout cups.</p>
              ) : (
                <p className="mt-3 text-sm text-slate-600">Fixture date requests cover early-play agreements and exceptional later-date requests.</p>
              )}
            </section>
          ) : (
            <section className={tintedCardClass}>
              <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                  placeholder="Search by team or league"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                  value={seasonFilter}
                  onChange={(e) => setSeasonFilter(e.target.value)}
                >
                  <option value="all">All leagues</option>
                  {seasonOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          )}

          {!admin.loading && !admin.isAdmin ? (
            <section className={cardClass}>
              <h2 className="text-xl font-semibold text-slate-900">My submissions</h2>
              <div className="mt-3 space-y-2">
                {filteredMySubmissions.length === 0 ? <p className="text-sm text-slate-600">No submissions yet.</p> : null}
                {filteredMySubmissions.map((s) => {
                  const f = fixtureById.get(s.fixture_id);
                  const home = f ? teamById.get(f.home_team_id) ?? "Home" : "Home";
                  const away = f ? teamById.get(f.away_team_id) ?? "Away" : "Away";
                  const seasonName = f ? seasonById.get(f.season_id) ?? "League" : "League";
                  return (
                    <div key={s.id} className={itemClass}>
                      <p className="text-sm text-slate-600">{seasonName}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xl font-semibold text-slate-900">{home} vs {away}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${statusChipClass(s.status)}`}>{s.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : queueTab === "competition" ? (
            competitionQueueSection
          ) : queueTab === "fixture_changes" ? (
            fixtureChangeQueueSection
          ) : (
            <>
              <section className={cardClass}>
                <h2 className="text-xl font-semibold text-slate-900">Pending approvals ({filteredPending.length})</h2>
                <div className="mt-3 space-y-3">
                  {filteredPending.length === 0 ? <p className="text-sm text-slate-600">No pending submissions.</p> : null}
                  {filteredPending.map((s) => {
                    const f = fixtureById.get(s.fixture_id);
                    const home = f ? teamById.get(f.home_team_id) ?? "Home" : "Home";
                    const away = f ? teamById.get(f.away_team_id) ?? "Away" : "Away";
                    const seasonName = f ? seasonById.get(f.season_id) ?? "League" : "League";
                    const frameRows = [...(s.frame_results ?? [])].sort((a, b) => a.slot_no - b.slot_no);
                    const submittedBreaks = frameRows.flatMap((r) => r.break_entries ?? []);
                    const isExpanded = expandedPending.has(s.id);
                    return (
                      <div key={s.id} className={itemClass}>
                        <p className="text-sm text-slate-600">{seasonName}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xl font-semibold text-slate-900">{home} vs {away}</p>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                            onClick={() =>
                              setExpandedPending((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id);
                                else next.add(s.id);
                                return next;
                              })
                            }
                          >
                            {isExpanded ? "Hide details" : "Show details"}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">Submitted: {new Date(s.created_at).toLocaleString()}</p>

                        {isExpanded ? (
                          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50">
                            <table className="min-w-full border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 text-left text-slate-500">
                                  <th className="px-2 py-1">Frame</th>
                                  <th className="px-2 py-1">Home</th>
                                  <th className="px-2 py-1">Score</th>
                                  <th className="px-2 py-1">Away</th>
                                </tr>
                              </thead>
                              <tbody>
                                {frameRows.map((r) => (
                                  <tr key={`${s.id}-${r.slot_no}`} className="border-b border-slate-100">
                                    <td className="px-2 py-1">{r.slot_type === "doubles" ? `Doubles ${r.slot_no}` : `Singles ${r.slot_no}`}</td>
                                    <td className="px-2 py-1">{playerLabel("home", r)}</td>
                                    <td className="px-2 py-1">{`${typeof r.home_points_scored === "number" ? r.home_points_scored : "-"} - ${typeof r.away_points_scored === "number" ? r.away_points_scored : "-"}`}</td>
                                    <td className="px-2 py-1">{playerLabel("away", r)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        {isExpanded && submittedBreaks.length > 0 ? (
                          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                            <p className="font-medium text-slate-800">Breaks 30+</p>
                            <ul className="mt-1 space-y-1">
                              {submittedBreaks.map((b, idx) => {
                                const playerName = b.player_id ? named(playerById.get(b.player_id)) : b.entered_player_name || "Unknown";
                                return <li key={`${s.id}-break-${idx}`}>{playerName}: {b.break_value}</li>;
                              })}
                            </ul>
                          </div>
                        ) : null}

                        {admin.isSuper ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                            <input
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                              placeholder="Rejection reason (optional)"
                              value={rejectReasons[s.id] ?? ""}
                              onChange={(e) => setRejectReasons((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setConfirmReview({ submissionId: s.id, decision: "approved" })}
                              disabled={busyId === s.id}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmReview({ submissionId: s.id, decision: "rejected" })}
                              disabled={busyId === s.id}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className={cardClass}>
                <h2 className="text-xl font-semibold text-slate-900">Reviewed ({filteredReviewed.length})</h2>
                <div className="mt-3 space-y-2">
                  {filteredReviewed.length === 0 ? <p className="text-sm text-slate-600">No reviewed submissions yet.</p> : null}
                  {filteredReviewed.slice(0, reviewedLimit).map((s) => {
                    const f = fixtureById.get(s.fixture_id);
                    const home = f ? teamById.get(f.home_team_id) ?? "Home" : "Home";
                    const away = f ? teamById.get(f.away_team_id) ?? "Away" : "Away";
                    return (
                      <div key={s.id} className={itemClass}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xl font-semibold text-slate-900">{home} vs {away}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${statusChipClass(s.status)}`}>{s.status}</span>
                        </div>
                        {s.status === "rejected" && s.rejection_reason ? <p className="text-xs text-rose-700">Reason: {s.rejection_reason}</p> : null}
                      </div>
                    );
                  })}
                  {filteredReviewed.length > reviewedLimit ? (
                    <div className="pt-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                        onClick={() => setReviewedLimit((prev) => prev + 20)}
                      >
                        Load 20 more
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          )}
          <ConfirmModal
            open={Boolean(confirmReview)}
            title={confirmReview?.decision === "approved" ? "Approve submission?" : "Reject submission?"}
            description={
              confirmReview?.decision === "approved"
                ? "This will apply the submitted result to League Manager and mark the submission as approved."
                : "This will reject the submission. You can include a reason before confirming."
            }
            confirmLabel={confirmReview?.decision === "approved" ? "Approve" : "Reject"}
            cancelLabel="Cancel"
            onConfirm={() => {
              if (confirmReview) void onReview(confirmReview.submissionId, confirmReview.decision);
              setConfirmReview(null);
            }}
            onCancel={() => setConfirmReview(null)}
          />
        </RequireAuth>
      </div>
    </main>
  );
}

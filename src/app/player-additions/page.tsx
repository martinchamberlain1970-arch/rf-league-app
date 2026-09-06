"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import InfoModal from "@/components/InfoModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";

type Season = { id: string; name: string; registrationDeadline: string };
type Team = { id: string; season_id: string; location_id: string | null; name: string };
type Candidate = { id: string; full_name: string | null; display_name: string; location_id: string | null };
type AdditionRequest = {
  id: string;
  season_id: string;
  team_id: string;
  requester_user_id: string;
  requested_full_name: string;
  status: "pending" | "approved" | "rejected";
  resolved_player_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

function playerName(player: Candidate) {
  return player.full_name?.trim() || player.display_name;
}

export default function PlayerAdditionsPage() {
  const admin = useAdminStatus();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title: string; description: string } | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [requests, setRequests] = useState<AdditionRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [teamId, setTeamId] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedPlayerByRequest, setSelectedPlayerByRequest] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = async () => {
    const client = supabase;
    if (!client) return setMessage("Supabase is not configured.");
    setLoading(true);
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }
    const response = await fetch("/api/league/player-additions", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setMessage(payload.error ?? "Player additions could not be loaded.");
    setIsManager(Boolean(payload.isManager));
    setLinkedPlayerId(payload.linkedPlayerId ?? null);
    setSeasons(payload.seasons ?? []);
    setTeams(payload.teams ?? []);
    setRequests(payload.requests ?? []);
    setCandidates(payload.candidates ?? []);
    if (!teamId && (payload.teams ?? []).length === 1) setTeamId(payload.teams[0].id);
  };

  useEffect(() => {
    if (!admin.loading) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.loading]);

  const seasonById = useMemo(() => new Map(seasons.map((season) => [season.id, season])), [seasons]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const captainTeams = useMemo(() => isManager ? [] : teams, [isManager, teams]);
  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);
  const previousRequests = useMemo(() => requests.filter((request) => request.status !== "pending"), [requests]);

  const submitRequest = async () => {
    const client = supabase;
    if (!client) return;
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) return setMessage("Please sign in again.");
    setBusyId("new");
    const response = await fetch("/api/league/player-additions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ teamId, fullName }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);
    if (!response.ok) return setMessage(payload.error ?? "Player addition could not be submitted.");
    setFullName("");
    setInfo({ title: "Player addition submitted", description: "The League Secretary or Chairman can now check the player and approve the addition to your current season roster." });
    await loadAll();
  };

  const reviewRequest = async (request: AdditionRequest, action: "approve" | "reject") => {
    const client = supabase;
    if (!client) return;
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) return setMessage("Please sign in again.");
    setBusyId(request.id);
    const response = await fetch("/api/league/player-additions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId: request.id, action, playerId: selectedPlayerByRequest[request.id] || null }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);
    if (!response.ok) return setMessage(payload.error ?? "Player addition could not be reviewed.");
    const team = teamById.get(request.team_id);
    setInfo({
      title: action === "approve" ? "Player added to roster" : "Player request rejected",
      description: action === "approve"
        ? `${request.requested_full_name} now appears on ${team?.name ?? "the team's"} current season roster.`
        : `${request.requested_full_name}'s request has been rejected and remains in the audit history.`,
    });
    await loadAll();
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Player Additions" eyebrow="League" subtitle="Captains and vice-captains can request new players up to and including 31 December. A league officer checks every request before the live team roster changes." />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          <InfoModal open={Boolean(info)} title={info?.title ?? ""} description={info?.description ?? ""} onClose={() => setInfo(null)} />

          {loading ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">Loading player additions…</section> : null}

          {!loading && !isManager ? (
            <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-white to-teal-50 p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Request a player for your team</h2>
              <p className="mt-1 text-sm text-slate-600">Enter the player’s full name. This does not add them immediately: the League Secretary or Chairman will check for an existing profile and approve the correct record.</p>
              {!linkedPlayerId ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your account must first be linked to your captain or vice-captain player profile.</p> : null}
              {linkedPlayerId && captainTeams.length === 0 ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your linked profile is not currently marked as captain or vice-captain of an active league team.</p> : null}
              {captainTeams.length > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(260px,2fr)_auto]">
                <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Select team</option>
                  {captainTeams.map((team) => <option key={team.id} value={team.id}>{team.name} · {seasonById.get(team.season_id)?.name ?? "League"}</option>)}
                </select>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Player's full first and second name" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" />
                <button type="button" onClick={() => void submitRequest()} disabled={busyId === "new" || !teamId || !fullName.trim()} className="rounded-xl bg-teal-800 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busyId === "new" ? "Submitting…" : "Submit for approval"}</button>
              </div> : null}
              {teamId ? <p className="mt-3 text-xs text-slate-600">Deadline: {new Date(seasonById.get(teamById.get(teamId)?.season_id ?? "")?.registrationDeadline ?? "").toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}.</p> : null}
            </section>
          ) : null}

          {!loading && isManager ? (
            <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">Awaiting league-officer review</h2><p className="mt-1 text-sm text-slate-600">Link to an existing club profile where appropriate, or leave “Create a new profile” selected.</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-bold text-amber-900">{pendingRequests.length} pending</span></div>
              <div className="mt-4 space-y-3">
                {pendingRequests.map((request) => {
                  const team = teamById.get(request.team_id);
                  const clubCandidates = candidates.filter((candidate) => candidate.location_id === team?.location_id);
                  return <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{request.requested_full_name}</p><p className="text-sm text-slate-600">{team?.name ?? "Team"} · {seasonById.get(request.season_id)?.name ?? "League"}</p><p className="mt-1 text-xs text-slate-500">Submitted {new Date(request.created_at).toLocaleString("en-GB")}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Pending</span></div>
                    <label className="mt-3 block text-sm font-semibold text-slate-800">Profile decision<select value={selectedPlayerByRequest[request.id] ?? ""} onChange={(event) => setSelectedPlayerByRequest((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal"><option value="">Create a new profile (unless an exact club match is found)</option>{clubCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>Use existing: {playerName(candidate)}</option>)}</select></label>
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void reviewRequest(request, "approve")} disabled={busyId === request.id} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve and add to roster</button><button type="button" onClick={() => void reviewRequest(request, "reject")} disabled={busyId === request.id} className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800 disabled:opacity-50">Reject</button></div>
                  </article>;
                })}
                {pendingRequests.length === 0 ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">No player additions are awaiting review.</p> : null}
              </div>
            </section>
          ) : null}

          {!loading && requests.length > 0 ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-950">Request history</h2><div className="mt-3 space-y-2">{(isManager ? previousRequests : requests).map((request) => <div key={`history-${request.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><span><strong>{request.requested_full_name}</strong> · {teamById.get(request.team_id)?.name ?? "Team"}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${request.status === "approved" ? "bg-emerald-100 text-emerald-800" : request.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{request.status === "pending" ? "Awaiting review" : request.status}</span></div>)}</div></section> : null}
        </RequireAuth>
      </div>
    </main>
  );
}

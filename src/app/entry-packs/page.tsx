"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import type { LeagueEntryPackPlayer } from "@/lib/league-entry-pack";

type PackRow = {
  id: string;
  public_token: string;
  season_id: string;
  team_id: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  players?: LeagueEntryPackPlayer[] | null;
  competition_notes?: string | null;
  general_notes?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  updated_at: string;
};
type Season = { id: string; name: string; is_published?: boolean | null; is_active?: boolean | null };
type Team = { id: string; season_id: string; location_id?: string | null; name: string; is_active?: boolean | null };
type Location = { id: string; name: string };

export default function EntryPacksPage() {
  const admin = useAdminStatus();
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const request = async (body?: Record<string, unknown>) => {
    const client = supabase;
    if (!client) throw new Error("Supabase is not configured.");
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");
    const response = await fetch("/api/league/entry-packs", {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error ?? "Team-registration request failed.");
    return result;
  };

  const load = async () => {
    try {
      const result = await request();
      setPacks((result.packs ?? []) as PackRow[]);
      setSeasons((result.seasons ?? []) as Season[]);
      setTeams((result.teams ?? []) as Team[]);
      setLocations((result.locations ?? []) as Location[]);
      const firstSeason = seasonId && result.seasons?.some((season: Season) => season.id === seasonId) ? seasonId : result.seasons?.[0]?.id || "";
      setSeasonId(firstSeason);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load team registrations.");
    }
  };

  useEffect(() => {
    if (!admin.loading && admin.canManageLeague) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.loading, admin.canManageLeague]);

  const seasonName = useMemo(() => new Map(seasons.map((season) => [season.id, season.name])), [seasons]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const locationName = useMemo(() => new Map(locations.map((location) => [location.id, location.name])), [locations]);
  const packByTeamId = useMemo(() => new Map(packs.map((pack) => [pack.team_id, pack])), [packs]);
  const availableTeams = teams.filter((team) => team.season_id === seasonId && team.is_active !== false);

  const act = async (pack: PackRow, action: "approve" | "reject" | "rotate") => {
    let reviewNotes = "";
    if (action === "reject") {
      reviewNotes = window.prompt("Explain what the team must correct:", pack.review_notes ?? "")?.trim() ?? "";
      if (!reviewNotes) return;
    }
    if (action === "approve" && !window.confirm(`Approve and import ${teamById.get(pack.team_id)?.name ?? "this team"}'s league roster?`)) return;
    if (action === "rotate" && !window.confirm("Reset this team’s browser access? Their currently saved link/browser will stop working, but their draft data will be retained.")) return;
    setBusyId(pack.id);
    try {
      await request({ action, packId: pack.id, reviewNotes });
      setNotice(action === "approve" ? "Team registration approved and imported." : action === "reject" ? "Team registration returned for correction." : "Team registration browser access reset.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Team-registration action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const statusClass = (status: PackRow["status"] | "not_started") =>
    status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
      status === "submitted" ? "border-amber-200 bg-amber-50 text-amber-900" :
        status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800" : status === "draft" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="League Team Registrations" eyebrow="League Administration" subtitle="Track which teams have registered their players and roles, then review and import submitted rosters." />
          {!admin.loading && !admin.canManageLeague ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">League Secretary or Chairman access is required.</section> : null}
          {admin.canManageLeague ? <>
            <MessageModal message={message} onClose={() => setMessage(null)} />
            {notice ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"><div className="flex items-center justify-between gap-3"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="text-sm font-bold">Dismiss</button></div></section> : null}

            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">How team registration works</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-800">
                <li>Send the same public league-registration URL to every team.</li>
                <li>The team selects its league and team name, then records all players, exactly one captain and exactly one vice-captain.</li>
                <li>No private match-arranging telephone numbers or emails are collected through league registration.</li>
                <li>When submitted, check names carefully. Approval matches historic profiles, creates missing players and builds the league roster.</li>
                <li>Captain and vice-captain access is account-based. They will receive a guide covering team access, line-ups, fixture completion and results.</li>
                <li>Competition entries and competition contact details are collected separately.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">One public registration URL</h2>
              <p className="mt-1 text-sm text-slate-600">Copy and send this same address to every captain or team secretary.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly value={typeof window !== "undefined" ? `${window.location.origin}/league-entry` : "/league-entry"} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm" /><button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/league-entry`).then(() => setNotice("League-registration URL copied."))} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Copy URL</button><a href="/league-entry" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700">Open form</a></div>
            </section>

            {seasons.length === 0 ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">There are no open leagues available for team registration. Completed leagues and leagues with fixtures already in progress or complete are excluded.</section> : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">Team registration status</h2><p className="text-sm text-slate-600">Teams appear here because they have already been added to the league.</p></div><select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></div>
              <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Teams</p><p className="mt-1 text-2xl font-black">{availableTeams.length}</p></div><div className="rounded-xl border border-sky-200 bg-sky-50 p-3"><p className="text-xs font-bold uppercase text-sky-700">Started</p><p className="mt-1 text-2xl font-black text-sky-900">{availableTeams.filter((team) => { const pack = packByTeamId.get(team.id); return Boolean(pack && ["draft", "rejected"].includes(pack.status) && Array.isArray(pack.players) && pack.players.length > 0); }).length}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold uppercase text-amber-700">Awaiting review</p><p className="mt-1 text-2xl font-black text-amber-900">{availableTeams.filter((team) => packByTeamId.get(team.id)?.status === "submitted").length}</p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-bold uppercase text-emerald-700">Approved</p><p className="mt-1 text-2xl font-black text-emerald-900">{availableTeams.filter((team) => packByTeamId.get(team.id)?.status === "approved").length}</p></div></div>
              {availableTeams.map((team) => {
                const pack = packByTeamId.get(team.id);
                const players = Array.isArray(pack?.players) ? pack.players : [];
                const status = pack && (pack.status !== "draft" || players.length > 0) ? pack.status : "not_started";
                return <article key={team.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-bold text-slate-950">{team.name}</p><p className="text-sm text-slate-600">{seasonName.get(team.season_id) ?? "Unknown season"}{team.location_id ? ` · ${locationName.get(team.location_id) ?? "Club"}` : ""}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusClass(status)}`}>{status.replace("_", " ")}</span></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Players registered</p><p className="mt-1 text-2xl font-black text-slate-950">{players.length}</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last updated</p><p className="mt-1 text-sm font-bold text-slate-950">{pack ? new Date(pack.updated_at).toLocaleString() : "Not started"}</p></div></div>
                  {players.length > 0 ? <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-800">Review registered players and roles</summary><div className="mt-3 space-y-2">{players.map((player) => <div key={player.rowId} className="rounded-lg bg-white p-3 text-sm text-slate-700"><p className="font-bold text-slate-950">{player.fullName}{player.isCaptain ? " · Captain" : ""}{player.isViceCaptain ? " · Vice-captain" : ""}</p></div>)}</div>{pack?.general_notes ? <p className="mt-2 rounded-lg bg-white p-3 text-sm text-slate-700"><strong>Other notes:</strong> {pack.general_notes}</p> : null}</details> : null}
                  {pack?.status === "submitted" ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busyId === pack.id} onClick={() => void act(pack, "approve")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve and import</button><button type="button" disabled={busyId === pack.id} onClick={() => void act(pack, "reject")} className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800 disabled:opacity-50">Return for correction</button></div> : null}
                  {pack && (pack.status === "draft" || pack.status === "rejected") ? <button type="button" disabled={busyId === pack.id} onClick={() => void act(pack, "rotate")} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Reset browser access</button> : null}
                  {pack?.review_notes ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Review note:</strong> {pack.review_notes}</p> : null}
                </article>;
              })}
            </section>
          </> : null}
        </RequireAuth>
      </div>
    </main>
  );
}

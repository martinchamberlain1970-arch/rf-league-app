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
type Competition = { id: string; name: string; match_mode: string };

export default function EntryPacksPage() {
  const admin = useAdminStatus();
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
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
    if (!response.ok) throw new Error(result?.error ?? "Entry-pack request failed.");
    return result;
  };

  const load = async () => {
    try {
      const result = await request();
      setPacks((result.packs ?? []) as PackRow[]);
      setSeasons((result.seasons ?? []) as Season[]);
      setTeams((result.teams ?? []) as Team[]);
      setLocations((result.locations ?? []) as Location[]);
      setCompetitions((result.competitions ?? []) as Competition[]);
      const firstSeason = seasonId && result.seasons?.some((season: Season) => season.id === seasonId) ? seasonId : result.seasons?.[0]?.id || "";
      setSeasonId(firstSeason);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load entry packs.");
    }
  };

  useEffect(() => {
    if (!admin.loading && admin.canManageLeague) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.loading, admin.canManageLeague]);

  useEffect(() => {
    if (teamId && !teams.some((team) => team.id === teamId && team.season_id === seasonId)) setTeamId("");
  }, [seasonId, teamId, teams]);

  const seasonName = useMemo(() => new Map(seasons.map((season) => [season.id, season.name])), [seasons]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const locationName = useMemo(() => new Map(locations.map((location) => [location.id, location.name])), [locations]);
  const competitionName = useMemo(() => new Map(competitions.map((competition) => [competition.id, competition.name])), [competitions]);
  const availableTeams = teams.filter((team) => team.season_id === seasonId && team.is_active !== false);

  const publicUrl = (pack: PackRow) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/entry-pack/${pack.public_token}`;
  };

  const generate = async () => {
    if (!seasonId || !teamId) return setMessage("Select a season and team first.");
    setBusyId("create");
    try {
      await request({ action: "create", seasonId, teamId });
      setNotice("Private team entry-pack link generated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate entry pack.");
    } finally {
      setBusyId(null);
    }
  };

  const act = async (pack: PackRow, action: "approve" | "reject" | "rotate") => {
    let reviewNotes = "";
    if (action === "reject") {
      reviewNotes = window.prompt("Explain what the team must correct:", pack.review_notes ?? "")?.trim() ?? "";
      if (!reviewNotes) return;
    }
    if (action === "approve" && !window.confirm(`Approve and import ${teamById.get(pack.team_id)?.name ?? "this team"}'s roster and competition entries?`)) return;
    if (action === "rotate" && !window.confirm("Replace this private link? The old link will stop working immediately.")) return;
    setBusyId(pack.id);
    try {
      await request({ action, packId: pack.id, reviewNotes });
      setNotice(action === "approve" ? "Entry pack approved and imported." : action === "reject" ? "Entry pack returned for correction." : "Private link replaced.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Entry-pack action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const statusClass = (status: PackRow["status"]) =>
    status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
      status === "submitted" ? "border-amber-200 bg-amber-50 text-amber-900" :
        status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Team Entry Packs" eyebrow="League Administration" subtitle="Issue private public links, review team rosters, and import players and cup entries." />
          {!admin.loading && !admin.canManageLeague ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">League Secretary or Chairman access is required.</section> : null}
          {admin.canManageLeague ? <>
            <MessageModal message={message} onClose={() => setMessage(null)} />
            {notice ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"><div className="flex items-center justify-between gap-3"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="text-sm font-bold">Dismiss</button></div></section> : null}

            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">How to use entry packs</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-800">
                <li>Create the winter league team first, then generate its private link below.</li>
                <li>Copy the link to the team secretary or captain. They do not need a Rack &amp; Frame account.</li>
                <li>The team saves a draft while collecting every player’s required match telephone number and cup selections.</li>
                <li>When submitted, check names carefully. Approval matches historic profiles, creates missing players, builds the team roster and imports cup interests.</li>
                <li>For doubles and triples, use the submitted pairing notes to confirm the final combinations before making the draw.</li>
                <li>If a link is forwarded incorrectly, rotate it; the old link stops working immediately.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Generate a team link</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Select open league</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select>
                <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Select team</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.location_id ? ` · ${locationName.get(team.location_id) ?? "Club"}` : ""}</option>)}</select>
                <button type="button" disabled={busyId === "create" || !seasonId || !teamId} onClick={() => void generate()} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === "create" ? "Generating…" : "Generate private link"}</button>
              </div>
            </section>

            {seasons.length === 0 ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">There are no open leagues available for team entry packs. Create the new league first; completed leagues and leagues with fixtures already in progress or complete are excluded.</section> : null}

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-950">Issued packs</h2><span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">{packs.length}</span></div>
              {packs.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No team entry packs have been generated.</div> : null}
              {packs.map((pack) => {
                const team = teamById.get(pack.team_id);
                const players = Array.isArray(pack.players) ? pack.players : [];
                return <article key={pack.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-bold text-slate-950">{team?.name ?? "Unknown team"}</p><p className="text-sm text-slate-600">{seasonName.get(pack.season_id) ?? "Unknown season"}{team?.location_id ? ` · ${locationName.get(team.location_id) ?? "Club"}` : ""}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusClass(pack.status)}`}>{pack.status}</span></div>
                  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center"><input readOnly value={publicUrl(pack)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700" /><button type="button" onClick={() => void navigator.clipboard.writeText(publicUrl(pack)).then(() => setNotice("Private link copied."))} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Copy link</button><a href={publicUrl(pack)} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-bold text-slate-700">Open</a><button type="button" disabled={busyId === pack.id} onClick={() => void act(pack, "rotate")} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700">Replace link</button></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Players</p><p className="mt-1 text-2xl font-black text-slate-950">{players.length}</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cup selections</p><p className="mt-1 text-2xl font-black text-slate-950">{players.reduce((sum, player) => sum + (player.competitionIds?.length ?? 0), 0)}</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last updated</p><p className="mt-1 text-sm font-bold text-slate-950">{new Date(pack.updated_at).toLocaleString()}</p></div></div>
                  {pack.contact_name ? <p className="mt-3 text-sm text-slate-700"><strong>Submitted by:</strong> {pack.contact_name} · {pack.contact_phone}{pack.contact_email ? ` · ${pack.contact_email}` : ""}</p> : null}
                  {players.length > 0 ? <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-800">Review roster and private contact details</summary><div className="mt-3 space-y-2">{players.map((player) => <div key={player.rowId} className="rounded-lg bg-white p-3 text-sm text-slate-700"><p className="font-bold text-slate-950">{player.fullName}{player.isCaptain ? " · Captain" : ""}{player.isViceCaptain ? " · Vice-captain" : ""}{player.isJunior ? ` · Junior (${player.juniorAgeBand?.replaceAll("_", "–") || "age band missing"})` : ""}</p><p>{player.phoneNumber}{player.email ? ` · ${player.email}` : ""}</p>{player.isJunior ? <p className="text-xs text-amber-800">Guardian: {player.guardianName} · {player.guardianPhone}</p> : null}<p className="mt-1 text-xs text-slate-500">{player.competitionIds?.length ? player.competitionIds.map((id) => competitionName.get(id) ?? "Unavailable competition").join(" · ") : "No cup selections"}</p></div>)}</div>{pack.competition_notes ? <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700"><strong>Pairings/teams:</strong> {pack.competition_notes}</p> : null}{pack.general_notes ? <p className="mt-2 rounded-lg bg-white p-3 text-sm text-slate-700"><strong>Other notes:</strong> {pack.general_notes}</p> : null}</details> : null}
                  {pack.status === "submitted" ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busyId === pack.id} onClick={() => void act(pack, "approve")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve and import</button><button type="button" disabled={busyId === pack.id} onClick={() => void act(pack, "reject")} className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800 disabled:opacity-50">Return for correction</button></div> : null}
                  {pack.review_notes ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Review note:</strong> {pack.review_notes}</p> : null}
                </article>;
              })}
            </section>
          </> : null}
        </RequireAuth>
      </div>
    </main>
  );
}

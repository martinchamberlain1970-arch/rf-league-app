"use client";

import { useEffect, useMemo, useState } from "react";

type Season = { id: string; name: string };
type Team = {
  id: string;
  seasonId: string;
  name: string;
  locationName: string;
  registrationStatus: "not_started" | "draft" | "submitted" | "approved" | "rejected";
};

const makeToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");

export default function SharedLeagueEntryPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/public/league-registration", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      setLoading(false);
      if (!response.ok) return setError(result.error ?? "League registration could not be loaded.");
      setSeasons(result.seasons ?? []);
      setTeams(result.teams ?? []);
      if ((result.seasons ?? []).length === 1) setSeasonId(result.seasons[0].id);
    };
    void load();
  }, []);

  const availableTeams = useMemo(() => teams.filter((team) => !seasonId || team.seasonId === seasonId), [teams, seasonId]);
  const selectedTeam = teams.find((team) => team.id === teamId);

  const openRegistration = async () => {
    if (!teamId) return setError("Select your team first.");
    setBusy(true); setError("");
    const storageKey = `rf-league-registration-token:${teamId}`;
    const draftToken = localStorage.getItem(storageKey) || makeToken();
    localStorage.setItem(storageKey, draftToken);
    const response = await fetch("/api/public/league-registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, draftToken }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "The team registration could not be opened.");
    window.location.assign(result.entryUrl);
  };

  return <main className="min-h-screen bg-slate-100 p-3 sm:p-6"><div className="mx-auto max-w-4xl space-y-4">
    <header className="rounded-3xl bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-teal-300">Rack &amp; Frame · Winter League</p>
      <h1 className="mt-2 text-3xl font-black">League Team Registration</h1>
      <p className="mt-2 text-slate-300">One form for every team. Select your league and team to register the captain, vice-captain and playing squad.</p>
    </header>

    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-slate-800">
      <h2 className="text-lg font-bold text-slate-950">Before you start</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>No Rack &amp; Frame account is required to complete this registration.</li>
        <li>Add every player and select exactly one captain. A vice-captain is optional.</li>
        <li>No telephone numbers or private match-arranging contact details are collected here.</li>
        <li>The captain and vice-captain will later receive team access for line-ups, fixture completion and results. A separate guide will be supplied.</li>
        <li>Competition entries and competition contact details use the separate competition-entry form.</li>
      </ul>
    </section>

    {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-4 font-semibold text-rose-900">{error}</section> : null}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">Select your team</h2>
      {loading ? <p className="mt-3 text-slate-600">Loading open leagues…</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">League<select value={seasonId} onChange={(event) => { setSeasonId(event.target.value); setTeamId(""); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"><option value="">Select league…</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-700">Team<select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"><option value="">Select team…</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.locationName}</option>)}</select></label>
      </div>}
      {selectedTeam ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Current registration status: <strong className="capitalize">{selectedTeam.registrationStatus.replace("_", " ")}</strong></p> : null}
      <button type="button" disabled={loading || busy || !teamId} onClick={() => void openRegistration()} className="mt-4 rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Opening…" : "Continue to team registration"}</button>
    </section>
  </div></main>;
}


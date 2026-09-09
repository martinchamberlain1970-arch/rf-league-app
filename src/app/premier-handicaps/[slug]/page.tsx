"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Representative = { id: string; name: string; role: string };
type Player = { id: string; name: string; handicap: number };
type Team = {
  id: string;
  name: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  players: Player[];
  representatives: Representative[];
};
type Round = {
  title: string;
  statement: string;
  is_open: boolean;
  snapshot_at: string;
};

function handicapLabel(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default function PremierHandicapsPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState("");
  const [round, setRound] = useState<Round | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [representativePlayerId, setRepresentativePlayerId] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedTeam, setSubmittedTeam] = useState("");

  useEffect(() => {
    let active = true;
    void params
      .then(async ({ slug: resolvedSlug }) => {
        if (!active) return;
        setSlug(resolvedSlug);
        const response = await fetch(`/api/public/premier-handicaps/${encodeURIComponent(resolvedSlug)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "The handicap list could not be loaded.");
        if (!active) return;
        setRound(payload.round);
        setTeams(payload.teams ?? []);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "The handicap list could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [params]);

  const selectedTeam = useMemo(() => teams.find((team) => team.id === teamId) ?? null, [teamId, teams]);
  const confirmedCount = teams.filter((team) => team.confirmedAt).length;
  const availableTeams = teams.filter((team) => !team.confirmedAt);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/public/premier-handicaps/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, representativePlayerId, agreed, website: "" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The confirmation could not be submitted.");
      setSubmittedTeam(payload.teamName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The confirmation could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><p className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow-sm">Loading Premier League handicaps…</p></main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 p-6 text-white shadow-xl sm:p-9">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">Rack &amp; Frame · Pre-season confirmation</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">{round?.title ?? "Premier League Handicaps"}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-200">The restored pre-season handicaps adopted under Proposal 2. This is the fixed list captains and vice-captains are being asked to check before the season begins.</p>
        </header>

        {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-900">{error}</section> : null}

        {submittedTeam ? (
          <section className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Confirmation received</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Thank you</h2>
            <p className="mt-3 leading-7 text-slate-700"><strong>{submittedTeam}</strong> has confirmed that its published players and handicaps have been checked.</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">If you later identify a factual error, contact the League Secretary directly. Do not submit another response.</p>
          </section>
        ) : round ? (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-950">What you need to check</h2>
                  <p className="mt-2 max-w-3xl leading-7 text-slate-700">Check that the players shown for your team are correct and that their restored handicap values have been recorded accurately.</p>
                </div>
                <span className="rounded-full bg-teal-50 px-4 py-2 text-sm font-black text-teal-800">{confirmedCount} of {teams.length} teams confirmed</span>
              </div>
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <strong>Errors only:</strong> this is not a further vote or an opportunity to propose different handicap values. If a player, team or restored value appears factually incorrect, contact the League Secretary before confirming.
              </div>
              <p className="mt-4 text-xs text-slate-500">Snapshot taken {new Date(round.snapshot_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}. These figures will not change on this page when later results are entered.</p>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => (
                <article key={team.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <h2 className="text-lg font-black text-slate-950">{team.name}</h2>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${team.confirmedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{team.confirmedAt ? "Confirmed" : "Awaiting check"}</span>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead><tr className="text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3">Player</th><th className="px-5 py-3 text-right">Handicap</th></tr></thead>
                    <tbody>
                      {team.players.map((player) => <tr key={player.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold text-slate-800">{player.name}</td><td className="px-5 py-3 text-right text-lg font-black text-teal-800">{handicapLabel(player.handicap)}</td></tr>)}
                    </tbody>
                  </table>
                  {team.confirmedAt ? <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Confirmed by {team.confirmedBy} on {new Date(team.confirmedAt).toLocaleString("en-GB")}</p> : null}
                </article>
              ))}
            </section>

            {round.is_open && availableTeams.length ? (
              <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-950">Confirm for your team</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Only the registered captain or vice-captain can submit. One confirmation is accepted per team.</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="team" className="block font-bold text-slate-900">Premier League team</label>
                    <select id="team" value={teamId} onChange={(event) => { setTeamId(event.target.value); setRepresentativePlayerId(""); }} required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
                      <option value="">Select your team</option>
                      {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="representative" className="block font-bold text-slate-900">Captain or vice-captain</label>
                    <select id="representative" value={representativePlayerId} onChange={(event) => setRepresentativePlayerId(event.target.value)} required disabled={!selectedTeam} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-100">
                      <option value="">{selectedTeam ? "Select your name" : "Select a team first"}</option>
                      {selectedTeam?.representatives.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
                    </select>
                    {selectedTeam && selectedTeam.representatives.length === 0 ? <p className="mt-2 text-sm text-rose-700">No captain or vice-captain is recorded for this team. Contact the League Secretary.</p> : null}
                  </div>
                </div>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold leading-6 text-slate-800">
                  <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} required className="mt-1 h-5 w-5 shrink-0" />
                  <span>{round.statement}</span>
                </label>
                <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                <button type="submit" disabled={busy || !teamId || !representativePlayerId || !agreed} className="w-full rounded-xl bg-teal-700 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Recording confirmation…" : "Confirm team handicap list"}</button>
              </form>
            ) : (
              <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 font-semibold text-emerald-950">{availableTeams.length === 0 ? "All Premier League teams have confirmed the published list." : "Team confirmations are now closed."}</section>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}

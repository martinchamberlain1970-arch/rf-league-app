"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import CompetitionMatchScorecard from "@/components/CompetitionMatchScorecard";
import { emptyAdminState } from "@/lib/admin-status-controller";

type Option = { id: string; name: string };
type Selection = { token: string; matchId?: string };
const optionsUrl = "/api/public/competition-scorecard-options";

export default function CompetitionScorecardPicker() {
  const [initialising, setInitialising] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [competitions, setCompetitions] = useState<Option[]>([]);
  const [fixtures, setFixtures] = useState<Option[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [code, setCode] = useState("");
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (token) {
      setSelection({ token });
      setInitialising(false);
      return;
    }
    const controller = new AbortController();
    fetch(optionsUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCompetitions(data.competitions);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Competitions could not be loaded. Refresh to try again."); })
      .finally(() => { if (!controller.signal.aborted) setInitialising(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!competitionId) return;
    const controller = new AbortController();
    fetch(`${optionsUrl}?competitionId=${encodeURIComponent(competitionId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setFixtures(data.fixtures);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Fixtures could not be loaded. Choose the competition again to retry."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingFixtures(false); });
    return () => controller.abort();
  }, [competitionId]);

  const openGuest = (event: FormEvent) => {
    event.preventDefault();
    if (!matchId || !code.trim()) return;
    setSelection({ token: code.trim(), matchId });
  };

  if (selection) {
    return (
      <CompetitionMatchScorecard guest guestToken={selection.token} requestedMatchId={selection.matchId} admin={emptyAdminState} />
    );
  }

  const inputClass = "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base";
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-sm font-semibold text-teal-200">Rack &amp; Frame</p>
          <h1 className="mt-1 text-2xl font-bold">Submit a competition result</h1>
          <p className="mt-1 text-sm text-slate-200">Choose your competition and fixture.</p>
        </header>
        <form onSubmit={openGuest} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <label className="block text-sm font-semibold">
            Competition
            <select className={inputClass} disabled={initialising} value={competitionId} onChange={(event) => {
              const next = event.target.value;
              setCompetitionId(next);
              setMatchId("");
              setCode("");
              setFixtures([]);
              setError("");
              setLoadingFixtures(Boolean(next));
            }}>
              <option value="">{initialising ? "Loading competitions…" : "Select competition"}</option>
              {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Fixture
            <select className={inputClass} disabled={!competitionId || loadingFixtures || !fixtures.length} value={matchId} onChange={(event) => setMatchId(event.target.value)}>
              <option value="">{loadingFixtures ? "Loading fixtures…" : "Select fixture"}</option>
              {fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.name}</option>)}
            </select>
          </label>
          {competitionId && !loadingFixtures && !fixtures.length && !error ? <p className="text-sm text-slate-600" role="status">There are no fixtures ready to score in this competition.</p> : null}
          {error ? <p className="text-sm text-rose-800" role="alert">{error}</p> : null}
          {matchId ? (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <Link href={`/matches/${matchId}`} className="inline-block rounded-xl border border-teal-300 px-3 py-2 text-sm font-semibold text-teal-900">Use my Rack &amp; Frame account</Link>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">
                  Private scorecard code
                  <input className={inputClass} value={code} onChange={(event) => setCode(event.target.value)} maxLength={64} autoComplete="off" autoCapitalize="none" spellCheck={false} />
                </label>
                <p className="text-sm text-slate-600">If you don’t have an account, ask a league officer for your match code.</p>
                <button type="submit" disabled={!code.trim()} className="rounded-xl bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Open scorecard</button>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}

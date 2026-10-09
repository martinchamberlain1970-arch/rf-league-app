"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";

type OutstandingFixture = {
  id: string;
  seasonId: string;
  season: string;
  date: string;
  home: string;
  away: string;
  status: "ready_to_submit" | "needs_scorecard_check" | "awaiting_scores" | "awaiting_lineup";
  completed: number;
  expected: number;
  missingLineup: string | null;
  detail: string | null;
  lastSaved?: { at: string; by: string | null } | null;
  reminderAttemptedAt?: string | null;
};

const statusLabel: Record<OutstandingFixture["status"], string> = {
  ready_to_submit: "All frames saved · not submitted",
  needs_scorecard_check: "Scorecard needs checking",
  awaiting_scores: "Awaiting scores",
  awaiting_lineup: "Awaiting line-up",
};

const statusStyle: Record<OutstandingFixture["status"], string> = {
  ready_to_submit: "border-rose-200 bg-rose-50 text-rose-800",
  needs_scorecard_check: "border-amber-200 bg-amber-50 text-amber-900",
  awaiting_scores: "border-sky-200 bg-sky-50 text-sky-900",
  awaiting_lineup: "border-slate-200 bg-slate-100 text-slate-700",
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(`${value}T12:00:00Z`));
}

function displayTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(value));
}

function OutstandingScorecardsContent() {
  const admin = useAdminStatus();
  const [fixtures, setFixtures] = useState<OutstandingFixture[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const client = supabase;
    if (!client) { setError("The league connection is unavailable."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const session = await client.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please sign in again to review scorecards.");
      const response = await fetch("/api/league/outstanding-scorecards", {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load outstanding scorecards.");
      setFixtures(body.fixtures ?? []);
      setAsOf(body.asOf ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load outstanding scorecards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin.loading && admin.canManageLeague) void load();
    if (!admin.loading && !admin.canManageLeague) setLoading(false);
  }, [admin.loading, admin.canManageLeague, load]);

  const seasons = useMemo(() => [...new Set(fixtures.map((fixture) => fixture.season))], [fixtures]);
  const visible = useMemo(() => fixtures.filter((fixture) => filter === "all" || fixture.season === filter), [fixtures, filter]);
  const ready = visible.filter((fixture) => fixture.status === "ready_to_submit");
  const other = visible.filter((fixture) => fixture.status !== "ready_to_submit");

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6">
      <ScreenHeader
        title="Outstanding scorecards"
        eyebrow="League administration"
        subtitle="Due fixtures that have not reached the results approval queue. A saved final frame does not submit or approve a match."
        actions={<button type="button" onClick={() => void load()} disabled={loading || !admin.canManageLeague} className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-900 hover:bg-teal-100 disabled:opacity-50">Refresh</button>}
      />
      {!admin.loading && !admin.canManageLeague ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">League officer access is required.</section>
      ) : error ? (
        <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">{error}</section>
      ) : loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">Checking active leagues and saved scorecards…</section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Current snapshot</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{ready.length} completed but not submitted · {other.length} other outstanding</h2>
                <p className="mt-1 text-sm text-slate-600">Active, published league fixtures due by today. Submitted results awaiting approval are in <Link href="/results" className="font-semibold text-teal-700 underline">Results & approvals</Link>.</p>
                {asOf ? <p className="mt-1 text-xs text-slate-500">Checked {displayTime(asOf)} · refresh to check again</p> : null}
              </div>
              {seasons.length > 1 ? <label className="text-sm font-semibold text-slate-700">League
                <select value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-1 block max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                  <option value="all">All active leagues</option>
                  {seasons.map((season) => <option key={season} value={season}>{season}</option>)}
                </select>
              </label> : null}
            </div>
          </section>
          {visible.length === 0 ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">No outstanding scorecards for this selection.</section> : null}
          {ready.length > 0 ? <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-950">Completed frames needing final submission</h2>
            {ready.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} />)}
          </section> : null}
          {other.length > 0 ? <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-950">Other due fixtures to check</h2>
            {other.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} />)}
          </section> : null}
        </>
      )}
    </main>
  );
}

function FixtureCard({ fixture }: { fixture: OutstandingFixture }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{fixture.season} · {displayDate(fixture.date)}</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950">{fixture.home} vs {fixture.away}</h3>
      </div>
      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle[fixture.status]}`}>{statusLabel[fixture.status]}</span>
    </div>
    <p className="mt-2 text-sm text-slate-700">{fixture.completed} of {fixture.expected} frames recorded{fixture.missingLineup ? ` · ${fixture.missingLineup} line-up missing` : ""}</p>
    {fixture.detail ? <p className="mt-1 text-sm text-amber-800">{fixture.detail}</p> : null}
    {fixture.lastSaved ? <p className="mt-1 text-xs text-slate-500">Last saved {displayTime(fixture.lastSaved.at)}{fixture.lastSaved.by ? ` by ${fixture.lastSaved.by}` : ""}</p> : null}
    {fixture.reminderAttemptedAt ? <p className="mt-1 text-xs text-slate-500">Reminder attempted {displayTime(fixture.reminderAttemptedAt)}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href={`/league?view=fixtures&seasonId=${encodeURIComponent(fixture.seasonId)}&fixtureId=${encodeURIComponent(fixture.id)}`} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800">Review fixture</Link>
      <Link href="/results" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Results queue</Link>
    </div>
  </article>;
}

export default function OutstandingScorecardsPage() {
  return <RequireAuth><OutstandingScorecardsContent /></RequireAuth>;
}

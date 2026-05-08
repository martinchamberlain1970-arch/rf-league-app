"use client";

import { useEffect, useState } from "react";

type FixtureReport = {
  id: string;
  dateLabel: string;
  home: string;
  away: string;
  score: string;
  headline: string;
  expectedWinner: string;
  expectedPct: number;
  expectedHomePct: number;
  expectedAwayPct: number;
  expectationLabel: string;
  eloSummary: string;
  frameFacts: Array<{
    label: string;
    matchup: string;
    score: string;
    winner: string;
    handicapNote: string;
  }>;
};

type Payload = {
  season: { id: string; name: string } | null;
  week: number | null;
  summary: {
    title: string;
    eloNote: string;
    upset: string;
    overperformance: string;
    star: string;
    lines: string[];
  } | null;
  fixtures: FixtureReport[];
  error?: string;
};

export default function PublicWeeklyReportPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const resp = await fetch("/api/public/weekly-report", { cache: "no-store" });
      const payload = (await resp.json()) as Payload;
      if (!active) return;
      setData(payload);
      setUpdatedAt(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">
            Public Weekly Report
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {data?.season?.name ?? "Weekly League Report"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {data?.week ? `Week ${data.week}` : "Awaiting a completed week"} · Updated{" "}
            {updatedAt || "--:--"}
          </p>
        </header>

        {data?.error ? (
          <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">
            {data.error}
          </section>
        ) : null}

        {data?.summary ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
                Round-up
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">{data.summary.title}</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-100">
                <p>
                  <span className="font-semibold text-white">Biggest upset:</span>{" "}
                  {data.summary.upset}
                </p>
                <p>
                  <span className="font-semibold text-white">
                    Standout Elo over-performance:
                  </span>{" "}
                  {data.summary.overperformance}
                </p>
                <p>
                  <span className="font-semibold text-white">Standout player:</span>{" "}
                  {data.summary.star}
                </p>
              </div>
            </article>

            <article className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
                Results
              </p>
              <ul className="mt-3 space-y-3 text-sm text-slate-100">
                {data.summary.lines.map((line) => (
                  <li key={line} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    {line}
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-slate-300 shadow-2xl shadow-black/20">
            Weekly report appears when the latest published week is complete.
          </section>
        )}

        <section className="space-y-4">
          {(data?.fixtures ?? []).map((fixture) => (
            <article
              key={fixture.id}
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
                    Match Report
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white">
                    {fixture.home} vs {fixture.away}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {fixture.dateLabel} · Result {fixture.score}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                    Expected Favourite
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {fixture.expectedWinner} ({fixture.expectedPct}%)
                  </p>
                  <p className="mt-1 text-xs text-emerald-200">
                    {fixture.home} {fixture.expectedHomePct}% · {fixture.away}{" "}
                    {fixture.expectedAwayPct}%
                  </p>
                </div>
              </div>

              <p className="mt-4 text-base font-semibold text-white">{fixture.headline}</p>
              <p className="mt-2 text-sm text-slate-300">{fixture.expectationLabel}</p>
              <p className="mt-2 text-sm text-slate-300">{fixture.eloSummary}</p>

              <div className="mt-5 space-y-3">
                {fixture.frameFacts.map((frame) => (
                  <div
                    key={`${fixture.id}-${frame.label}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-sm font-semibold text-cyan-300">{frame.label}</p>
                    <p className="mt-1 text-sm text-white">{frame.matchup}</p>
                    <p className="mt-1 text-sm text-slate-300">
                      Score: {frame.score} · Winner: {frame.winner}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

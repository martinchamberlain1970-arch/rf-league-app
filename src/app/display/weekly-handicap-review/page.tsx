"use client";

import { useEffect, useState } from "react";

type ChangeRow = {
  playerId: string;
  name: string;
  playedOff: number;
  previous: number;
  next: number;
  current: number;
  baseline: number;
  rating: number;
  changedThisWeek: boolean;
  ratedFrames: number;
  reason: string;
};

type Payload = {
  season: { id: string; name: string } | null;
  batchTime: string | null;
  week: number | null;
  changes: ChangeRow[];
  error?: string;
};

function formatHandicap(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export default function PublicWeeklyHandicapReviewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const resp = await fetch("/api/public/weekly-handicap-review", {
        cache: "no-store",
      });
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

  const batchLabel = data?.batchTime
    ? new Date(data.batchTime).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Awaiting review";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">
            Public Elo Review
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {data?.season?.name ?? "Weekly Elo Review"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {data?.week ? `Week ${data.week}` : "Latest completed week"} · Reviewed{" "}
            {batchLabel} · Updated {updatedAt || "--:--"}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Players whose Elo changed in the completed week, showing their before-and-after Elo and current playing handicap.
          </p>
        </header>

        {data?.error ? (
          <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">
            {data.error}
          </section>
        ) : null}

        {data && data.changes.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-slate-300 shadow-2xl shadow-black/20">
            No weekly Elo review data has been published yet.
          </section>
        ) : null}

        <section className="grid gap-4">
          {(data?.changes ?? []).map((row) => (
            <article
              key={row.playerId}
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
                    Player
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{row.name}</h2>
                  <p className="mt-2 text-sm text-slate-300">{row.reason}</p>
                </div>
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
                    Elo Review
                  </p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {row.previous} → {row.next}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Elo (Previous Week)
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">{row.previous}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Elo (Following Review)
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {row.next}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Playing Handicap
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {formatHandicap(row.current)}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Rated frames counted this week: {row.ratedFrames}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

type HandicapRow = {
  rank: number;
  player_name: string;
  elo: number;
  current_handicap: number;
  baseline_handicap: number;
  rated_matches: number;
};

type Payload = {
  season: { id: string; name: string } | null;
  handicaps: HandicapRow[];
  error?: string;
};

const formatHandicap = (value: number) => (value > 0 ? `+${value}` : `${value}`);

export default function PublicHandicapsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const resp = await fetch("/api/public/handicaps", { cache: "no-store" });
      const payload = (await resp.json()) as Payload;
      if (!active) return;
      setData(payload);
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
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
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Public Handicap List</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{data?.season?.name ?? "Current Handicaps"}</h1>
          <p className="mt-2 text-sm text-slate-300">Updated {updatedAt || "--:--"}</p>
        </header>

        <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          Elo updates automatically when a match result is approved and complete. Handicap does not auto-change after every match; it is reviewed from Elo and any league decisions.
        </section>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm sm:text-base">
              <thead className="bg-white/5 text-left text-slate-300">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Player</th>
                  <th className="px-3 py-3 text-center">Elo</th>
                  <th className="px-3 py-3 text-center">Current</th>
                  <th className="px-3 py-3 text-center">Baseline</th>
                  <th className="px-3 py-3 text-center">Rated Matches</th>
                </tr>
              </thead>
              <tbody>
                {(data?.handicaps ?? []).map((row) => (
                  <tr key={`${row.rank}-${row.player_name}`} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td>
                    <td className="px-3 py-3 font-medium">{row.player_name}</td>
                    <td className="px-3 py-3 text-center">{row.elo}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-300">{formatHandicap(row.current_handicap)}</td>
                    <td className="px-3 py-3 text-center">{formatHandicap(row.baseline_handicap)}</td>
                    <td className="px-3 py-3 text-center">{row.rated_matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

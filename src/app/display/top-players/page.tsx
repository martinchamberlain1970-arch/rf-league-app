"use client";

import { useEffect, useState } from "react";

type PlayerRow = {
  rank: number;
  player_name: string;
  team_name: string;
  appearances: number;
  played: number;
  won: number;
  lost: number;
  points_for: number;
  points_against: number;
  win_pct: number;
};

type Payload = {
  season: { id: string; name: string } | null;
  topPlayers: PlayerRow[];
  error?: string;
};

export default function PublicTopPlayersPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const resp = await fetch("/api/public/league-board", { cache: "no-store" });
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
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Public Top Players</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{data?.season?.name ?? "Top 10 Greenhithe Legion Players"}</h1>
          <p className="mt-2 text-sm text-slate-300">Updated {updatedAt || "--:--"}</p>
        </header>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm sm:text-base">
              <thead className="bg-white/5 text-left text-slate-300">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Player</th>
                  <th className="px-3 py-3">Team</th>
                  <th className="px-3 py-3 text-center">App</th>
                  <th className="px-3 py-3 text-center">W</th>
                  <th className="px-3 py-3 text-center">L</th>
                  <th className="px-3 py-3 text-center">PF</th>
                  <th className="px-3 py-3 text-center">PA</th>
                  <th className="px-3 py-3 text-center">Win %</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topPlayers ?? []).map((row) => (
                  <tr key={`${row.rank}-${row.player_name}`} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td>
                    <td className="px-3 py-3 font-medium">{row.player_name}</td>
                    <td className="px-3 py-3 text-slate-300">{row.team_name}</td>
                    <td className="px-3 py-3 text-center">{row.appearances}</td>
                    <td className="px-3 py-3 text-center">{row.won}</td>
                    <td className="px-3 py-3 text-center">{row.lost}</td>
                    <td className="px-3 py-3 text-center">{row.points_for}</td>
                    <td className="px-3 py-3 text-center">{row.points_against}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-300">{row.win_pct}%</td>
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

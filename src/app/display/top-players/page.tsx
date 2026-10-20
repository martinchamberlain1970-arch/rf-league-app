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
      const resp = await fetch("/api/public/league-board?clubOnly=1", { cache: "no-store" });
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
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:h-screen lg:overflow-hidden lg:px-[2vw] lg:py-[2vh]">
      <div className="mx-auto flex h-full max-w-[1900px] flex-col gap-5">
        <header className="shrink-0 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur lg:px-[2vw] lg:py-[2vh]">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300 lg:text-[clamp(1rem,1.2vw,1.5rem)]">Public Top Players</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-[clamp(2.75rem,3.6vw,4.75rem)] lg:leading-none">Top 10 Greenhithe Legion Players</h1>
          <p className="mt-2 text-sm text-slate-300 lg:text-[clamp(1rem,1.2vw,1.5rem)]">{data?.season?.name ?? "Published league season"} · Updated {updatedAt || "--:--"}</p>
        </header>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20 lg:min-h-0 lg:flex-1">
          <div className="overflow-x-auto lg:h-full">
            <table className="min-w-full text-sm sm:text-base lg:h-full lg:table-fixed lg:text-[clamp(1.15rem,1.65vw,2.15rem)]">
              <thead className="bg-white/5 text-left text-slate-300 lg:text-[clamp(0.9rem,1.1vw,1.45rem)]">
                <tr>
                  <th className="px-3 py-3 lg:w-[6%] lg:px-[1vw]">#</th>
                  <th className="px-3 py-3 lg:w-[26%] lg:px-[1vw]">Player</th>
                  <th className="px-3 py-3 lg:w-[19%] lg:px-[1vw]">Team</th>
                  <th className="px-3 py-3 text-center lg:w-[9%] lg:px-[1vw]">App</th>
                  <th className="px-3 py-3 text-center lg:w-[8%] lg:px-[1vw]">W</th>
                  <th className="px-3 py-3 text-center lg:w-[8%] lg:px-[1vw]">L</th>
                  <th className="px-3 py-3 text-center lg:w-[8%] lg:px-[1vw]">PF</th>
                  <th className="px-3 py-3 text-center lg:w-[8%] lg:px-[1vw]">PA</th>
                  <th className="px-3 py-3 text-center lg:w-[8%] lg:px-[1vw]">Win %</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topPlayers ?? []).map((row) => (
                  <tr key={`${row.rank}-${row.player_name}`} className="border-t border-white/5 text-slate-100 odd:bg-white/[0.03]">
                    <td className="px-3 py-3 font-semibold text-cyan-300 lg:px-[1vw] lg:py-1">{row.rank}</td>
                    <td className="px-3 py-3 font-medium lg:px-[1vw] lg:py-1">{row.player_name}</td>
                    <td className="px-3 py-3 text-slate-300 lg:px-[1vw] lg:py-1">{row.team_name}</td>
                    <td className="px-3 py-3 text-center lg:px-[1vw] lg:py-1">{row.appearances}</td>
                    <td className="px-3 py-3 text-center lg:px-[1vw] lg:py-1">{row.won}</td>
                    <td className="px-3 py-3 text-center lg:px-[1vw] lg:py-1">{row.lost}</td>
                    <td className="px-3 py-3 text-center lg:px-[1vw] lg:py-1">{row.points_for}</td>
                    <td className="px-3 py-3 text-center lg:px-[1vw] lg:py-1">{row.points_against}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-300 lg:px-[1vw] lg:py-1">{row.win_pct}%</td>
                  </tr>
                ))}
                {data && data.topPlayers.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-300">No Greenhithe player results are recorded for the current league yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

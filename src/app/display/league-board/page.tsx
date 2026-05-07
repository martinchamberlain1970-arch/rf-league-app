"use client";

import { useEffect, useMemo, useState } from "react";

type BoardData = {
  season: { id: string; name: string } | null;
  leagueTable: Array<{
    rank: number;
    team_id: string;
    team_name: string;
    played: number;
    won: number;
    lost: number;
    frames_for: number;
    frames_against: number;
    frame_diff: number;
    points: number;
  }>;
  topPlayers: Array<{
    rank: number;
    player_id: string;
    player_name: string;
    team_name: string;
    played: number;
    won: number;
    lost: number;
    points_for: number;
    points_against: number;
    win_pct: number;
  }>;
  topHighBreaks: Array<{
    rank: number;
    key: string;
    player_name: string;
    high_break: number;
    breaks_30_plus: number;
  }>;
  error?: string;
};

const emptyData: BoardData = {
  season: null,
  leagueTable: [],
  topPlayers: [],
  topHighBreaks: [],
};

export default function PublicLeagueBoardPage() {
  const [data, setData] = useState<BoardData>(emptyData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/public/league-board", { cache: "no-store" });
        const payload = (await res.json().catch(() => emptyData)) as BoardData;
        if (!active) return;
        setData(res.ok ? payload : { ...emptyData, error: payload.error ?? "Failed to load public league board." });
      } catch {
        if (!active) return;
        setData({ ...emptyData, error: "Failed to load public league board." });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const generatedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), [data]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200/80">League Display</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{data.season?.name ?? "Published League Board"}</h1>
              <p className="mt-2 text-base text-slate-200">League table, top 10 player table, and current high breaks for public display screens.</p>
            </div>
            <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100">
              Auto refresh every 60s · Updated {generatedAt}
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-lg text-slate-200 shadow-2xl backdrop-blur">
            Loading public league board...
          </section>
        ) : null}

        {!loading && data.error ? (
          <section className="rounded-[2rem] border border-rose-300/30 bg-rose-500/10 p-8 text-lg text-rose-100 shadow-2xl backdrop-blur">
            {data.error}
          </section>
        ) : null}

        {!loading && !data.error ? (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr_0.85fr]">
            <section className="rounded-[2rem] border border-emerald-300/20 bg-white/6 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">League Table</p>
                  <h2 className="mt-2 text-2xl font-black text-white">Standings</h2>
                </div>
                <span className="rounded-full border border-emerald-200/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  Top {Math.min(10, data.leagueTable.length)}
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/10 text-left text-[11px] uppercase tracking-[0.2em] text-slate-200">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Team</th>
                      <th className="px-3 py-3 text-center">P</th>
                      <th className="px-3 py-3 text-center">W</th>
                      <th className="px-3 py-3 text-center">L</th>
                      <th className="px-3 py-3 text-center">FF</th>
                      <th className="px-3 py-3 text-center">FA</th>
                      <th className="px-3 py-3 text-center">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leagueTable.slice(0, 10).map((row, index) => (
                      <tr key={row.team_id} className={`border-t border-white/10 ${index % 2 === 0 ? "bg-white/5" : "bg-transparent"}`}>
                        <td className="px-3 py-3 font-black text-emerald-100">{row.rank}</td>
                        <td className="px-3 py-3 font-semibold text-white">{row.team_name}</td>
                        <td className="px-3 py-3 text-center text-slate-200">{row.played}</td>
                        <td className="px-3 py-3 text-center text-slate-200">{row.won}</td>
                        <td className="px-3 py-3 text-center text-slate-200">{row.lost}</td>
                        <td className="px-3 py-3 text-center text-slate-200">{row.frames_for}</td>
                        <td className="px-3 py-3 text-center text-slate-200">{row.frames_against}</td>
                        <td className="px-3 py-3 text-center font-black text-emerald-100">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.leagueTable.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-300">No completed league fixtures yet.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[2rem] border border-violet-300/20 bg-white/6 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-200">Top 10 Players</p>
                  <h2 className="mt-2 text-2xl font-black text-white">Singles Ladder</h2>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/10 text-left text-[11px] uppercase tracking-[0.2em] text-slate-200">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Player</th>
                      <th className="px-3 py-3">Team</th>
                      <th className="px-3 py-3 text-center">W-L</th>
                      <th className="px-3 py-3 text-center">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPlayers.map((row, index) => (
                      <tr key={row.player_id} className={`border-t border-white/10 ${index % 2 === 0 ? "bg-white/5" : "bg-transparent"}`}>
                        <td className="px-3 py-3 font-black text-violet-100">{row.rank}</td>
                        <td className="px-3 py-3 font-semibold text-white">{row.player_name}</td>
                        <td className="px-3 py-3 text-slate-200">{row.team_name}</td>
                        <td className="px-3 py-3 text-center text-slate-200">
                          {row.won}-{row.lost}
                        </td>
                        <td className="px-3 py-3 text-center font-black text-violet-100">{row.win_pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.topPlayers.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-300">No player rankings available yet.</p>
                ) : null}
              </div>
            </section>

            {data.topHighBreaks.length > 0 ? (
              <section className="rounded-[2rem] border border-amber-300/20 bg-white/6 p-5 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">Top 10 High Breaks</p>
                    <h2 className="mt-2 text-2xl font-black text-white">Breaks 30+</h2>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white/10 text-left text-[11px] uppercase tracking-[0.2em] text-slate-200">
                      <tr>
                        <th className="px-3 py-3">#</th>
                        <th className="px-3 py-3">Player</th>
                        <th className="px-3 py-3 text-center">High</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topHighBreaks.map((row, index) => (
                        <tr key={row.key} className={`border-t border-white/10 ${index % 2 === 0 ? "bg-white/5" : "bg-transparent"}`}>
                          <td className="px-3 py-3 font-black text-amber-100">{row.rank}</td>
                          <td className="px-3 py-3 font-semibold text-white">{row.player_name}</td>
                          <td className="px-3 py-3 text-center font-black text-amber-100">{row.high_break}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section className="rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-2xl backdrop-blur">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">High Breaks</p>
                  <h2 className="mt-2 text-2xl font-black text-white">No 30+ breaks yet</h2>
                  <p className="mt-3 text-sm text-slate-300">This panel will populate automatically once approved fixture results include recorded breaks.</p>
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}

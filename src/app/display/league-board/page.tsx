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
  const [activePanel, setActivePanel] = useState<"table" | "players" | "breaks">("table");

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

  useEffect(() => {
    if (loading || data.error) return;
    const panels: Array<"table" | "players" | "breaks"> =
      data.topHighBreaks.length > 0 ? ["table", "players", "breaks"] : ["table", "players"];
    const timer = window.setInterval(() => {
      setActivePanel((current) => {
        const currentIndex = panels.indexOf(current);
        return panels[(currentIndex + 1) % panels.length] ?? panels[0];
      });
    }, 10000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loading, data.error, data.topHighBreaks.length]);

  const generatedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), [data]);
  const panelOrder = data.topHighBreaks.length > 0 ? ["table", "players", "breaks"] : ["table", "players"];
  const panelTitle =
    activePanel === "table" ? "League Table" : activePanel === "players" ? "Top 10 Players" : "Top 10 High Breaks";
  const shellClass = "h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] p-4 text-white xl:p-5";
  const cardClass = "rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur";
  const tableCardClass = "rounded-[2rem] border border-white/10 bg-white/6 p-4 shadow-2xl backdrop-blur";
  const tableShellClass = "overflow-hidden rounded-2xl border border-white/10";
  const theadClass = "bg-white/10 text-left text-[11px] uppercase tracking-[0.22em] text-slate-200";
  const rowClass = (index: number) => `border-t border-white/10 ${index % 2 === 0 ? "bg-white/5" : "bg-transparent"}`;
  const bodyTextClass = "text-slate-200";
  const headingTextClass = "text-white";
  const mutedTextClass = "text-slate-200";

  return (
    <main className={shellClass}>
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
        <section className={cardClass}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200/80">League Display</p>
              <h1 className={`mt-2 text-3xl font-black tracking-tight xl:text-4xl ${headingTextClass}`}>{data.season?.name ?? "Published League Board"}</h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="rounded-full border border-cyan-200/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">
                Showing: {panelTitle}
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100">
                Updated {generatedAt}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {panelOrder.map((panel) => {
              const key = panel as "table" | "players" | "breaks";
              const label = key === "table" ? "League Table" : key === "players" ? "Top 10 Players" : "Top 10 High Breaks";
              const active = activePanel === key;
              return (
                <span
                  key={key}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                    active
                      ? "border-white/30 bg-white text-slate-950"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </section>

        {loading ? (
          <section className={cardClass + " text-lg " + mutedTextClass}>
            Loading public league board...
          </section>
        ) : null}

        {!loading && data.error ? (
          <section className="rounded-[2rem] border border-rose-300/30 bg-rose-500/10 p-8 text-lg text-rose-100 shadow-2xl backdrop-blur">
            {data.error}
          </section>
        ) : null}

        {!loading && !data.error ? (
          <div className="min-h-0 flex-1">
            {activePanel === "table" ? (
            <section className={`${tableCardClass} h-full border-emerald-300/20`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">League Table</p>
                  <h2 className={`mt-2 text-3xl font-black xl:text-4xl ${headingTextClass}`}>{data.season?.name ?? "Published league"} standings</h2>
                </div>
                <span className="rounded-full border border-emerald-200/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  Top {Math.min(10, data.leagueTable.length)}
                </span>
              </div>
              <div className={`mt-4 ${tableShellClass}`}>
                <table className="min-w-full text-sm xl:text-base">
                  <thead className={theadClass}>
                    <tr>
                      <th className="px-4 py-4">#</th>
                      <th className="px-4 py-4">Team</th>
                      <th className="px-4 py-4 text-center">P</th>
                      <th className="px-4 py-4 text-center">W</th>
                      <th className="px-4 py-4 text-center">L</th>
                      <th className="px-4 py-4 text-center">FF</th>
                      <th className="px-4 py-4 text-center">FA</th>
                      <th className="px-4 py-4 text-center">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leagueTable.slice(0, 10).map((row, index) => (
                      <tr key={row.team_id} className={rowClass(index)}>
                        <td className="px-4 py-3 text-base font-black text-emerald-100 xl:text-lg">{row.rank}</td>
                        <td className={`px-4 py-3 text-base font-semibold ${headingTextClass} xl:text-lg`}>{row.team_name}</td>
                        <td className={`px-4 py-3 text-center ${bodyTextClass}`}>{row.played}</td>
                        <td className={`px-4 py-3 text-center ${bodyTextClass}`}>{row.won}</td>
                        <td className={`px-4 py-3 text-center ${bodyTextClass}`}>{row.lost}</td>
                        <td className={`px-4 py-3 text-center ${bodyTextClass}`}>{row.frames_for}</td>
                        <td className={`px-4 py-3 text-center ${bodyTextClass}`}>{row.frames_against}</td>
                        <td className="px-4 py-3 text-center text-base font-black text-emerald-100 xl:text-lg">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.leagueTable.length === 0 ? (
                  <p className={`px-4 py-6 text-base ${mutedTextClass}`}>No completed league fixtures yet.</p>
                ) : null}
              </div>
            </section>
            ) : null}

            {activePanel === "players" ? (
            <section className={`${tableCardClass} h-full border-violet-300/20`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-200">Top 10 Players</p>
                  <h2 className={`mt-2 text-3xl font-black xl:text-4xl ${headingTextClass}`}>{data.season?.name ?? "Published league"} singles ladder</h2>
                </div>
              </div>
              <div className={`mt-4 ${tableShellClass}`}>
                <table className="min-w-full text-sm xl:text-base">
                  <thead className={theadClass}>
                    <tr>
                      <th className="px-4 py-4">#</th>
                      <th className="px-4 py-4">Player</th>
                      <th className="px-4 py-4">Team</th>
                      <th className="px-4 py-4 text-center">W-L</th>
                      <th className="px-4 py-4 text-center">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPlayers.map((row, index) => (
                      <tr key={row.player_id} className={rowClass(index)}>
                        <td className="px-4 py-3 text-base font-black text-violet-100 xl:text-lg">{row.rank}</td>
                        <td className={`px-4 py-3 text-base font-semibold ${headingTextClass} xl:text-lg`}>{row.player_name}</td>
                        <td className={`px-4 py-3 ${bodyTextClass}`}>{row.team_name}</td>
                        <td className={`px-4 py-3 text-center ${bodyTextClass}`}>
                          {row.won}-{row.lost}
                        </td>
                        <td className="px-4 py-3 text-center text-base font-black text-violet-100 xl:text-lg">{row.win_pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.topPlayers.length === 0 ? (
                  <p className={`px-4 py-6 text-base ${mutedTextClass}`}>No player rankings available yet.</p>
                ) : null}
              </div>
            </section>
            ) : null}

            {activePanel === "breaks" ? (
              data.topHighBreaks.length > 0 ? (
              <section className={`${tableCardClass} h-full border-amber-300/20`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">Top 10 High Breaks</p>
                    <h2 className={`mt-2 text-3xl font-black xl:text-4xl ${headingTextClass}`}>{data.season?.name ?? "Published league"} breaks 30+</h2>
                  </div>
                </div>
                <div className={`mt-4 ${tableShellClass}`}>
                  <table className="min-w-full text-sm xl:text-base">
                    <thead className={theadClass}>
                      <tr>
                        <th className="px-4 py-4">#</th>
                        <th className="px-4 py-4">Player</th>
                        <th className="px-4 py-4 text-center">High</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topHighBreaks.map((row, index) => (
                        <tr key={row.key} className={rowClass(index)}>
                          <td className="px-4 py-3 text-base font-black text-amber-100 xl:text-lg">{row.rank}</td>
                          <td className={`px-4 py-3 text-base font-semibold ${headingTextClass} xl:text-lg`}>{row.player_name}</td>
                          <td className="px-4 py-3 text-center text-base font-black text-amber-100 xl:text-lg">{row.high_break}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              ) : (
              <section className={`${tableCardClass} h-full`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">High Breaks</p>
                  <h2 className={`mt-2 text-3xl font-black ${headingTextClass}`}>No 30+ breaks yet</h2>
                  <p className={`mt-3 text-base ${mutedTextClass}`}>This panel will populate automatically once approved fixture results include recorded breaks.</p>
                </div>
              </section>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

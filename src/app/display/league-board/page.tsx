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

type LiveMatchData = {
  season: { id: string; name: string } | null;
  liveMatches: Array<{
    fixtureId: string;
    fixtureDate: string | null;
    weekNo: number | null;
    status: string;
    homeTeam: string;
    awayTeam: string;
    overallScore: string;
    frameRows: Array<{
      id: string;
      slotNo: number;
      slotType: "singles" | "doubles";
      title: string;
      homeName: string;
      awayName: string;
      scoreLabel: string;
      frameStatus: string;
      startLabel: string;
    }>;
  }>;
  error?: string;
};

const emptyData: BoardData = {
  season: null,
  leagueTable: [],
  topPlayers: [],
  topHighBreaks: [],
};

const emptyLiveData: LiveMatchData = {
  season: null,
  liveMatches: [],
};

export default function PublicLeagueBoardPage() {
  const [data, setData] = useState<BoardData>(emptyData);
  const [liveData, setLiveData] = useState<LiveMatchData>(emptyLiveData);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<string>("table");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [boardRes, liveRes] = await Promise.all([
          fetch("/api/public/league-board", { cache: "no-store" }),
          fetch("/api/public/live-matches", { cache: "no-store" }),
        ]);
        const boardPayload = (await boardRes.json().catch(() => emptyData)) as BoardData;
        const livePayload = (await liveRes.json().catch(() => emptyLiveData)) as LiveMatchData;
        if (!active) return;
        setData(
          boardRes.ok ? boardPayload : { ...emptyData, error: boardPayload.error ?? "Failed to load public league board." }
        );
        setLiveData(
          liveRes.ok ? livePayload : { ...emptyLiveData, error: livePayload.error ?? "Failed to load live matches." }
        );
      } catch {
        if (!active) return;
        setData({ ...emptyData, error: "Failed to load public league board." });
        setLiveData({ ...emptyLiveData, error: "Failed to load live matches." });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const panelOrder = useMemo(
    () => [
      "table",
      "players",
      ...(data.topHighBreaks.length > 0 ? ["breaks"] : []),
      ...liveData.liveMatches.map((match) => `live:${match.fixtureId}`),
    ],
    [data.topHighBreaks.length, liveData.liveMatches]
  );

  useEffect(() => {
    if (loading || data.error || liveData.error) return;
    const panels = panelOrder;
    if (panels.length === 0) return;
    const timer = window.setInterval(() => {
      setActivePanel((current) => {
        const currentIndex = panels.indexOf(current);
        return panels[(currentIndex + 1) % panels.length] ?? panels[0];
      });
    }, 45000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loading, data.error, liveData.error, panelOrder.join("|")]);

  useEffect(() => {
    if (!panelOrder.includes(activePanel)) {
      setActivePanel(panelOrder[0] ?? "table");
    }
  }, [activePanel, panelOrder]);

  const generatedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), [data]);
  const activeLiveMatch = activePanel.startsWith("live:")
    ? liveData.liveMatches.find((match) => `live:${match.fixtureId}` === activePanel) ?? null
    : null;
  const panelTitle =
    activePanel === "table"
      ? "League Table"
      : activePanel === "players"
        ? "Top 10 Players"
        : activePanel === "breaks"
          ? "Top 10 High Breaks"
          : activeLiveMatch
            ? `${activeLiveMatch.homeTeam} vs. ${activeLiveMatch.awayTeam}`
            : "League Board";
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
              const liveIndex = panel.startsWith("live:")
                ? panelOrder.filter((item) => item.startsWith("live:")).indexOf(panel) + 1
                : -1;
              const label = panel === "table"
                ? "League Table"
                : panel === "players"
                  ? "Top 10 Players"
                  : panel === "breaks"
                    ? "Top 10 High Breaks"
                    : `Live Match ${liveIndex}`;
              const active = activePanel === panel;
              return (
                <span
                  key={panel}
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

        {!loading && (data.error || liveData.error) ? (
          <section className="rounded-[2rem] border border-rose-300/30 bg-rose-500/10 p-8 text-lg text-rose-100 shadow-2xl backdrop-blur">
            {data.error ?? liveData.error}
          </section>
        ) : null}

        {!loading && !data.error && !liveData.error ? (
          <div className="min-h-0 flex-1">
            {activePanel === "table" ? (
            <section className={`${tableCardClass} h-full border-emerald-300/20`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">League Table</p>
                  <h2 className={`mt-2 text-3xl font-black xl:text-4xl ${headingTextClass}`}>Standings</h2>
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
                  <h2 className={`mt-2 text-3xl font-black xl:text-4xl ${headingTextClass}`}>Top 10 Players</h2>
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
                    <h2 className={`mt-2 text-3xl font-black xl:text-4xl ${headingTextClass}`}>Top 10 High Breaks</h2>
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

            {activeLiveMatch ? (
              <section className={`${tableCardClass} h-full border-cyan-300/20`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">Live Match</p>
                    <h2 className={`mt-2 text-3xl font-black xl:text-4xl ${headingTextClass}`}>
                      {activeLiveMatch.homeTeam} <span className="text-cyan-200">vs.</span> {activeLiveMatch.awayTeam}
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/20 bg-emerald-400/10 px-4 py-3 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Frames</p>
                    <p className="mt-1 text-2xl font-black text-white">{activeLiveMatch.overallScore}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {activeLiveMatch.frameRows.map((frame) => (
                    <div key={frame.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">{frame.title}</p>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                            {frame.frameStatus}
                          </span>
                          <span className="rounded-full border border-cyan-200/20 bg-cyan-400/10 px-3 py-1 text-sm font-black text-cyan-100">
                            {frame.scoreLabel}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm xl:grid-cols-[1fr_auto_1fr] xl:items-center">
                        <p className="font-semibold text-white">{frame.homeName}</p>
                        <p className="text-center text-cyan-200">vs.</p>
                        <p className="font-semibold text-white xl:text-right">{frame.awayName}</p>
                      </div>
                      <p className="mt-3 text-xs text-slate-300">{frame.startLabel}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

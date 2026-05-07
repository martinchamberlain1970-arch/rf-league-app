"use client";

import { useEffect, useMemo, useState } from "react";

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

const emptyData: LiveMatchData = {
  season: null,
  liveMatches: [],
};

export default function PublicLiveMatchesPage() {
  const [data, setData] = useState<LiveMatchData>(emptyData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/public/live-matches", { cache: "no-store" });
        const payload = (await res.json().catch(() => emptyData)) as LiveMatchData;
        if (!active) return;
        setData(res.ok ? payload : { ...emptyData, error: payload.error ?? "Failed to load live matches." });
      } catch {
        if (!active) return;
        setData({ ...emptyData, error: "Failed to load live matches." });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const generatedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), [data]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] p-4 text-white xl:p-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Live Matches</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight xl:text-4xl">{data.season?.name ?? "Published League Live Matches"}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-rose-200/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100">
                {data.liveMatches.length} match{data.liveMatches.length === 1 ? "" : "es"} live
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100">
                Updated {generatedAt}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-lg text-slate-200 shadow-2xl backdrop-blur">
            Loading live matches...
          </section>
        ) : null}

        {!loading && data.error ? (
          <section className="rounded-[2rem] border border-rose-300/30 bg-rose-500/10 p-8 text-lg text-rose-100 shadow-2xl backdrop-blur">
            {data.error}
          </section>
        ) : null}

        {!loading && !data.error && data.liveMatches.length === 0 ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/6 p-8 text-center shadow-2xl backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">No Live Matches</p>
            <h2 className="mt-2 text-3xl font-black">No live matches in progress</h2>
            <p className="mt-3 text-base text-slate-300">
              This screen will populate automatically once both teams have submitted their lineups for an active fixture.
            </p>
          </section>
        ) : null}

        {!loading && !data.error && data.liveMatches.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.liveMatches.map((match) => (
              <section key={match.fixtureId} className="rounded-[2rem] border border-white/10 bg-white/6 p-4 shadow-2xl backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Week {match.weekNo ?? "-"}</p>
                    <h2 className="mt-2 text-2xl font-black xl:text-3xl">
                      {match.homeTeam} <span className="text-cyan-200">vs.</span> {match.awayTeam}
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/20 bg-emerald-400/10 px-4 py-3 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Frames</p>
                    <p className="mt-1 text-2xl font-black text-white">{match.overallScore}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {match.frameRows.map((frame) => (
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
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}

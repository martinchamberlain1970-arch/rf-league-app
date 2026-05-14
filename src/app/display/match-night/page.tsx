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

function statusTone(status: string) {
  if (status === "Home won") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (status === "Away won") return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  if (status === "In progress") return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
  return "border-white/15 bg-white/5 text-slate-200";
}

export default function MatchNightDisplayPage() {
  const [data, setData] = useState<LiveMatchData>(emptyData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/public/live-matches", { cache: "no-store" });
        const payload = (await res.json().catch(() => emptyData)) as LiveMatchData;
        if (!active) return;
        const trimmed = (res.ok ? payload.liveMatches : []).slice(0, 4);
        setData(
          res.ok
            ? { ...payload, liveMatches: trimmed }
            : { ...emptyData, error: payload.error ?? "Failed to load live matches." }
        );
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

  const generatedAt = useMemo(
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [data]
  );

  return (
    <main className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_58%)] p-5 text-white">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 px-6 py-5 shadow-2xl backdrop-blur">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200/80">Match Night Live</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight xl:text-4xl">
                {data.season?.name ?? "League Match Night"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-rose-200/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100">
                {data.liveMatches.length} live match{data.liveMatches.length === 1 ? "" : "es"}
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100">
                Updated {generatedAt}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="flex flex-1 items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 text-xl text-slate-200 shadow-2xl backdrop-blur">
            Loading live match night board...
          </section>
        ) : null}

        {!loading && data.error ? (
          <section className="flex flex-1 items-center justify-center rounded-[2rem] border border-rose-300/30 bg-rose-500/10 px-8 text-center text-xl text-rose-100 shadow-2xl backdrop-blur">
            {data.error}
          </section>
        ) : null}

        {!loading && !data.error && data.liveMatches.length === 0 ? (
          <section className="flex flex-1 items-center justify-center rounded-[2rem] border border-white/10 bg-white/6 px-8 text-center shadow-2xl backdrop-blur">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">No Live Matches</p>
              <h2 className="mt-2 text-3xl font-black">No live fixtures are currently in progress</h2>
              <p className="mt-3 text-base text-slate-300">
                This board will populate automatically once tonight&apos;s lineups are confirmed.
              </p>
            </div>
          </section>
        ) : null}

        {!loading && !data.error && data.liveMatches.length > 0 ? (
          <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-4">
            {Array.from({ length: 4 }).map((_, index) => {
              const match = data.liveMatches[index] ?? null;
              if (!match) {
                return (
                  <section
                    key={`empty-${index}`}
                    className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur"
                  >
                    <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/20">
                      <p className="text-lg font-semibold text-slate-300">No fourth match to show</p>
                    </div>
                  </section>
                );
              }

              return (
                <section
                  key={match.fixtureId}
                  className="flex min-h-0 flex-col rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-2xl backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200">
                        Week {match.weekNo ?? "-"}
                      </p>
                      <h2 className="mt-2 text-2xl font-black leading-tight xl:text-[2rem]">
                        {match.homeTeam}
                      </h2>
                      <p className="mt-1 text-lg font-semibold text-cyan-200">vs {match.awayTeam}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/20 bg-emerald-400/10 px-4 py-3 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">Frames</p>
                      <p className="mt-1 text-3xl font-black text-white">{match.overallScore}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-2">
                    {match.frameRows.slice(0, 6).map((frame) => (
                      <div
                        key={frame.id}
                        className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                            {frame.title}
                          </p>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(
                              frame.frameStatus
                            )}`}
                          >
                            {frame.frameStatus}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">{frame.scoreLabel}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-300">{frame.homeName}</p>
                        <p className="line-clamp-1 text-xs text-slate-300">{frame.awayName}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </main>
  );
}

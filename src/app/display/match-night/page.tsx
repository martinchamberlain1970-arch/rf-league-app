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
      homeHandicapLabel: string;
      awayHandicapLabel: string;
      homePlayers: Array<{
        name: string;
        avatarUrl: string | null;
        nationality: string | null;
        countryCode: string | null;
      }>;
      awayPlayers: Array<{
        name: string;
        avatarUrl: string | null;
        nationality: string | null;
        countryCode: string | null;
      }>;
      scoreLabel: string;
      frameStatus: string;
      startLabel: string;
      startRecipient: string;
      startAmount: number;
    }>;
  }>;
  error?: string;
};

const emptyData: LiveMatchData = {
  season: null,
  liveMatches: [],
};

const MATCHES_PER_PAGE = 2;
const PAGE_ROTATION_MS = 30000;

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function statusTone(status: string) {
  if (status === "Home won") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (status === "Away won") return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  if (status === "In progress") return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
  return "border-white/15 bg-white/5 text-slate-200";
}

function fixtureTone(status: string) {
  if (status === "complete") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (status === "in_progress") return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
  return "border-white/15 bg-white/10 text-slate-100";
}

function sideHighlight(frameStatus: string, side: "home" | "away") {
  const winner = frameStatus === "Home won" ? "home" : frameStatus === "Away won" ? "away" : null;
  if (!winner) {
    return {
      nameClass: "text-white",
      metaClass: "text-slate-400",
      avatarClass: "border-white/15 bg-slate-800 text-slate-200",
    };
  }
  if (winner === side) {
    return {
      nameClass: "text-emerald-200",
      metaClass: "text-emerald-300/90",
      avatarClass: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
    };
  }
  return {
    nameClass: "text-rose-200",
    metaClass: "text-rose-300/90",
    avatarClass: "border-rose-300/35 bg-rose-400/10 text-rose-100",
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function stripHandicapSuffix(label: string) {
  return label.replace(/\s\([+-]?\d+(?:\.\d+)?\)/g, "");
}

function PlayerAvatars({
  players,
  tone,
}: {
  players: Array<{
    name: string;
    avatarUrl: string | null;
  }>;
  tone: {
    avatarClass: string;
  };
}) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      {players.map((player, idx) => (
        <div
          key={`${player.name}-${idx}`}
          className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border text-[10px] font-bold ${tone.avatarClass}`}
          title={player.name}
        >
          {player.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.avatarUrl} alt={player.name} className="h-full w-full object-cover" />
          ) : (
            <span>{initials(player.name)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MatchNightDisplayPage() {
  const [data, setData] = useState<LiveMatchData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/public/live-matches", { cache: "no-store" });
        const payload = (await res.json().catch(() => emptyData)) as LiveMatchData;
        if (!active) return;
        setData(
          res.ok
            ? payload
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
    }, PAGE_ROTATION_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const matchPages = useMemo(() => chunkRows(data.liveMatches, MATCHES_PER_PAGE), [data.liveMatches]);
  const totalPages = Math.max(matchPages.length, 1);
  const visibleMatches = matchPages[Math.min(pageIndex, totalPages - 1)] ?? [];

  useEffect(() => {
    setPageIndex(0);
  }, [data.liveMatches]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const timer = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % totalPages);
    }, PAGE_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [totalPages]);

  const generatedAt = useMemo(
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [data]
  );
  const liveCount = data.liveMatches.filter((match) => match.status === "in_progress").length;
  const completedCount = data.liveMatches.filter((match) => match.status === "complete").length;

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
                {liveCount > 0 ? `${liveCount} live` : "No live matches"}
                {completedCount > 0 ? ` · ${completedCount} completed` : ""}
              </div>
              {totalPages > 1 ? (
                <div className="rounded-full border border-cyan-200/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">
                  Page {Math.min(pageIndex + 1, totalPages)} of {totalPages}
                </div>
              ) : null}
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
          <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-4">
            {visibleMatches.map((match) => {
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
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${fixtureTone(
                          match.status
                        )}`}
                      >
                        {match.status === "complete" ? "Completed" : match.status === "in_progress" ? "Live" : "Lineups ready"}
                      </span>
                      <div className="rounded-2xl border border-emerald-200/20 bg-emerald-400/10 px-4 py-3 text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">Frames</p>
                        <p className="mt-1 text-3xl font-black text-white">{match.overallScore}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-2">
                    {match.frameRows.slice(0, 6).map((frame) => (
                      <div
                        key={frame.id}
                        className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2"
                      >
                        {(() => {
                          const homeTone = sideHighlight(frame.frameStatus, "home");
                          const awayTone = sideHighlight(frame.frameStatus, "away");
                          return (
                            <>
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
                        <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
                            {frame.startAmount > 0 ? `${frame.startRecipient} start ${frame.startAmount}` : "Level start"}
                          </p>
                          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <p className={`text-[13px] font-semibold leading-snug ${homeTone.nameClass}`}>
                              {stripHandicapSuffix(frame.homeName)}
                            </p>
                            <span className="rounded-full border border-cyan-200/20 bg-cyan-400/10 px-3 py-1 text-[13px] font-black text-cyan-100">
                              {frame.scoreLabel}
                            </span>
                            <p className={`text-right text-[13px] font-semibold leading-snug ${awayTone.nameClass}`}>
                              {stripHandicapSuffix(frame.awayName)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <div className="min-w-0">
                            <p className={`text-[10px] uppercase tracking-[0.14em] ${homeTone.metaClass}`}>
                              Hcp {frame.homeHandicapLabel}
                            </p>
                            <PlayerAvatars players={frame.homePlayers} tone={homeTone} />
                          </div>
                          <div className="min-w-0 text-right">
                            <p className={`text-[10px] uppercase tracking-[0.14em] ${awayTone.metaClass}`}>
                              Hcp {frame.awayHandicapLabel}
                            </p>
                            <div className="flex justify-end">
                              <PlayerAvatars players={frame.awayPlayers} tone={awayTone} />
                            </div>
                          </div>
                        </div>
                            </>
                          );
                        })()}
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

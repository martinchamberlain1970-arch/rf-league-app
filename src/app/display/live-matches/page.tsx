"use client";

import { useEffect, useMemo, useState } from "react";
import { countryCodeToFlagEmoji } from "@/lib/country-flags";

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
      homePlayers: Array<{ name: string; avatarUrl?: string | null; nationality?: string | null; countryCode?: string | null }>;
      awayPlayers: Array<{ name: string; avatarUrl?: string | null; nationality?: string | null; countryCode?: string | null }>;
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

const MATCHES_PER_PAGE = 4;
const PAGE_ROTATION_MS = 15000;

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function PlayerBadge({
  player,
  align = "left",
  avatarClass = "border-white/15 bg-slate-900/60 text-white",
}: {
  player: { name: string; avatarUrl?: string | null; nationality?: string | null; countryCode?: string | null };
  align?: "left" | "right";
  avatarClass?: string;
}) {
  const flag = countryCodeToFlagEmoji(player.countryCode);
  return (
    <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      {align === "right" && (flag || player.nationality) ? (
        <span className="text-[0.65rem] text-slate-300">{flag ? `${flag} ` : ""}{player.nationality ?? ""}</span>
      ) : null}
      <div className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border text-[0.65rem] font-black ${avatarClass}`}>
        {player.avatarUrl ? <img src={player.avatarUrl} alt={player.name} className="h-full w-full object-cover" /> : <span>{player.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>}
      </div>
      {align === "left" && (flag || player.nationality) ? (
        <span className="text-[0.65rem] text-slate-300">{flag ? `${flag} ` : ""}{player.nationality ?? ""}</span>
      ) : null}
    </div>
  );
}

function stripHandicapSuffix(label: string) {
  return label.replace(/\s\([+-]?\d+(?:\.\d+)?\)/g, "");
}

function sideHighlight(frameStatus: string, side: "home" | "away") {
  const winner = frameStatus === "Home won" ? "home" : frameStatus === "Away won" ? "away" : null;
  if (!winner) {
    return {
      nameClass: "text-white",
      metaClass: "text-slate-400",
      avatarClass: "border-white/15 bg-slate-900/60 text-white",
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

export default function PublicLiveMatchesPage() {
  const [data, setData] = useState<LiveMatchData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");

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

  const matchPages = useMemo(() => chunkRows(data.liveMatches, MATCHES_PER_PAGE), [data.liveMatches]);
  const totalPages = Math.max(matchPages.length, 1);
  const visibleMatches = matchPages[Math.min(pageIndex, totalPages - 1)] ?? [];
  const selectedMatch = useMemo(
    () => data.liveMatches.find((match) => match.fixtureId === selectedFixtureId) ?? data.liveMatches[0] ?? null,
    [data.liveMatches, selectedFixtureId]
  );

  useEffect(() => {
    setPageIndex(0);
    setSelectedFixtureId((current) => {
      if (current && data.liveMatches.some((match) => match.fixtureId === current)) return current;
      return data.liveMatches[0]?.fixtureId ?? "";
    });
  }, [data.liveMatches]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const timer = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % totalPages);
    }, PAGE_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [totalPages]);

  const generatedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), [data]);

  return (
    <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] p-3 text-white md:h-screen md:overflow-hidden xl:p-4">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-3 md:h-full md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)]">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Live Matches</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight xl:text-3xl">{data.season?.name ?? "Published League Live Matches"}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {data.liveMatches.length > 1 ? (
                <label className="grid gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cyan-100 md:hidden">
                  Follow match
                  <select
                    className="max-w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-white"
                    value={selectedMatch?.fixtureId ?? ""}
                    onChange={(event) => setSelectedFixtureId(event.target.value)}
                  >
                    {data.liveMatches.map((match) => (
                      <option key={match.fixtureId} value={match.fixtureId}>
                        {match.homeTeam} vs {match.awayTeam}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="rounded-full border border-rose-200/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100">
                {data.liveMatches.length} match{data.liveMatches.length === 1 ? "" : "es"} live
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
          <section className="rounded-2xl border border-white/10 bg-white/5 p-8 text-lg text-slate-200 shadow-2xl backdrop-blur">
            Loading live matches...
          </section>
        ) : null}

        {!loading && data.error ? (
          <section className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-8 text-lg text-rose-100 shadow-2xl backdrop-blur">
            {data.error}
          </section>
        ) : null}

        {!loading && !data.error && data.liveMatches.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/6 p-8 text-center shadow-2xl backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">No Live Matches</p>
            <h2 className="mt-2 text-3xl font-black">No live matches in progress</h2>
            <p className="mt-3 text-base text-slate-300">
              This screen will populate automatically once both teams have submitted their lineups for an active fixture.
            </p>
          </section>
        ) : null}

        {!loading && !data.error && selectedMatch ? (
          <section className="rounded-2xl border border-white/10 bg-white/6 p-3 shadow-2xl backdrop-blur md:hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-cyan-200">Week {selectedMatch.weekNo ?? "-"}</p>
                <h2 className="mt-1 text-xl font-black leading-tight">
                  {selectedMatch.homeTeam} <span className="text-cyan-200">vs.</span> {selectedMatch.awayTeam}
                </h2>
              </div>
              <div className="rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-3 py-2 text-center">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-100">Frames</p>
                <p className="mt-0.5 text-xl font-black text-white">{selectedMatch.overallScore}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {selectedMatch.frameRows.map((frame) => (
                <div key={frame.id} className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2.5">
                  {(() => {
                    const homeTone = sideHighlight(frame.frameStatus, "home");
                    const awayTone = sideHighlight(frame.frameStatus, "away");
                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-300">{frame.title}</p>
                          <span className="rounded-full border border-cyan-200/20 bg-cyan-400/10 px-2 py-0.5 text-xs font-black text-cyan-100">
                            {frame.scoreLabel}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <p className={`text-sm font-semibold leading-snug ${homeTone.nameClass}`}>
                            {stripHandicapSuffix(frame.homeName)}
                          </p>
                          <span className="text-xs font-semibold text-cyan-200">vs</span>
                          <p className={`text-right text-sm font-semibold leading-snug ${awayTone.nameClass}`}>
                            {stripHandicapSuffix(frame.awayName)}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-semibold text-slate-200">
                            {frame.frameStatus}
                          </span>
                          <span className="text-cyan-100">
                            {frame.startAmount > 0 ? `${frame.startRecipient} start ${frame.startAmount}` : "Level start"}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && !data.error && data.liveMatches.length > 0 ? (
          <div className="hidden min-h-0 gap-3 md:grid xl:grid-cols-2 xl:grid-rows-2">
            {visibleMatches.map((match) => (
              <section key={match.fixtureId} className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/6 p-3 shadow-2xl backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-cyan-200">Week {match.weekNo ?? "-"}</p>
                    <h2 className="mt-1 text-xl font-black leading-tight xl:text-2xl">
                      {match.homeTeam} <span className="text-cyan-200">vs.</span> {match.awayTeam}
                    </h2>
                  </div>
                  <div className="rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-3 py-2 text-center">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-100">Frames</p>
                    <p className="mt-0.5 text-xl font-black text-white">{match.overallScore}</p>
                  </div>
                </div>

                <div className="mt-2 grid gap-1.5">
                  {match.frameRows.map((frame) => (
                    <div key={frame.id} className="rounded-xl border border-white/10 bg-slate-950/35 px-2.5 py-2">
                      {(() => {
                        const homeTone = sideHighlight(frame.frameStatus, "home");
                        const awayTone = sideHighlight(frame.frameStatus, "away");
                        return (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-300">{frame.title}</p>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-200">
                                  {frame.frameStatus}
                                </span>
                                <span className="rounded-full border border-cyan-200/20 bg-cyan-400/10 px-2 py-0.5 text-xs font-black text-cyan-100">
                                  {frame.scoreLabel}
                                </span>
                              </div>
                            </div>
                            <div className="mt-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">
                                {frame.startAmount > 0 ? `${frame.startRecipient} start ${frame.startAmount}` : "Level start"}
                              </p>
                              <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                <p className={`text-xs font-semibold leading-snug ${homeTone.nameClass}`}>
                                  {stripHandicapSuffix(frame.homeName)}
                                </p>
                                <span className="rounded-full border border-cyan-200/20 bg-cyan-400/10 px-2 py-0.5 text-xs font-black text-cyan-100">
                                  {frame.scoreLabel}
                                </span>
                                <p className={`text-right text-xs font-semibold leading-snug ${awayTone.nameClass}`}>
                                  {stripHandicapSuffix(frame.awayName)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-1.5 grid gap-1 text-xs xl:grid-cols-[1fr_auto_1fr] xl:items-center">
                              <div>
                                <p className={`text-[0.62rem] uppercase tracking-[0.12em] ${homeTone.metaClass}`}>
                                  Hcp {frame.homeHandicapLabel}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {frame.homePlayers.map((player, index) => (
                                    <div key={`${frame.id}-home-${index}`} className={homeTone.nameClass}>
                                      <PlayerBadge player={player} avatarClass={homeTone.avatarClass} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <p className="text-center text-cyan-200">vs.</p>
                              <div>
                                <p className={`text-[0.62rem] uppercase tracking-[0.12em] xl:text-right ${awayTone.metaClass}`}>
                                  Hcp {frame.awayHandicapLabel}
                                </p>
                                <div className="mt-1 flex flex-wrap justify-start gap-1.5 xl:justify-end">
                                  {frame.awayPlayers.map((player, index) => (
                                    <div key={`${frame.id}-away-${index}`} className={awayTone.nameClass}>
                                      <PlayerBadge player={player} align="right" avatarClass={awayTone.avatarClass} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <p className="mt-1 text-[0.68rem] text-slate-300">{frame.startLabel}</p>
                          </>
                        );
                      })()}
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

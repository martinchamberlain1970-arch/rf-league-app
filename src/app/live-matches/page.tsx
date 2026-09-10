"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";

type LiveMatchData = {
  season: { id: string; name: string } | null;
  seasons: Array<{ id: string; name: string }>;
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
      title: string;
      homeName: string;
      awayName: string;
      homeHandicapLabel: string;
      awayHandicapLabel: string;
      scoreLabel: string;
      frameStatus: string;
      startLabel: string;
    }>;
  }>;
  error?: string;
};

const emptyData: LiveMatchData = { season: null, seasons: [], liveMatches: [] };

function stripHandicapSuffix(label: string) {
  return label.replace(/\s\([+-]?\d+(?:\.\d+)?\)/g, "");
}

function frameTone(status: string) {
  if (status === "Home won" || status === "Away won") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "In progress") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function shortSeasonName(name: string) {
  const season = name.match(/20\d{2}\s*(?:\/|-)\s*20?\d{2}/)?.[0]?.replace(/\s/g, "") ?? "";
  if (/premier league/i.test(name)) return `Premier League${season ? ` ${season}` : ""}`;
  if (/division\s*1/i.test(name)) return `Division 1${season ? ` ${season}` : ""}`;
  if (/summer league/i.test(name)) return `Summer League${season ? ` ${season}` : ""}`;
  return name;
}

export default function LiveMatchesPage() {
  const [data, setData] = useState<LiveMatchData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const query = selectedSeasonId ? `?seasonId=${encodeURIComponent(selectedSeasonId)}` : "";
        const res = await fetch(`/api/public/live-matches${query}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => emptyData)) as LiveMatchData;
        if (!active) return;
        if (res.ok) {
          setData({ ...payload, seasons: payload.seasons ?? [] });
          setSelectedSeasonId((current) => current || payload.season?.id || "");
        } else {
          setData({ ...emptyData, error: payload.error ?? "Failed to load live matches." });
        }
      } catch {
        if (!active) return;
        setData({ ...emptyData, error: "Failed to load live matches." });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedSeasonId]);

  const selectedMatch = useMemo(
    () => data.liveMatches.find((match) => match.fixtureId === selectedFixtureId) ?? data.liveMatches[0] ?? null,
    [data.liveMatches, selectedFixtureId]
  );

  useEffect(() => {
    setSelectedFixtureId((current) => {
      if (current && data.liveMatches.some((match) => match.fixtureId === current)) return current;
      return data.liveMatches[0]?.fixtureId ?? "";
    });
  }, [data.liveMatches]);

  const updatedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <RequireAuth>
        <div className="mx-auto max-w-6xl space-y-4">
          <ScreenHeader title="Live Matches" eyebrow="League" subtitle="Follow tonight's live league scorecards from inside the app." />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{data.season ? shortSeasonName(data.season.name) : "Published League"}</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{data.liveMatches.length} live match{data.liveMatches.length === 1 ? "" : "es"}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Updated {updatedAt}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm text-slate-600">
              This screen refreshes every 30 seconds. Completed matches are removed automatically.
            </div>

            {(data.seasons.length > 1 || data.liveMatches.length > 1) ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {data.seasons.length > 1 ? (
                  <label className="grid min-w-0 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    League
                    <select
                      className="h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                      value={data.season?.id ?? selectedSeasonId}
                      onChange={(event) => {
                        setLoading(true);
                        setSelectedFixtureId("");
                        setSelectedSeasonId(event.target.value);
                      }}
                    >
                      {data.seasons.map((season) => (
                        <option key={season.id} value={season.id}>{shortSeasonName(season.name)}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {data.liveMatches.length > 1 ? (
                  <label className="grid min-w-0 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Follow match
                    <select
                      className="h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                      value={selectedMatch?.fixtureId ?? ""}
                      onChange={(event) => setSelectedFixtureId(event.target.value)}
                    >
                      {data.liveMatches.map((match) => (
                        <option key={match.fixtureId} value={match.fixtureId}>{match.homeTeam} vs {match.awayTeam}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
          </section>

          {loading ? <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">Loading live matches...</section> : null}
          {!loading && data.error ? <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 shadow-sm">{data.error}</section> : null}
          {!loading && !data.error && data.liveMatches.length === 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">No Live Matches</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">No fixture is live right now</h2>
              <p className="mt-2 text-sm text-slate-600">This page will populate once both teams have confirmed their lineups for a fixture.</p>
            </section>
          ) : null}

          {!loading && !data.error && selectedMatch ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Week {selectedMatch.weekNo ?? "-"}</p>
                  <h2 className="mt-1 break-words text-2xl font-black text-slate-950">{selectedMatch.homeTeam} vs {selectedMatch.awayTeam}</h2>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-emerald-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Frames</p>
                  <p className="mt-1 text-3xl font-black">{selectedMatch.overallScore}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {selectedMatch.frameRows.map((frame) => (
                  <div key={frame.id} className={`rounded-2xl border p-3 ${frameTone(frame.frameStatus)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{frame.title}</p>
                      <span className="rounded-full border border-white/70 bg-white/70 px-2 py-1 text-xs font-black">{frame.scoreLabel}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-black text-slate-950">{stripHandicapSuffix(frame.homeName)}</p>
                        <p className="mt-1 text-xs text-slate-600">Hcp {frame.homeHandicapLabel}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">vs</span>
                      <div className="min-w-0 text-right">
                        <p className="break-words text-sm font-black text-slate-950">{stripHandicapSuffix(frame.awayName)}</p>
                        <p className="mt-1 text-xs text-slate-600">Hcp {frame.awayHandicapLabel}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                      <span>{frame.frameStatus}</span>
                      <span>{frame.startLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </RequireAuth>
    </main>
  );
}

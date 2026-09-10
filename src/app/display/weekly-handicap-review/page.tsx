"use client";

import { useEffect, useState } from "react";

type ChangeRow = {
  playerId: string;
  name: string;
  playedOff: number;
  previous: number;
  next: number;
  current: number;
  previousHandicap: number;
  nextHandicap: number;
  handicapChangedThisWeek: boolean;
  baseline: number;
  rating: number;
  changedThisWeek: boolean;
  ratedFrames: number;
  target: number;
  illustrativeHandicap: number;
  reason: string;
};

type Payload = {
  season: { id: string; name: string } | null;
  seasons: Array<{ id: string; name: string }>;
  isInformationOnly?: boolean;
  batchTime: string | null;
  week: number | null;
  reviewNote?: string | null;
  changes: ChangeRow[];
  error?: string;
};

function formatHandicap(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export default function PublicWeeklyHandicapReviewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const requestedSeasonId = selectedSeasonId || new URLSearchParams(window.location.search).get("seasonId") || "";
      if (!selectedSeasonId && requestedSeasonId) {
        setSelectedSeasonId(requestedSeasonId);
        return;
      }
      const requestedWeek = new URLSearchParams(window.location.search).get("week") || "";
      const params = new URLSearchParams();
      if (requestedSeasonId) params.set("seasonId", requestedSeasonId);
      if (requestedWeek) params.set("week", requestedWeek);
      const query = params.size ? `?${params.toString()}` : "";
      const resp = await fetch(`/api/public/weekly-handicap-review${query}`, {
        cache: "no-store",
      });
      const payload = (await resp.json()) as Payload;
      if (!active) return;
      setData(payload);
      setUpdatedAt(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedSeasonId]);

  const displayedSeasonId = selectedSeasonId || data?.season?.id || "";

  const batchLabel = data?.batchTime
    ? new Date(data.batchTime).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Awaiting review";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">
            Public Elo Review
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {data?.season?.name ?? "Weekly Elo Review"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {data?.week ? `Week ${data.week}` : "Latest completed week"} · Reviewed{" "}
            {batchLabel} · Updated {updatedAt || "--:--"}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {data?.isInformationOnly
              ? "Players whose Elo changed in the completed week. Division 1 remains scratch, so this is a performance review rather than a handicap review."
              : "Players whose Elo changed in eligible singles and doubles frames, showing their before-and-after Elo and current playing handicap. Nominated-player, no-show and void frames are excluded."}
          </p>
          {(data?.seasons?.length ?? 0) > 1 ? (
            <label className="mt-4 block max-w-xl text-sm font-semibold text-white">
              League
              <select
                className="mt-2 w-full rounded-xl border border-white/20 bg-slate-900 px-4 py-3 text-white"
                value={displayedSeasonId}
                onChange={(event) => {
                  const nextSeasonId = event.target.value;
                  setSelectedSeasonId(nextSeasonId);
                  window.history.replaceState(null, "", `${window.location.pathname}?seasonId=${encodeURIComponent(nextSeasonId)}`);
                }}
              >
                {data?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
              </select>
            </label>
          ) : null}
        </header>

        {data?.isInformationOnly ? (
          <section className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-sm text-violet-100">
            Division 1 Elo and its indicative handicap are for information only. Every Division 1 frame remains scratch, and these figures do not transfer into Premier handicapping. The League must separately assess and approve each promoted player&apos;s Premier starting handicap and rating.
          </section>
        ) : null}

        {data?.reviewNote ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
            <p className="font-semibold">Why some Week 1 handicap movements look unusually large</p>
            <p className="mt-1">{data.reviewNote}</p>
          </section>
        ) : null}

        {data?.error ? (
          <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">
            {data.error}
          </section>
        ) : null}

        {data && data.changes.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-slate-300 shadow-2xl shadow-black/20">
            No weekly Elo review data has been published yet.
          </section>
        ) : null}

        <section className="grid gap-4">
          {(data?.changes ?? []).map((row) => (
            <article
              key={row.playerId}
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
                    Player
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{row.name}</h2>
                  <p className="mt-2 text-sm text-slate-300">{row.reason}</p>
                </div>
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
                    Elo Review
                  </p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {row.previous} → {row.next}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Elo (Previous Week)
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">{row.previous}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Elo (After Week)
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {row.next}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {data?.isInformationOnly ? "Indicative Handicap" : "Playing Handicap Change"}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {data?.isInformationOnly
                      ? `${formatHandicap(row.illustrativeHandicap ?? row.target)} (scratch play)`
                      : `${formatHandicap(row.previousHandicap)} → ${formatHandicap(row.nextHandicap)}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {data?.isInformationOnly
                      ? "Information only; not applied to Division 1 matches"
                      : row.handicapChangedThisWeek
                        ? "Changed at the scheduled weekly review"
                        : "No handicap band change"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Rated frames counted this week: {row.ratedFrames}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

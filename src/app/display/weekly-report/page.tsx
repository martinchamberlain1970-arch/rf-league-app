"use client";

import { useEffect, useState } from "react";

type FixtureReport = {
  id: string;
  dateLabel: string;
  home: string;
  away: string;
  score: string;
  headline: string;
  expectedWinner: string;
  expectedPct: number;
  expectedHomePct: number;
  expectedAwayPct: number;
  expectationLabel: string;
  eloSummary: string;
  frameFacts: Array<{
    label: string;
    matchup: string;
    score: string;
    winner: string;
    handicapNote: string;
  }>;
};

type Payload = {
  season: { id: string; name: string } | null;
  seasons: Array<{ id: string; name: string }>;
  week: number | null;
  summary: {
    title: string;
    eloNote: string;
    upset: string;
    overperformance: string;
    star: string;
    formIndicators: string[];
    breaks: string[];
    lines: string[];
  } | null;
  fixtures: FixtureReport[];
  error?: string;
};

type EloHandicapChange = {
  playerId: string;
  name: string;
  previous: number;
  next: number;
  previousHandicap: number;
  nextHandicap: number;
  handicapChangedThisWeek: boolean;
  ratedFrames: number;
  reason: string;
};

type EloHandicapPayload = {
  season: { id: string; name: string } | null;
  week: number | null;
  changes: EloHandicapChange[];
  error?: string;
};

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export default function PublicWeeklyReportPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [eloHandicapData, setEloHandicapData] = useState<EloHandicapPayload | null>(null);
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
      const [reportResp, eloResp] = await Promise.all([
        fetch(`/api/public/weekly-report${query}`, { cache: "no-store" }),
        fetch(`/api/public/weekly-handicap-review${query}`, { cache: "no-store" }),
      ]);
      const payload = (await reportResp.json()) as Payload;
      const eloPayload = (await eloResp.json()) as EloHandicapPayload;
      if (!active) return;
      setData(payload);
      setEloHandicapData(eloPayload);
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
  const isDivisionOne = /division\s*1/i.test(data?.season?.name ?? "");

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">
            Public Weekly Report
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {data?.season?.name ?? "Weekly League Report"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {data?.week ? `Week ${data.week}` : "Awaiting a completed week"} · Updated{" "}
            {updatedAt || "--:--"}
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
                  const week = new URLSearchParams(window.location.search).get("week");
                  const nextUrl = new URL(window.location.href);
                  nextUrl.searchParams.set("seasonId", nextSeasonId);
                  if (week) nextUrl.searchParams.set("week", week);
                  window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
                }}
              >
                {data?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
              </select>
            </label>
          ) : null}
        </header>

        {isDivisionOne ? (
          <section className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-sm text-violet-100">
            Division 1 Elo is shown for performance information within Division 1 only. It is not a Premier League handicap or an automatic Premier League starting rating. If a team is promoted, each player&apos;s Premier starting position must be assessed and approved separately.
          </section>
        ) : null}

        {data?.error ? (
          <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">
            {data.error}
          </section>
        ) : null}

        {data?.summary ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
                Round-up
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">{data.summary.title}</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-100">
                <p>
                  <span className="font-semibold text-white">Biggest upset:</span>{" "}
                  {data.summary.upset}
                </p>
                <p>
                  <span className="font-semibold text-white">
                    Standout Elo over-performance:
                  </span>{" "}
                  {data.summary.overperformance}
                </p>
                <p>
                  <span className="font-semibold text-white">Standout player:</span>{" "}
                  {data.summary.star}
                </p>
                <div>
                  <span className="font-semibold text-white">Form indicators:</span>
                  {data.summary.formIndicators.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-sm text-slate-100">
                      {data.summary.formIndicators.map((line) => (
                        <li key={line} className="rounded-2xl border border-violet-300/20 bg-violet-300/10 px-4 py-3">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-slate-300">No extra form indicators stood out this week.</p>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-white">Stand-out 30+ breaks:</span>
                  {data.summary.breaks.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-sm text-slate-100">
                      {data.summary.breaks.map((line) => (
                        <li key={line} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-slate-300">No 30+ breaks were recorded in the completed week.</p>
                  )}
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
                Results
              </p>
              <ul className="mt-3 space-y-3 text-sm text-slate-100">
                {data.summary.lines.map((line) => (
                  <li key={line} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    {line}
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-slate-300 shadow-2xl shadow-black/20">
            Weekly report appears when the latest published week is complete.
          </section>
        )}

        {!isDivisionOne ? (
          <section className="rounded-3xl border border-amber-300/20 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
                  Elo &amp; Handicap Review
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  Week {eloHandicapData?.week ?? data?.week ?? "-"} changes
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Elo changes are calculated from eligible completed singles and doubles frames. Nominated-player, no-show and void frames are excluded. Playing handicaps show the scheduled Proposal 2 review outcome.
                </p>
              </div>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                {(eloHandicapData?.changes ?? []).length} players changed Elo
              </span>
            </div>

            {eloHandicapData?.error ? (
              <p className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                The Elo and handicap section is not ready: {eloHandicapData.error}
              </p>
            ) : (eloHandicapData?.changes ?? []).length === 0 ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                No Elo changes have been recorded for this completed week yet.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3">Elo</th>
                      <th className="px-4 py-3">Frames</th>
                      <th className="px-4 py-3">Handicap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(eloHandicapData?.changes ?? []).map((row) => (
                      <tr key={row.playerId} className="bg-slate-950/20">
                        <td className="px-4 py-3 text-white">
                          <p className="font-semibold">{row.name}</p>
                          <p className="mt-2 max-w-3xl text-xs font-normal leading-5 text-slate-400">
                            {row.reason}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-cyan-100">{row.previous} → {row.next}</td>
                        <td className="px-4 py-3 text-slate-300">{row.ratedFrames}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-amber-100">
                          {signed(row.previousHandicap)} → {signed(row.nextHandicap)}
                          <span className="ml-2 text-xs text-slate-400">
                            {row.handicapChangedThisWeek ? "changed" : "unchanged"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        <section className="space-y-4">
          {(data?.fixtures ?? []).map((fixture) => (
            <article
              key={fixture.id}
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
                    Match Report
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white">
                    {fixture.home} vs {fixture.away}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {fixture.dateLabel} · Result {fixture.score}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                    Expected Favourite
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {fixture.expectedWinner} ({fixture.expectedPct}%)
                  </p>
                  <p className="mt-1 text-xs text-emerald-200">
                    {fixture.home} {fixture.expectedHomePct}% · {fixture.away}{" "}
                    {fixture.expectedAwayPct}%
                  </p>
                </div>
              </div>

              <p className="mt-4 text-base font-semibold text-white">{fixture.headline}</p>
              <p className="mt-2 text-sm text-slate-300">{fixture.expectationLabel}</p>
              <p className="mt-2 text-sm text-slate-300">{fixture.eloSummary}</p>

              <div className="mt-5 space-y-3">
                {fixture.frameFacts.map((frame) => (
                  <div
                    key={`${fixture.id}-${frame.label}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-sm font-semibold text-cyan-300">{frame.label}</p>
                    <p className="mt-1 text-sm text-white">{frame.matchup}</p>
                    <p className="mt-1 text-sm text-slate-300">
                      Score: {frame.score} · Winner: {frame.winner}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

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
  deferredFixtures?: Array<{
    id: string;
    dateLabel: string;
    home: string;
    away: string;
    note: string;
  }>;
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
  target: number;
  illustrativeHandicap: number;
  reason: string;
};

type EloHandicapPayload = {
  season: { id: string; name: string } | null;
  week: number | null;
  isInformationOnly?: boolean;
  reviewNote?: string | null;
  changes: EloHandicapChange[];
  error?: string;
};

type ReportTab = "overview" | "elo" | "matches";

const reportTabs: Array<{ id: ReportTab; label: string; description: string }> = [
  { id: "overview", label: "Weekly overview", description: "Results and highlights" },
  { id: "elo", label: "Elo & handicaps", description: "Player rating changes" },
  { id: "matches", label: "Who played who", description: "Every frame and score" },
];

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export default function PublicWeeklyReportPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [eloHandicapData, setEloHandicapData] = useState<EloHandicapPayload | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (reportTabs.some((tab) => tab.id === requestedTab)) {
      setActiveTab(requestedTab as ReportTab);
    }
  }, []);

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

  function chooseTab(tab: ReportTab) {
    setActiveTab(tab);
    const nextUrl = new URL(window.location.href);
    if (tab === "overview") nextUrl.searchParams.delete("tab");
    else nextUrl.searchParams.set("tab", tab);
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

        <nav
          aria-label="Weekly report sections"
          className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-white/10 bg-slate-950/95 px-4 py-3 shadow-lg backdrop-blur sm:mx-0 sm:rounded-2xl sm:border"
        >
          <div className="flex min-w-max gap-2 md:grid md:min-w-0 md:grid-cols-3">
            {reportTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => chooseTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`min-w-44 rounded-xl px-4 py-3 text-left transition md:min-w-0 ${
                  activeTab === tab.id
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                <span className="block text-sm font-black">{tab.label}</span>
                <span className={`mt-0.5 block text-xs ${activeTab === tab.id ? "text-slate-800" : "text-slate-400"}`}>
                  {tab.description}
                </span>
              </button>
            ))}
          </div>
        </nav>

        {activeTab === "overview" && data?.summary ? (
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
        ) : activeTab === "overview" ? (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-slate-300 shadow-2xl shadow-black/20">
            Weekly report appears when the latest published week is complete.
          </section>
        ) : null}

        {activeTab === "overview" && (data?.deferredFixtures ?? []).length > 0 ? (
          <section className="rounded-3xl border border-sky-300/30 bg-sky-400/10 p-5 text-sky-50 shadow-2xl shadow-black/20">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">
              Deferred fixture
            </p>
            {(data?.deferredFixtures ?? []).map((fixture) => (
              <div key={fixture.id} className="mt-3">
                <p className="font-semibold">{fixture.home} vs {fixture.away}</p>
                <p className="mt-1 text-sm text-sky-100">{fixture.note}</p>
              </div>
            ))}
          </section>
        ) : null}

        {activeTab === "elo" ? (
          <section className={`rounded-3xl border bg-slate-900/80 p-5 shadow-2xl shadow-black/20 ${isDivisionOne ? "border-violet-300/20" : "border-amber-300/20"}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
                  {isDivisionOne ? "Elo & Indicative Handicap Review" : "Elo & Handicap Review"}
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  Week {eloHandicapData?.week ?? data?.week ?? "-"} changes
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  {isDivisionOne
                    ? "Elo changes are calculated from eligible completed singles and doubles frames. The indicative handicap is supplied for information only; every Division 1 frame remains scratch."
                    : "Elo changes are calculated from eligible completed singles and doubles frames. Nominated-player, no-show and void frames are excluded. Playing handicaps show the scheduled Proposal 2 review outcome."}
                </p>
              </div>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                {(eloHandicapData?.changes ?? []).length} players reviewed
              </span>
            </div>

            {eloHandicapData?.reviewNote ? (
              <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">
                <p className="font-semibold">Why some Week 1 handicap movements look unusually large</p>
                <p className="mt-1">{eloHandicapData.reviewNote}</p>
              </div>
            ) : null}

            {eloHandicapData?.error ? (
              <p className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                The Elo and handicap section is not ready: {eloHandicapData.error}
              </p>
            ) : (eloHandicapData?.changes ?? []).length === 0 ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                No Elo or handicap changes have been recorded for this completed week yet.
              </p>
            ) : (
              <>
                <div className="mt-5 space-y-3 lg:hidden">
                  {(eloHandicapData?.changes ?? []).map((row) => (
                    <article
                      key={row.playerId}
                      className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/30 p-4"
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 break-words font-semibold text-white">
                          {row.name}
                        </h3>
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                          {row.ratedFrames} rated {row.ratedFrames === 1 ? "frame" : "frames"}
                        </span>
                      </div>

                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3">
                          <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                            Elo
                          </dt>
                          <dd className="mt-1 text-base font-semibold text-cyan-50">
                            {row.previous} → {row.next}
                          </dd>
                        </div>
                        <div className="min-w-0 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3">
                          <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
                            {isDivisionOne ? "Playing start" : "Handicap"}
                          </dt>
                          <dd className="mt-1 break-words text-base font-semibold text-amber-50">
                            {isDivisionOne ? (
                              <>
                                Scratch
                                <span className="ml-2 text-xs font-normal text-slate-400">
                                  indicative {signed(row.illustrativeHandicap ?? row.target)}
                                </span>
                              </>
                            ) : (
                              <>
                                {signed(row.previousHandicap)} → {signed(row.nextHandicap)}
                                <span className="ml-2 text-xs font-normal text-slate-400">
                                  {row.handicapChangedThisWeek ? "changed" : "unchanged"}
                                </span>
                              </>
                            )}
                          </dd>
                        </div>
                      </dl>

                      <p className="mt-4 break-words text-sm font-normal leading-6 text-slate-300 [overflow-wrap:anywhere]">
                        {row.reason}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-white/10 lg:block">
                  <table className="min-w-[960px] table-fixed divide-y divide-white/10 text-left text-sm">
                  <colgroup>
                    <col className="w-[58%]" />
                    <col className="w-[14%]" />
                    <col className="w-[10%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3">Elo</th>
                      <th className="px-4 py-3">Frames</th>
                      <th className="px-4 py-3">{isDivisionOne ? "Scratch / indicative" : "Handicap"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(eloHandicapData?.changes ?? []).map((row) => (
                      <tr key={row.playerId} className="bg-slate-950/20">
                        <td className="px-4 py-3 text-white">
                          <p className="font-semibold">{row.name}</p>
                          <p className="mt-2 max-w-3xl break-words text-xs font-normal leading-5 text-slate-400 [overflow-wrap:anywhere]">
                            {row.reason}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-cyan-100">{row.previous} → {row.next}</td>
                        <td className="px-4 py-3 text-slate-300">{row.ratedFrames}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-amber-100">
                          {isDivisionOne ? (
                            <>
                              Scratch
                              <span className="ml-2 text-xs text-slate-400">
                                indicative {signed(row.illustrativeHandicap ?? row.target)}
                              </span>
                            </>
                          ) : (
                            <>
                              {signed(row.previousHandicap)} → {signed(row.nextHandicap)}
                              <span className="ml-2 text-xs text-slate-400">
                                {row.handicapChangedThisWeek ? "changed" : "unchanged"}
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </section>
        ) : null}

        {activeTab === "matches" ? (
          <section className="space-y-4">
          {(data?.fixtures ?? []).length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-center text-slate-300 shadow-2xl shadow-black/20">
              Frame-by-frame match reports will appear after results are approved.
            </div>
          ) : null}
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
        ) : null}
      </div>
    </main>
  );
}

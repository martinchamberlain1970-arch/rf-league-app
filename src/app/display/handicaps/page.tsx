"use client";

import { useEffect, useState } from "react";

type HandicapRow = {
  rank: number;
  player_name: string;
  elo: number;
  target_handicap: number;
  current_handicap: number;
  gap_to_target: number;
  baseline_handicap: number;
  rated_matches: number;
};

type Payload = {
  season: { id: string; name: string } | null;
  seasons: Array<{ id: string; name: string }>;
  isInformationOnly?: boolean;
  handicaps: HandicapRow[];
  error?: string;
};

const formatHandicap = (value: number) => (value > 0 ? `+${value}` : `${value}`);

export default function PublicHandicapsPage() {
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
      const query = requestedSeasonId ? `?seasonId=${encodeURIComponent(requestedSeasonId)}` : "";
      const resp = await fetch(`/api/public/handicaps${query}`, { cache: "no-store" });
      const payload = (await resp.json()) as Payload;
      if (!active) return;
      setData(payload);
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
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

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Public Handicap List</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{data?.season?.name ?? "Current Handicaps"}</h1>
          <p className="mt-2 text-sm text-slate-300">Updated {updatedAt || "--:--"}</p>
          {(data?.seasons?.length ?? 0) > 1 ? <label className="mt-4 block max-w-xl text-sm font-semibold text-white">League<select className="mt-2 w-full rounded-xl border border-white/20 bg-slate-900 px-4 py-3 text-white" value={displayedSeasonId} onChange={(event) => { const nextSeasonId = event.target.value; setSelectedSeasonId(nextSeasonId); window.history.replaceState(null, "", `${window.location.pathname}?seasonId=${encodeURIComponent(nextSeasonId)}`); }}>{data?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label> : null}
        </header>

        <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          {data?.isInformationOnly ? "Division 1 is played from scratch. Elo is displayed as performance information only and is not a playing handicap." : "Elo updates automatically when a match result is approved and complete. Handicap does not auto-change after every match; it is reviewed from Elo and any league decisions."}
        </section>

        {data?.isInformationOnly ? <section className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-violet-100">A Division 1 Elo does not transfer into the Premier League. If a team is promoted, each player must be given a separately assessed and approved Premier League starting handicap and rating.</section> : <section className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-violet-100">
          `Target from Elo` shows where a player currently projects from their rating. `Current` is the live handicap being used on match night, so any difference means the latest Elo review still needs to bring that handicap back into line.
        </section>}

        {!data?.isInformationOnly ? <section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          `Gap to target` is `target from Elo - current handicap`. `0` means aligned. Negative means the handicap needs to move further into giving start, while positive means it needs to move further into receiving start.
        </section> : null}

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm sm:text-base">
              <thead className="bg-white/5 text-left text-slate-300">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Player</th>
                  <th className="px-3 py-3 text-center">Elo</th>
                  {!data?.isInformationOnly ? <><th className="px-3 py-3 text-center">Target From Elo</th><th className="px-3 py-3 text-center">Current</th><th className="px-3 py-3 text-center">Gap To Target</th><th className="px-3 py-3 text-center">Baseline</th></> : null}
                  <th className="px-3 py-3 text-center">Rated Matches</th>
                </tr>
              </thead>
              <tbody>
                {(data?.handicaps ?? []).map((row) => (
                  <tr key={`${row.rank}-${row.player_name}`} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td>
                    <td className="px-3 py-3 font-medium">{row.player_name}</td>
                    <td className="px-3 py-3 text-center">{row.elo}</td>
                    {!data?.isInformationOnly ? <><td className="px-3 py-3 text-center font-semibold text-sky-300">{formatHandicap(row.target_handicap)}</td><td className="px-3 py-3 text-center font-semibold text-emerald-300">{formatHandicap(row.current_handicap)}</td><td className="px-3 py-3 text-center font-semibold text-cyan-300">{formatHandicap(row.gap_to_target)}</td><td className="px-3 py-3 text-center">{formatHandicap(row.baseline_handicap)}</td></> : null}
                    <td className="px-3 py-3 text-center">{row.rated_matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

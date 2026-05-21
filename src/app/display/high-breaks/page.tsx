"use client";

import { useEffect, useMemo, useState } from "react";
import InfoModal from "@/components/InfoModal";

type SeasonOption = {
  id: string;
  name: string;
};

type BreakHistoryRow = {
  break_value: number;
  fixture_label: string;
  fixture_date: string | null;
};

type HighBreakRow = {
  rank: number;
  key: string;
  player_name: string;
  high_break: number;
  century_count: number;
  breaks_30_plus: number;
  league_names: string[];
  break_history: BreakHistoryRow[];
};

type Payload = {
  seasons: SeasonOption[];
  selected_season_id: string;
  rows: HighBreakRow[];
  error?: string;
};

function formatHistory(row: HighBreakRow) {
  return row.break_history
    .map((entry) => {
      const dateLabel = entry.fixture_date
        ? new Date(`${entry.fixture_date}T12:00:00`).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "Date not recorded";
      return `${entry.break_value} - ${entry.fixture_label}\n${dateLabel}`;
    })
    .join("\n\n");
}

export default function PublicHighBreaksPage() {
  const [selectedSeasonId, setSelectedSeasonId] = useState("all");
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<HighBreakRow | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const resp = await fetch(`/api/public/high-breaks?seasonId=${encodeURIComponent(selectedSeasonId)}`, { cache: "no-store" });
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

  const summary = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      topBreak: rows[0]?.high_break ?? 0,
      centuries: rows.reduce((sum, row) => sum + row.century_count, 0),
      totalThirtyPlus: rows.reduce((sum, row) => sum + row.breaks_30_plus, 0),
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Public High Breaks</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Leading Break Builders</h1>
          <p className="mt-2 text-sm text-slate-300">Published league 30+ breaks · Updated {updatedAt || "--:--"}</p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-300" htmlFor="public-high-break-season-filter">
              Published league
            </label>
            <select
              id="public-high-break-season-filter"
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              <option value="all">All published leagues</option>
              {(data?.seasons ?? []).map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Top break</p>
              <p className="mt-2 text-3xl font-black text-white">{summary.topBreak}</p>
            </div>
            <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Century breaks</p>
              <p className="mt-2 text-3xl font-black text-white">{summary.centuries}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Breaks 30+</p>
              <p className="mt-2 text-3xl font-black text-white">{summary.totalThirtyPlus}</p>
            </div>
          </div>
        </section>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20">
          {data && data.rows.length === 0 ? (
            <div className="p-6 text-sm text-slate-300">No 30+ breaks have been recorded for the selected published league(s).</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm sm:text-base">
                <thead className="bg-white/5 text-left text-slate-300">
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Player</th>
                    <th className="px-3 py-3 text-center">High</th>
                    <th className="px-3 py-3 text-center">100+</th>
                    <th className="px-3 py-3 text-center">30+</th>
                    <th className="px-3 py-3">League(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((row) => (
                    <tr key={row.key} className="border-t border-white/5 text-slate-100">
                      <td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td>
                      <td className="px-3 py-3 font-medium">
                        <button
                          type="button"
                          className="text-left text-cyan-100 underline decoration-cyan-500/50 underline-offset-4 hover:text-white"
                          onClick={() => setSelectedPlayer(row)}
                        >
                          {row.player_name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-white">{row.high_break}</td>
                      <td className="px-3 py-3 text-center">{row.century_count}</td>
                      <td className="px-3 py-3 text-center">{row.breaks_30_plus}</td>
                      <td className="px-3 py-3 text-slate-300">{row.league_names.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <InfoModal
        open={Boolean(selectedPlayer)}
        title={selectedPlayer ? `${selectedPlayer.player_name} Breaks 30+` : "Break history"}
        description={selectedPlayer ? formatHistory(selectedPlayer) : ""}
        closeLabel="Close"
        onClose={() => setSelectedPlayer(null)}
      />
    </main>
  );
}

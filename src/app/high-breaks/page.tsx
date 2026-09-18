"use client";

import { useEffect, useMemo, useState } from "react";
import InfoModal from "@/components/InfoModal";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";

type Season = { id: string; name: string; is_published: boolean | null };
type BreakHistoryRow = {
  breakValue: number;
  fixtureLabel: string;
  fixtureDate: string | null;
};

type TableRow = {
  key: string;
  playerName: string;
  highBreak: number;
  centuryCount: number;
  breaks30Plus: number;
  seasons: Set<string>;
  breakHistory: BreakHistoryRow[];
};

export default function LeagueHighBreaksPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("all");
  const [selectedPlayer, setSelectedPlayer] = useState<TableRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/public/high-breaks?seasonId=${encodeURIComponent(selectedSeasonId)}`, { cache: "no-store" });
        const payload = await response.json() as {
          error?: string;
          seasons?: Array<{ id: string; name: string }>;
          league_rows?: Array<{
            key: string;
            player_name: string;
            high_break: number;
            century_count: number;
            breaks_30_plus: number;
            league_names: string[];
            break_history: Array<{ break_value: number; fixture_label: string; fixture_date: string | null }>;
          }>;
        };
        if (!response.ok) throw new Error(payload.error || "High breaks could not be loaded.");
        if (!active) return;
        setSeasons((payload.seasons ?? []).map((season) => ({ ...season, is_published: true })));
        setRows((payload.league_rows ?? []).map((row) => ({
          key: row.key,
          playerName: row.player_name,
          highBreak: row.high_break,
          centuryCount: row.century_count,
          breaks30Plus: row.breaks_30_plus,
          seasons: new Set(row.league_names),
          breakHistory: row.break_history.map((entry) => ({
            breakValue: entry.break_value,
            fixtureLabel: entry.fixture_label,
            fixtureDate: entry.fixture_date,
          })),
        })));
      } catch (error) {
        if (!active) return;
        setRows([]);
        setMessage(error instanceof Error ? error.message : "High breaks could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [selectedSeasonId]);

  const selectedPlayerDescription = useMemo(() => {
    if (!selectedPlayer) return "";
    return selectedPlayer.breakHistory
      .map((entry) => {
        const dateLabel = entry.fixtureDate
          ? new Date(`${entry.fixtureDate}T12:00:00`).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Date not recorded";
        return `${entry.breakValue} - ${entry.fixtureLabel}\n${dateLabel}`;
      })
      .join("\n\n");
  }, [selectedPlayer]);

  const topBreak = rows[0]?.highBreak ?? 0;
  const totalCenturies = rows.reduce((sum, row) => sum + row.centuryCount, 0);
  const totalThirtyPlus = rows.reduce((sum, row) => sum + row.breaks30Plus, 0);

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="High Break Table" eyebrow="League" subtitle="Published league breaks recorded from approved fixture results." />
          <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950 shadow-sm">
            Competition breaks are recorded separately when an approved competition result includes a 30+ break. View the public breakdown for <a href="/display/high-breaks" className="font-bold underline underline-offset-2">league fixtures, competitions and the overall season</a>.
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-slate-700" htmlFor="season-filter">Published league</label>
              <select
                id="season-filter"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
              >
                <option value="all">All published leagues</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top recorded break</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{topBreak}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Century breaks</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{totalCenturies}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Breaks 30+</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{totalThirtyPlus}</p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {loading ? <p className="text-sm text-slate-600">Loading high breaks...</p> : null}
            {!loading && message ? <p className="text-sm text-rose-700">{message}</p> : null}
            {!loading && !message ? (
              rows.length === 0 ? (
                <p className="text-sm text-slate-600">No 30+ breaks have been recorded for the selected published league(s).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Player</th>
                        <th className="px-3 py-2">High break</th>
                        <th className="px-3 py-2">Centuries</th>
                        <th className="px-3 py-2">Breaks 30+</th>
                        <th className="px-3 py-2">League(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-2 font-medium text-slate-900">#{index + 1}</td>
                          <td className="px-3 py-2 text-slate-900">
                            <button
                              type="button"
                              className="text-left font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800"
                              onClick={() => setSelectedPlayer(row)}
                            >
                              {row.playerName}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-slate-900">{row.highBreak}</td>
                          <td className="px-3 py-2 text-slate-700">{row.centuryCount}</td>
                          <td className="px-3 py-2 text-slate-700">{row.breaks30Plus}</td>
                          <td className="px-3 py-2 text-slate-700">{Array.from(row.seasons).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </section>
        </RequireAuth>
      </div>
      <InfoModal
        open={Boolean(selectedPlayer)}
        title={selectedPlayer ? `${selectedPlayer.playerName} · 30+ breaks` : "30+ breaks"}
        description={selectedPlayerDescription}
        closeLabel="Close"
        onClose={() => setSelectedPlayer(null)}
      />
    </main>
  );
}

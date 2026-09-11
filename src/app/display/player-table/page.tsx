"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PlayerRow = {
  rank: number;
  player_id: string;
  player_name: string;
  team_id: string | null;
  team_name: string;
  appearances: number;
  played: number;
  won: number;
  lost: number;
  points_for: number;
  points_against: number;
  win_pct: number;
};

type Payload = {
  season: { id: string; name: string } | null;
  seasons: Array<{ id: string; name: string }>;
  mode: "singles" | "doubles" | "pairings";
  players: PlayerRow[];
  error?: string;
};

type TableMode = "singles" | "doubles" | "pairings";

const modeHeading: Record<TableMode, string> = {
  singles: "Leading Singles Players",
  doubles: "Leading Doubles Players",
  pairings: "Leading Doubles Pairings",
};

function shortSeasonName(name: string) {
  const season = name.match(/20\d{2}\s*(?:\/|-)\s*20?\d{2}/)?.[0]?.replace(/\s/g, "") ?? "";
  if (/premier league/i.test(name)) return `Premier League${season ? ` ${season}` : ""}`;
  if (/division\s*1/i.test(name)) return `Division 1${season ? ` ${season}` : ""}`;
  return name;
}

export default function PublicPlayerTablePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [mode, setMode] = useState<TableMode>("singles");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const params = new URLSearchParams({ mode });
      if (selectedSeasonId) params.set("seasonId", selectedSeasonId);
      const resp = await fetch(`/api/public/player-table?${params.toString()}`, { cache: "no-store" });
      const payload = (await resp.json()) as Payload;
      if (!active) return;
      setData(payload);
      setSelectedSeasonId((current) => current || payload.season?.id || "");
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
  }, [mode, selectedSeasonId]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Public Player Table</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{modeHeading[mode]}</h1>
            <div className="grid grid-cols-3 rounded-xl border border-white/15 bg-slate-950/50 p-1" aria-label="Player table type">
              {(["singles", "doubles", "pairings"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold capitalize sm:px-4 ${mode === option ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-300">{data?.season?.name ?? "Published league season"} · Updated {updatedAt || "--:--"}</p>
          {(data?.seasons?.length ?? 0) > 1 ? (
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/15 bg-slate-950/50 p-1" aria-label="League">
              {(data?.seasons ?? []).map((season) => (
                <button
                  key={season.id}
                  type="button"
                  onClick={() => setSelectedSeasonId(season.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${(selectedSeasonId || data?.season?.id) === season.id ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}
                >
                  {shortSeasonName(season.name)}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm sm:text-base">
              <thead className="bg-white/5 text-left text-slate-300">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">{mode === "pairings" ? "Pairing" : "Player"}</th>
                  <th className="px-3 py-3">Team</th>
                  <th className="px-3 py-3 text-center">App</th>
                  <th className="px-3 py-3 text-center">P</th>
                  <th className="px-3 py-3 text-center">W</th>
                  <th className="px-3 py-3 text-center">L</th>
                  <th className="px-3 py-3 text-center">PF</th>
                  <th className="px-3 py-3 text-center">PA</th>
                  <th className="px-3 py-3 text-center">Win %</th>
                </tr>
              </thead>
              <tbody>
                {(data?.players ?? []).map((row) => (
                  <tr key={`${row.rank}-${row.player_id}`} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td>
                    <td className="px-3 py-3 font-medium">
                      {mode === "pairings" ? row.player_name : (
                        <Link href={`/league-hub/player/${row.player_id}?seasonId=${encodeURIComponent(selectedSeasonId || data?.season?.id || "")}`} className="underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-200">
                          {row.player_name}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {row.team_id ? (
                        <Link href={`/league-hub/team/${row.team_id}?seasonId=${encodeURIComponent(selectedSeasonId || data?.season?.id || "")}`} className="underline decoration-cyan-400/30 underline-offset-4 hover:text-cyan-200">
                          {row.team_name}
                        </Link>
                      ) : row.team_name}
                    </td>
                    <td className="px-3 py-3 text-center">{row.appearances}</td>
                    <td className="px-3 py-3 text-center">{row.played}</td>
                    <td className="px-3 py-3 text-center">{row.won}</td>
                    <td className="px-3 py-3 text-center">{row.lost}</td>
                    <td className="px-3 py-3 text-center">{row.points_for}</td>
                    <td className="px-3 py-3 text-center">{row.points_against}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-300">{row.win_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.players.length === 0 ? (
            <p className="border-t border-white/5 px-4 py-8 text-center text-slate-300">
              {mode === "pairings" ? "No completed doubles pairings have been recorded for this league yet." : `No completed ${mode} frames have been recorded for this league yet.`}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

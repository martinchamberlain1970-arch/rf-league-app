"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LeagueRow = {
  rank: number;
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  lost: number;
  frames_for: number;
  frames_against: number;
  frame_diff: number;
  points: number;
};

type Payload = {
  season: { id: string; name: string } | null;
  seasons: Array<{ id: string; name: string }>;
  leagueTable: LeagueRow[];
  error?: string;
};

function shortSeasonName(name: string) {
  const season = name.match(/20\d{2}\s*(?:\/|-)\s*20?\d{2}/)?.[0]?.replace(/\s/g, "") ?? "";
  if (/premier league/i.test(name)) return `Premier League${season ? ` ${season}` : ""}`;
  if (/division\s*1/i.test(name)) return `Division 1${season ? ` ${season}` : ""}`;
  return name;
}

export default function PublicLeagueTablePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");

  useEffect(() => {
    setSelectedSeasonId(new URLSearchParams(window.location.search).get("seasonId")?.trim() ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const query = selectedSeasonId ? `?seasonId=${encodeURIComponent(selectedSeasonId)}` : "";
      const resp = await fetch(`/api/public/league-board${query}`, { cache: "no-store" });
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
  }, [selectedSeasonId]);

  const chooseSeason = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    window.history.replaceState(null, "", `${window.location.pathname}?seasonId=${encodeURIComponent(seasonId)}`);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Public League Table</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{data?.season?.name ?? "League Table"}</h1>
          <p className="mt-2 text-sm text-slate-300">Updated {updatedAt || "--:--"}</p>
          {(data?.seasons?.length ?? 0) > 1 ? (
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/15 bg-slate-950/50 p-1" aria-label="League">
              {(data?.seasons ?? []).map((season) => (
                <button
                  key={season.id}
                  type="button"
                  onClick={() => chooseSeason(season.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${(selectedSeasonId || data?.season?.id) === season.id ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}
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
                  <th className="px-3 py-3">Team</th>
                  <th className="px-3 py-3 text-center">P</th>
                  <th className="px-3 py-3 text-center">W</th>
                  <th className="px-3 py-3 text-center">L</th>
                  <th className="px-3 py-3 text-center">FF</th>
                  <th className="px-3 py-3 text-center">FA</th>
                  <th className="px-3 py-3 text-center">Diff</th>
                  <th className="px-3 py-3 text-center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {(data?.leagueTable ?? []).map((row) => (
                  <tr key={row.team_name} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td>
                    <td className="px-3 py-3 font-medium">
                      <Link href={`/league-hub/team/${row.team_id}?seasonId=${encodeURIComponent(data?.season?.id ?? "")}`} className="underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-200">
                        {row.team_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center">{row.played}</td>
                    <td className="px-3 py-3 text-center">{row.won}</td>
                    <td className="px-3 py-3 text-center">{row.lost}</td>
                    <td className="px-3 py-3 text-center">{row.frames_for}</td>
                    <td className="px-3 py-3 text-center">{row.frames_against}</td>
                    <td className="px-3 py-3 text-center">{row.frame_diff > 0 ? `+${row.frame_diff}` : row.frame_diff}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-300">{row.points}</td>
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

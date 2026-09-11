"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type TeamPayload = {
  season: { id: string; name: string };
  team: { id: string; name: string };
  roster: Array<{ id: string; name: string; rating: number; handicap: number; appearances: number; played: number; won: number; lost: number }>;
  fixtures: Array<{ id: string; fixtureDate: string | null; weekNo: number | null; homeTeam: string; awayTeam: string; status: string; homePoints: number | null; awayPoints: number | null }>;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "Date TBC";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export default function PublicTeamRecordPage() {
  const params = useParams();
  const teamId = String(params.id ?? "");
  const [seasonId, setSeasonId] = useState("");
  const [data, setData] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setSeasonId(new URLSearchParams(window.location.search).get("seasonId") ?? ""), []);
  useEffect(() => {
    if (!seasonId || !teamId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const response = await fetch(`/api/public/team/${encodeURIComponent(teamId)}?seasonId=${encodeURIComponent(seasonId)}`, { cache: "no-store" });
      const payload = await response.json() as TeamPayload;
      if (active) {
        setData(payload);
        setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [seasonId, teamId]);

  const completed = data?.fixtures.filter((fixture) => fixture.status === "complete") ?? [];
  const upcoming = data?.fixtures.filter((fixture) => fixture.status !== "complete") ?? [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Link href={`/league-hub?seasonId=${encodeURIComponent(seasonId)}&tab=table`} className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-white/10">
          ← Back to league hub
        </Link>
        {loading ? <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">Loading team record…</div> : null}
        {data?.error ? <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</div> : null}
        {!loading && data && !data.error ? (
          <>
            <header className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-slate-900 to-cyan-950 p-6 shadow-2xl shadow-black/20">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">Public team record</p>
              <h1 className="mt-2 text-3xl font-black">{data.team.name}</h1>
              <p className="mt-2 text-sm text-slate-300">{data.season.name}</p>
            </header>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="text-xl font-black">Current-season squad</h2>
              <p className="mt-1 text-sm text-slate-400">Select a player to see every recorded opponent and frame result.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.roster.map((player) => (
                  <Link key={player.id} href={`/league-hub/player/${player.id}?seasonId=${encodeURIComponent(seasonId)}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-300/40 hover:bg-cyan-300/10">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-bold text-cyan-100 underline decoration-cyan-400/50 underline-offset-4">{player.name}</span>
                      <span className="text-xs text-slate-400">View record →</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{player.played} played · {player.won} won · {player.lost} lost</p>
                    <p className="mt-1 text-xs text-slate-400">Elo {player.rating} · Handicap {signed(player.handicap)}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="text-xl font-black">Results</h2>
              <div className="mt-4 space-y-3">
                {completed.map((fixture) => (
                  <Link key={fixture.id} href={`/display/weekly-report?seasonId=${encodeURIComponent(seasonId)}&week=${fixture.weekNo ?? ""}&tab=matches#fixture-${fixture.id}`} className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-300/40 hover:bg-cyan-300/10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-white">{fixture.homeTeam} vs {fixture.awayTeam}</span>
                      <span className="font-black text-emerald-300">{fixture.homePoints ?? 0}–{fixture.awayPoints ?? 0}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Week {fixture.weekNo ?? "–"} · {formatDate(fixture.fixtureDate)} · View every frame →</p>
                  </Link>
                ))}
                {completed.length === 0 ? <p className="text-sm text-slate-400">No approved results yet.</p> : null}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="text-xl font-black">Upcoming fixtures</h2>
              <div className="mt-4 space-y-3">
                {upcoming.map((fixture) => (
                  <div key={fixture.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="font-semibold">{fixture.homeTeam} vs {fixture.awayTeam}</p>
                    <p className="mt-1 text-xs text-slate-400">Week {fixture.weekNo ?? "–"} · {formatDate(fixture.fixtureDate)}</p>
                  </div>
                ))}
                {upcoming.length === 0 ? <p className="text-sm text-slate-400">No upcoming fixtures.</p> : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

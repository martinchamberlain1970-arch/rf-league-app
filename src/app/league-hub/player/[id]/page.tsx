"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PlayerPayload = {
  season: { id: string; name: string };
  player: { id: string; name: string; rating: number; handicap: number };
  teams: Array<{ id: string; name: string }>;
  summary: { played: number; won: number; lost: number; winPct: number; appearances: number };
  frames: Array<{
    fixtureId: string;
    fixtureDate: string | null;
    weekNo: number | null;
    fixtureLabel: string;
    frameLabel: string;
    opponents: Array<{ id: string; name: string }>;
    teammates: Array<{ id: string; name: string }>;
    score: string;
    outcome: "Won" | "Lost" | "Excluded";
    rated: boolean;
  }>;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "Date TBC";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function PlayerLinks({ players, seasonId }: { players: Array<{ id: string; name: string }>; seasonId: string }) {
  return players.map((player, index) => (
    <span key={player.id}>
      {index > 0 ? " / " : ""}
      <Link href={`/league-hub/player/${player.id}?seasonId=${encodeURIComponent(seasonId)}`} className="underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-200">
        {player.name}
      </Link>
    </span>
  ));
}

export default function PublicPlayerRecordPage() {
  const params = useParams();
  const playerId = String(params.id ?? "");
  const [seasonId, setSeasonId] = useState("");
  const [data, setData] = useState<PlayerPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setSeasonId(new URLSearchParams(window.location.search).get("seasonId") ?? ""), []);
  useEffect(() => {
    if (!seasonId || !playerId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const response = await fetch(`/api/public/player/${encodeURIComponent(playerId)}?seasonId=${encodeURIComponent(seasonId)}`, { cache: "no-store" });
      const payload = await response.json() as PlayerPayload;
      if (active) {
        setData(payload);
        setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [playerId, seasonId]);

  const backTeam = data?.teams[0];
  const backHref = backTeam
    ? `/league-hub/team/${backTeam.id}?seasonId=${encodeURIComponent(seasonId)}`
    : `/league-hub?seasonId=${encodeURIComponent(seasonId)}&tab=players`;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href={backHref} className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-white/10">← Back</Link>
        {loading ? <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">Loading player record…</div> : null}
        {data?.error ? <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</div> : null}
        {!loading && data && !data.error ? (
          <>
            <header className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-slate-900 to-cyan-950 p-6 shadow-2xl shadow-black/20">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">Public player record</p>
              <h1 className="mt-2 text-3xl font-black">{data.player.name}</h1>
              <p className="mt-2 text-sm text-slate-300">{data.teams.map((team) => team.name).join(" / ")} · {data.season.name}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["Appearances", data.summary.appearances],
                  ["Frames", data.summary.played],
                  ["Won", data.summary.won],
                  ["Lost", data.summary.lost],
                  ["Win rate", `${data.summary.winPct}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-1 text-xl font-black">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-300">Current Elo {data.player.rating} · Handicap {signed(data.player.handicap)}</p>
            </header>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="text-xl font-black">Opponent-by-opponent results</h2>
              <p className="mt-1 text-sm text-slate-400">No-shows and nominated-player frames are identified but excluded from individual statistics and Elo.</p>
              <div className="mt-4 space-y-3">
                {data.frames.map((frame, index) => (
                  <article key={`${frame.fixtureId}-${frame.frameLabel}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-cyan-200">{frame.frameLabel}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${frame.outcome === "Won" ? "bg-emerald-400/15 text-emerald-200" : frame.outcome === "Lost" ? "bg-rose-400/15 text-rose-200" : "bg-slate-400/15 text-slate-300"}`}>{frame.outcome}</span>
                    </div>
                    <p className="mt-2 font-semibold text-white">vs {frame.opponents.length > 0 ? <PlayerLinks players={frame.opponents} seasonId={seasonId} /> : "No show"}</p>
                    {frame.teammates.length > 0 ? <p className="mt-1 text-sm text-slate-300">Partner: <PlayerLinks players={frame.teammates} seasonId={seasonId} /></p> : null}
                    <p className="mt-1 text-sm text-slate-300">Score: {frame.score}</p>
                    <Link href={`/display/weekly-report?seasonId=${encodeURIComponent(seasonId)}&week=${frame.weekNo ?? ""}&tab=matches#fixture-${frame.fixtureId}`} className="mt-3 inline-flex text-xs font-bold text-cyan-300 underline underline-offset-4">
                      Week {frame.weekNo ?? "–"} · {formatDate(frame.fixtureDate)} · {frame.fixtureLabel}
                    </Link>
                  </article>
                ))}
                {data.frames.length === 0 ? <p className="text-sm text-slate-400">No approved frame results yet.</p> : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

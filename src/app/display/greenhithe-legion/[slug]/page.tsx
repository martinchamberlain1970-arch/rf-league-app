"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";


type TeamSummary = {
  id: string;
  slug: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  framesFor: number;
  framesAgainst: number;
  frameDiff: number;
  recentResults: Array<{
    fixtureId: string;
    weekNo: number | null;
    fixtureDate: string | null;
    opponent: string;
    venue: "home" | "away";
    result: "W" | "L" | "D";
    score: string;
  }>;
  upcomingFixtures: Array<{
    fixtureId: string;
    weekNo: number | null;
    fixtureDate: string | null;
    opponent: string;
    venue: "home" | "away";
    status: "pending" | "in_progress";
  }>;
};

type Payload = {
  season: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  teams: TeamSummary[];
  selectedTeam: TeamSummary | null;
  rotationSeconds: number;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "Date TBC";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function GreenhitheLegionTeamPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  useEffect(() => {
    if (!slug) return;
    let active = true;
    const load = async () => {
      const resp = await fetch(`/api/public/greenhithe-legion-teams?team=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const payload = (await resp.json().catch(() => ({ teams: [], rotationSeconds: 45, selectedTeam: null }))) as Payload;
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
  }, [slug]);

  const team = data?.selectedTeam;
  const lastFixture = team?.recentResults[0] ?? null;
  const upcomingFixture = team?.upcomingFixtures[0] ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Team Results</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{team?.name ?? data?.location?.name ?? "Greenhithe Legion Team"}</h1>
              <p className="mt-2 text-sm text-slate-300">{data?.season?.name ?? "Published league season"} · Updated {updatedAt || "--:--"}</p>
            </div>
          </div>
        </header>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}
        {!team && !data?.error ? <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-200">Team not found for this public page.</section> : null}

        {team ? (
          <section className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Published summary</p>
                  <h2 className="mt-2 text-4xl font-black text-white sm:text-5xl">{team.name}</h2>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Played</p>
                    <p className="mt-1 text-2xl font-black text-white">{team.played}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Won</p>
                    <p className="mt-1 text-2xl font-black text-emerald-300">{team.won}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Lost</p>
                    <p className="mt-1 text-2xl font-black text-rose-300">{team.lost}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-black text-white">Last Fixture</h3>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    {lastFixture ? `${formatDate(lastFixture.fixtureDate)}` : "No result yet"}
                  </span>
                </div>
                {lastFixture ? (
                  <div className="mt-5 space-y-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Week {lastFixture.weekNo ?? "-"}</p>
                    <p className="text-3xl font-black text-white">vs {lastFixture.opponent}</p>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-300">{lastFixture.venue === "home" ? "Home fixture" : "Away fixture"}</p>
                        <p className={`mt-3 text-5xl font-black ${lastFixture.result === "W" ? "text-emerald-300" : lastFixture.result === "L" ? "text-rose-300" : "text-amber-200"}`}>{lastFixture.score}</p>
                      </div>
                      <span className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] ${lastFixture.result === "W" ? "bg-emerald-400/10 text-emerald-200" : lastFixture.result === "L" ? "bg-rose-400/10 text-rose-200" : "bg-amber-300/10 text-amber-100"}`}>
                        {lastFixture.result === "W" ? "Win" : lastFixture.result === "L" ? "Loss" : "Draw"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-slate-300">No completed fixture is showing yet.</p>
                )}
              </section>

              <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-black text-white">Upcoming Fixture</h3>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    {upcomingFixture ? `${formatDate(upcomingFixture.fixtureDate)}` : "No fixture listed"}
                  </span>
                </div>
                {upcomingFixture ? (
                  <div className="mt-5 space-y-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Week {upcomingFixture.weekNo ?? "-"}</p>
                    <p className="text-3xl font-black text-white">vs {upcomingFixture.opponent}</p>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-300">{upcomingFixture.venue === "home" ? "Home fixture" : "Away fixture"}</p>
                        <p className="mt-3 text-2xl font-black text-white">{upcomingFixture.status === "in_progress" ? "Match In Progress" : "Next Match"}</p>
                      </div>
                      <span className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] ${upcomingFixture.status === "in_progress" ? "bg-emerald-400/10 text-emerald-200" : "bg-white/10 text-slate-200"}`}>
                        {upcomingFixture.status === "in_progress" ? "Live now" : "Upcoming"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-slate-300">No upcoming fixture is currently published.</p>
                )}
              </section>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
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
            <Link href="/display/greenhithe-legion" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10">
              All teams
            </Link>
          </div>
        </header>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}
        {!team && !data?.error ? <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-200">Team not found for this public page.</section> : null}

        {team ? (
          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
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

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-lg font-black text-white">Recent Results</h3>
                  <div className="mt-3 space-y-3">
                    {team.recentResults.map((fixture) => (
                      <article key={fixture.fixtureId} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Week {fixture.weekNo ?? "-"} · {formatDate(fixture.fixtureDate)}</p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-white">vs {fixture.opponent}</p>
                            <p className="mt-1 text-sm text-slate-300">{fixture.venue === "home" ? "Home" : "Away"}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-black ${fixture.result === "W" ? "text-emerald-300" : fixture.result === "L" ? "text-rose-300" : "text-amber-200"}`}>{fixture.score}</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{fixture.result === "W" ? "Win" : fixture.result === "L" ? "Loss" : "Draw"}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                    {team.recentResults.length === 0 ? <p className="text-sm text-slate-300">No completed fixtures yet.</p> : null}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-lg font-black text-white">Upcoming Fixtures</h3>
                  <div className="mt-3 space-y-3">
                    {team.upcomingFixtures.map((fixture) => (
                      <article key={fixture.fixtureId} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Week {fixture.weekNo ?? "-"} · {formatDate(fixture.fixtureDate)}</p>
                        <p className="mt-1 text-base font-semibold text-white">vs {fixture.opponent}</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-sm text-slate-300">{fixture.venue === "home" ? "Home" : "Away"}</p>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${fixture.status === "in_progress" ? "bg-emerald-400/10 text-emerald-200" : "bg-white/10 text-slate-200"}`}>
                            {fixture.status === "in_progress" ? "Live now" : "Upcoming"}
                          </span>
                        </div>
                      </article>
                    ))}
                    {team.upcomingFixtures.length === 0 ? <p className="text-sm text-slate-300">No upcoming fixtures currently published.</p> : null}
                  </div>
                </section>
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Frame Summary</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Frames For</p>
                    <p className="mt-1 text-2xl font-black text-white">{team.framesFor}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Frames Against</p>
                    <p className="mt-1 text-2xl font-black text-white">{team.framesAgainst}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Frame Diff</p>
                    <p className={`mt-1 text-2xl font-black ${team.frameDiff >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{team.frameDiff > 0 ? `+${team.frameDiff}` : team.frameDiff}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Other Legion Teams</p>
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  {(data?.teams ?? []).map((item) => (
                    <Link key={item.id} href={`/display/greenhithe-legion/${item.slug}`} className={`block rounded-2xl border px-3 py-3 ${item.slug === team.slug ? "border-white/25 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                      {item.name}
                    </Link>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        ) : null}
      </div>
    </main>
  );
}

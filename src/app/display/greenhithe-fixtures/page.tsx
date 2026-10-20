"use client";

import { useEffect, useMemo, useState } from "react";

type Fixture = {
  fixtureId: string;
  weekNo: number | null;
  fixtureDate: string | null;
  opponent: string;
  venue: "home" | "away";
  status: "pending" | "in_progress";
};

type Team = {
  id: string;
  name: string;
  upcomingFixtures: Fixture[];
};

type Payload = {
  season: { id: string; name: string } | null;
  teams: Team[];
  error?: string;
};

const teamNames = ["Greenhithe A", "Greenhithe B"];

function fixtureDate(value: string | null) {
  if (!value) return "Date to be confirmed";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function GreenhitheFixturesDisplayPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/public/greenhithe-legion-teams", { cache: "no-store" });
        const payload = (await response.json()) as Payload;
        if (!active) return;
        setData(response.ok ? payload : { season: null, teams: [], error: payload.error ?? "Fixtures could not be loaded." });
        setUpdatedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      } catch {
        if (active) setData({ season: null, teams: [], error: "Fixtures could not be loaded." });
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const teams = useMemo(() => teamNames.map((name) => data?.teams.find((team) => team.name.toLowerCase() === name.toLowerCase()) ?? null), [data]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_60%)] px-5 py-7 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-300">Greenhithe Legion · Snooker</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Next league fixtures</h1>
          <p className="mt-3 text-base text-slate-300">{data?.season?.name ?? "Current published league"} · Updated {updatedAt || "--:--"}</p>
        </header>

        {data?.error ? <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-5 text-rose-100">{data.error}</p> : null}

        <section className="grid gap-6 lg:grid-cols-2" aria-label="Greenhithe A and B fixtures">
          {teams.map((team, index) => {
            const next = team?.upcomingFixtures[0] ?? null;
            return (
              <article key={teamNames[index]} className="flex min-h-80 flex-col rounded-3xl border border-cyan-300/20 bg-slate-900/85 p-7 shadow-2xl">
                <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-300">Premier League</p>
                <h2 className="mt-2 text-4xl font-black sm:text-5xl">{teamNames[index]}</h2>
                {next ? (
                  <div className="mt-8 flex flex-1 flex-col justify-between gap-8">
                    <div>
                      <p className="text-lg font-semibold text-amber-200">{fixtureDate(next.fixtureDate)}{next.weekNo ? ` · Week ${next.weekNo}` : ""}</p>
                      <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-slate-400">{next.venue === "home" ? "Home against" : "Away at"}</p>
                      <p className="mt-2 text-4xl font-black leading-tight sm:text-5xl">{next.opponent}</p>
                    </div>
                    <p className="text-base font-bold text-emerald-300">{next.status === "in_progress" ? "Match in progress" : "Upcoming match"}</p>
                  </div>
                ) : (
                  <p className="mt-8 text-xl text-slate-300">{team ? "No upcoming fixture is currently listed." : "Team fixtures are not available yet."}</p>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

type Payload = {
  season: { id: string; name: string } | null;
  roundLabel: string | null;
  weekNo: number | null;
  fixtureDate: string | null;
  fixtureDateLabel?: string | null;
  fixtures: Array<{
    id: string;
    fixtureDate: string | null;
    weekNo: number | null;
    homeTeam: string;
    awayTeam: string;
    status: "pending" | "in_progress" | "complete";
  }>;
  error?: string;
};

export default function PublicNextFixturesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const resp = await fetch("/api/public/next-fixtures", { cache: "no-store" });
      const payload = (await resp.json().catch(() => ({ fixtures: [] }))) as Payload;
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
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Next Round Fixtures</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{data?.season?.name ?? "League Fixtures"}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span>{data?.roundLabel ?? "Upcoming round"}</span>
            {data?.fixtureDateLabel ? <span>· {data.fixtureDateLabel}</span> : null}
            <span>· Updated {updatedAt || "--:--"}</span>
          </div>
        </header>

        {data?.error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section> : null}

        {!data?.error && (data?.fixtures ?? []).length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-200 shadow-2xl shadow-black/20 backdrop-blur">
            No upcoming league fixtures are currently published.
          </section>
        ) : null}

        {(data?.fixtures ?? []).length > 0 ? (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/20">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data?.fixtures.map((fixture) => (
                <article key={fixture.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">{fixture.weekNo !== null ? `Week ${fixture.weekNo}` : data?.roundLabel ?? "Upcoming"}</p>
                  <h2 className="mt-2 text-xl font-black text-white">{fixture.homeTeam}</h2>
                  <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">vs</p>
                  <h3 className="mt-1 text-xl font-black text-white">{fixture.awayTeam}</h3>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

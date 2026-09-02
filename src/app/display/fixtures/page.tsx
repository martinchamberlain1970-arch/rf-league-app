"use client";

import { useEffect, useMemo, useState } from "react";

type SeasonOption = {
  id: string;
  name: string;
};

type PublicFixture = {
  id: string;
  fixtureDate: string | null;
  weekNo: number | null;
  homeTeam: string;
  awayTeam: string;
  status: "pending" | "in_progress" | "complete" | "bye";
  homePoints: number | null;
  awayPoints: number | null;
};

type Payload = {
  seasons: SeasonOption[];
  season: SeasonOption | null;
  fixtures: PublicFixture[];
  isDraftPreview?: boolean;
  error?: string;
};

function formatFixtureDate(value: string | null) {
  if (!value) return "Date to be confirmed";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shortLeagueName(value: string) {
  return value
    .replace(/^Gravesend\s*&\s*District Indoor Games League\s*-\s*/i, "")
    .replace(/\s+2026\/2027$/i, " 2026/27");
}

export default function PublicFixturesPage() {
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [queryReady, setQueryReady] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const requestedSeasonId = new URLSearchParams(window.location.search).get("seasonId")?.trim() ?? "";
    const requestedDraftToken = new URLSearchParams(window.location.search).get("draft")?.trim() ?? "";
    setSelectedSeasonId(requestedSeasonId);
    setDraftToken(requestedDraftToken);
    setQueryReady(true);
  }, []);

  useEffect(() => {
    if (!queryReady) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedSeasonId) params.set("seasonId", selectedSeasonId);
        if (draftToken) params.set("draft", draftToken);
        const query = params.size ? `?${params.toString()}` : "";
        const resp = await fetch(`/api/public/fixtures${query}`, { cache: "no-store" });
        const payload = (await resp.json().catch(() => ({ seasons: [], season: null, fixtures: [] }))) as Payload;
        if (!active) return;
        setData(resp.ok ? payload : { ...payload, error: payload.error ?? "The public fixture list could not be loaded." });
        setUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

        if (!selectedSeasonId && payload.season?.id) {
          setSelectedSeasonId(payload.season.id);
          window.history.replaceState(null, "", `/display/fixtures?seasonId=${encodeURIComponent(payload.season.id)}`);
        }
      } catch {
        if (active) setData({ seasons: [], season: null, fixtures: [], error: "The public fixture list could not be loaded." });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [draftToken, queryReady, selectedSeasonId]);

  const rounds = useMemo(() => {
    const grouped = new Map<string, { weekNo: number | null; fixtureDate: string | null; fixtures: PublicFixture[] }>();
    for (const fixture of data?.fixtures ?? []) {
      const key = fixture.weekNo !== null ? `week:${fixture.weekNo}` : `date:${fixture.fixtureDate ?? "tbc"}`;
      const group = grouped.get(key) ?? { weekNo: fixture.weekNo, fixtureDate: fixture.fixtureDate, fixtures: [] };
      group.fixtures.push(fixture);
      if (!group.fixtureDate && fixture.fixtureDate) group.fixtureDate = fixture.fixtureDate;
      grouped.set(key, group);
    }
    return Array.from(grouped.values());
  }, [data]);

  const chooseSeason = (seasonId: string) => {
    setCopied(false);
    setSelectedSeasonId(seasonId);
    const params = new URLSearchParams({ seasonId });
    if (data?.isDraftPreview && draftToken) {
      params.set("draft", draftToken);
    } else {
      setDraftToken("");
    }
    window.history.replaceState(null, "", `/display/fixtures?${params.toString()}`);
  };

  const copyLink = async () => {
    if (!data?.season?.id) return;
    const url = new URL("/display/fixtures", window.location.origin);
    url.searchParams.set("seasonId", data.season.id);
    if (data.isDraftPreview && draftToken) url.searchParams.set("draft", draftToken);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">
            Rack &amp; Frame · {data?.isDraftPreview ? "Draft Fixture Review" : "Public Fixtures"}
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {data?.season?.name ?? "League Fixtures"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {data?.isDraftPreview ? "Private officer review copy" : "Complete published fixture list"} · Updated {updatedAt || "--:--"}
          </p>
          {data?.isDraftPreview ? (
            <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <strong>Private draft preview:</strong> for league officers to review before publication. Anyone with this private link can view the draft fixtures.
            </div>
          ) : null}
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block flex-1 text-sm font-medium text-slate-200" htmlFor="public-fixture-season">
              {data?.isDraftPreview ? "Draft league division" : "League division"}
              <select
                id="public-fixture-season"
                className="mt-1 block w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-white sm:max-w-xl"
                value={selectedSeasonId || data?.season?.id || ""}
                onChange={(event) => chooseSeason(event.target.value)}
                disabled={(data?.seasons ?? []).length === 0}
              >
                {(data?.seasons ?? []).map((season) => (
                  <option key={season.id} value={season.id}>{shortLeagueName(season.name)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void copyLink()}
              disabled={!data?.season}
              className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? "Link copied" : "Copy this league link"}
            </button>
          </div>
        </section>

        {data?.error ? (
          <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{data.error}</section>
        ) : null}

        {!data?.error && loading ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-200">Loading fixtures…</section>
        ) : null}

        {!data?.error && !loading && rounds.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-200">
            {data?.isDraftPreview ? "No draft fixtures are currently available for this league." : "No fixtures have been published for this league yet."}
          </section>
        ) : null}

        {!loading && rounds.map((round) => (
          <section key={`${round.weekNo ?? "date"}-${round.fixtureDate ?? "tbc"}`} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
              <h2 className="text-lg font-black text-white">{round.weekNo !== null ? `Week ${round.weekNo}` : "Fixture round"}</h2>
              <p className="text-sm font-medium text-cyan-200">{formatFixtureDate(round.fixtureDate)}</p>
            </div>
            <div className="divide-y divide-white/5">
              {round.fixtures.map((fixture) => (
                <article key={fixture.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <p className="text-lg font-bold text-white sm:text-right">{fixture.homeTeam}</p>
                  <div className="min-w-20 text-center">
                    {fixture.status === "bye" ? (
                      <span className="inline-flex rounded-full bg-cyan-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-100">BYE</span>
                    ) : fixture.status === "complete" ? (
                      <span className="inline-flex rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-black text-emerald-100">
                        {fixture.homePoints ?? 0}–{fixture.awayPoints ?? 0}
                      </span>
                    ) : fixture.status === "in_progress" ? (
                      <span className="inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-100">Live</span>
                    ) : (
                      <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">vs</span>
                    )}
                  </div>
                  <p className="text-lg font-bold text-white">{fixture.awayTeam}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

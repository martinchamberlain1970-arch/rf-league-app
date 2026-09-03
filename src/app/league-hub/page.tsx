"use client";

import { useEffect, useMemo, useState } from "react";

type HubTab = "fixtures" | "results" | "table" | "players" | "breaks" | "handicaps" | "notices";

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

type LeagueRow = {
  rank: number;
  team_name: string;
  played: number;
  won: number;
  lost: number;
  frames_for: number;
  frames_against: number;
  frame_diff: number;
  points: number;
};

type PlayerRow = {
  rank: number;
  player_id: string;
  player_name: string;
  team_name: string;
  appearances: number;
  played: number;
  won: number;
  lost: number;
  win_pct: number;
};

type HighBreakRow = {
  rank: number;
  key: string;
  player_name: string;
  high_break: number;
  century_count: number;
  breaks_30_plus: number;
};

type HandicapRow = {
  rank: number;
  player_id: string;
  player_name: string;
  elo: number;
  current_handicap: number;
  rated_matches: number;
};

type Announcement = {
  id: string;
  title: string | null;
  body: string | null;
  updated_at: string | null;
};

type HubData = {
  seasons: SeasonOption[];
  season: SeasonOption | null;
  fixtures: PublicFixture[];
  leagueTable: LeagueRow[];
  players: PlayerRow[];
  breaks: HighBreakRow[];
  handicaps: HandicapRow[];
  announcement: Announcement | null;
};

type FixtureGroup = {
  key: string;
  weekNo: number | null;
  fixtureDate: string | null;
  fixtures: PublicFixture[];
};

const tabs: Array<{ id: HubTab; label: string; shortLabel: string }> = [
  { id: "fixtures", label: "Upcoming Fixtures", shortLabel: "Fixtures" },
  { id: "results", label: "Results", shortLabel: "Results" },
  { id: "table", label: "League Table", shortLabel: "Table" },
  { id: "players", label: "Leading Players", shortLabel: "Players" },
  { id: "breaks", label: "High Breaks", shortLabel: "Breaks" },
  { id: "handicaps", label: "Handicaps", shortLabel: "Handicaps" },
  { id: "notices", label: "League Notices", shortLabel: "Notices" },
];

function shortLeagueName(value: string) {
  return value
    .replace(/^Gravesend\s*&\s*District Indoor Games League\s*-\s*/i, "")
    .replace(/\s+2026\/2027$/i, " 2026/27");
}

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

function formatHandicap(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function groupFixtures(fixtures: PublicFixture[], newestFirst = false): FixtureGroup[] {
  const grouped = new Map<string, FixtureGroup>();
  for (const fixture of fixtures) {
    const key = fixture.weekNo !== null ? `week:${fixture.weekNo}` : `date:${fixture.fixtureDate ?? "tbc"}`;
    const group = grouped.get(key) ?? {
      key,
      weekNo: fixture.weekNo,
      fixtureDate: fixture.fixtureDate,
      fixtures: [],
    };
    group.fixtures.push(fixture);
    if (!group.fixtureDate && fixture.fixtureDate) group.fixtureDate = fixture.fixtureDate;
    grouped.set(key, group);
  }
  return Array.from(grouped.values()).sort((left, right) => {
    const weekGap = (left.weekNo ?? Number.MAX_SAFE_INTEGER) - (right.weekNo ?? Number.MAX_SAFE_INTEGER);
    const order = weekGap || (left.fixtureDate ?? "").localeCompare(right.fixtureDate ?? "");
    return newestFirst ? -order : order;
  });
}

function FixturesPanel({ groups, results = false }: { groups: FixtureGroup[]; results?: boolean }) {
  if (groups.length === 0) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
        {results ? "No completed results have been published for this division yet." : "No upcoming fixtures are currently available for this division."}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
            <h2 className="text-lg font-black text-white">{group.weekNo !== null ? `Week ${group.weekNo}` : "Fixture round"}</h2>
            <p className="text-sm font-medium text-cyan-200">{formatFixtureDate(group.fixtureDate)}</p>
          </div>
          <div className="divide-y divide-white/5">
            {group.fixtures.map((fixture) => (
              <article key={fixture.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <p className="text-base font-bold text-white sm:text-right sm:text-lg">{fixture.homeTeam}</p>
                <div className="min-w-20 text-center">
                  {fixture.status === "bye" ? (
                    <span className="inline-flex rounded-full bg-cyan-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-100">BYE</span>
                  ) : fixture.status === "complete" ? (
                    <span className="inline-flex rounded-full bg-emerald-400/15 px-3 py-1 text-base font-black text-emerald-100">
                      {fixture.homePoints ?? 0}–{fixture.awayPoints ?? 0}
                    </span>
                  ) : fixture.status === "in_progress" ? (
                    <span className="inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-100">Live</span>
                  ) : (
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">vs</span>
                  )}
                </div>
                <p className="text-base font-bold text-white sm:text-lg">{fixture.awayTeam}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function LeagueHubPage() {
  const [activeTab, setActiveTab] = useState<HubTab>("fixtures");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [data, setData] = useState<HubData>({
    seasons: [],
    season: null,
    fixtures: [],
    leagueTable: [],
    players: [],
    breaks: [],
    handicaps: [],
    announcement: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab") as HubTab | null;
    const requestedSeasonId = params.get("seasonId")?.trim() ?? "";
    if (tabs.some((tab) => tab.id === requestedTab)) setActiveTab(requestedTab as HubTab);
    if (requestedSeasonId) setSelectedSeasonId(requestedSeasonId);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const query = selectedSeasonId ? `?seasonId=${encodeURIComponent(selectedSeasonId)}` : "";
        const fixturesResponse = await fetch(`/api/public/fixtures${query}`, { cache: "no-store" });
        const fixturesPayload = await fixturesResponse.json();
        if (!fixturesResponse.ok) throw new Error(fixturesPayload.error ?? "The public league information could not be loaded.");

        const resolvedSeasonId = fixturesPayload.season?.id ?? "";
        if (!resolvedSeasonId) {
          if (active) {
            setData((current) => ({ ...current, seasons: fixturesPayload.seasons ?? [], season: null, fixtures: [] }));
          }
          return;
        }

        const seasonQuery = `?seasonId=${encodeURIComponent(resolvedSeasonId)}`;
        const [boardResponse, playersResponse, breaksResponse, handicapsResponse, announcementResponse] = await Promise.all([
          fetch(`/api/public/league-board${seasonQuery}`, { cache: "no-store" }),
          fetch(`/api/public/player-table${seasonQuery}`, { cache: "no-store" }),
          fetch(`/api/public/high-breaks${seasonQuery}`, { cache: "no-store" }),
          fetch(`/api/public/handicaps${seasonQuery}`, { cache: "no-store" }),
          fetch("/api/public/announcements", { cache: "no-store" }),
        ]);
        const [boardPayload, playersPayload, breaksPayload, handicapsPayload, announcementPayload] = await Promise.all([
          boardResponse.json(),
          playersResponse.json(),
          breaksResponse.json(),
          handicapsResponse.json(),
          announcementResponse.json(),
        ]);
        const failedMessage =
          (!boardResponse.ok && boardPayload.error) ||
          (!playersResponse.ok && playersPayload.error) ||
          (!breaksResponse.ok && breaksPayload.error) ||
          (!handicapsResponse.ok && handicapsPayload.error) ||
          (!announcementResponse.ok && announcementPayload.error);
        if (failedMessage) throw new Error(failedMessage);
        if (!active) return;

        setData({
          seasons: fixturesPayload.seasons ?? [],
          season: fixturesPayload.season ?? null,
          fixtures: fixturesPayload.fixtures ?? [],
          leagueTable: boardPayload.leagueTable ?? [],
          players: playersPayload.players ?? [],
          breaks: breaksPayload.rows ?? [],
          handicaps: handicapsPayload.handicaps ?? [],
          announcement: announcementPayload.announcement ?? null,
        });
        setSelectedSeasonId(resolvedSeasonId);
        setUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "The public league information could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const refreshInterval = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [selectedSeasonId]);

  const upcomingGroups = useMemo(
    () => groupFixtures(data.fixtures.filter((fixture) => fixture.status !== "complete")),
    [data.fixtures]
  );
  const resultGroups = useMemo(
    () => groupFixtures(data.fixtures.filter((fixture) => fixture.status === "complete"), true),
    [data.fixtures]
  );

  function updateLocation(tab: HubTab, seasonId = selectedSeasonId) {
    const params = new URLSearchParams();
    if (seasonId) params.set("seasonId", seasonId);
    if (tab !== "fixtures") params.set("tab", tab);
    const query = params.toString();
    window.history.replaceState(null, "", `/league-hub${query ? `?${query}` : ""}`);
  }

  function chooseTab(tab: HubTab) {
    setActiveTab(tab);
    updateLocation(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseSeason(seasonId: string) {
    setSelectedSeasonId(seasonId);
    updateLocation(activeTab, seasonId);
  }

  async function copyHubLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/league-hub`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#0f172a_55%)] px-3 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Rack &amp; Frame · Public League Hub</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">Gravesend &amp; District Indoor Games League</h1>
          <p className="mt-2 text-sm text-slate-300">Fixtures, results and league statistics in one place. No account or app registration is required.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide">
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-emerald-100">Published information</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-200">Updated {updatedAt || "--:--"}</span>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-black/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block flex-1 text-sm font-semibold text-slate-200" htmlFor="hub-season">
              League division
              <select
                id="hub-season"
                value={selectedSeasonId || data.season?.id || ""}
                onChange={(event) => chooseSeason(event.target.value)}
                disabled={data.seasons.length === 0}
                className="mt-1 block w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-white sm:max-w-xl"
              >
                {data.seasons.map((season) => (
                  <option key={season.id} value={season.id}>{shortLeagueName(season.name)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void copyHubLink()}
              className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100"
            >
              {copied ? "Public link copied" : "Copy public hub link"}
            </button>
          </div>
        </section>

        <nav aria-label="League information" className="sticky top-0 z-20 -mx-3 overflow-x-auto border-y border-white/10 bg-slate-950/95 px-3 py-3 shadow-lg backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <div className="flex min-w-max gap-2 lg:min-w-0 lg:grid lg:grid-cols-7">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => chooseTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  activeTab === tab.id
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <span className="lg:hidden">{tab.shortLabel}</span>
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {error ? <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-100">{error}</section> : null}
        {!error && loading ? <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-200">Updating league information…</section> : null}
        {!error && !loading && !data.season ? <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-200">No published league is currently available.</section> : null}

        {!error && !loading && data.season && activeTab === "fixtures" ? <FixturesPanel groups={upcomingGroups} /> : null}
        {!error && !loading && data.season && activeTab === "results" ? <FixturesPanel groups={resultGroups} results /> : null}

        {!error && !loading && data.season && activeTab === "table" ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm sm:text-base">
                <thead className="bg-white/5 text-left text-slate-300">
                  <tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Team</th><th className="px-3 py-3 text-center">P</th><th className="px-3 py-3 text-center">W</th><th className="px-3 py-3 text-center">L</th><th className="px-3 py-3 text-center">FF</th><th className="px-3 py-3 text-center">FA</th><th className="px-3 py-3 text-center">Diff</th><th className="px-3 py-3 text-center">Pts</th></tr>
                </thead>
                <tbody>
                  {data.leagueTable.map((row) => (
                    <tr key={row.team_name} className="border-t border-white/5 text-slate-100">
                      <td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td><td className="px-3 py-3 font-medium">{row.team_name}</td><td className="px-3 py-3 text-center">{row.played}</td><td className="px-3 py-3 text-center">{row.won}</td><td className="px-3 py-3 text-center">{row.lost}</td><td className="px-3 py-3 text-center">{row.frames_for}</td><td className="px-3 py-3 text-center">{row.frames_against}</td><td className="px-3 py-3 text-center">{row.frame_diff > 0 ? `+${row.frame_diff}` : row.frame_diff}</td><td className="px-3 py-3 text-center font-bold text-emerald-300">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {!error && !loading && data.season && activeTab === "players" ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/10">
            {data.players.length === 0 ? <p className="p-8 text-center text-slate-300">Player standings will appear after results are approved.</p> : (
              <div className="overflow-x-auto"><table className="min-w-full text-sm sm:text-base"><thead className="bg-white/5 text-left text-slate-300"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Player</th><th className="px-3 py-3">Team</th><th className="px-3 py-3 text-center">App</th><th className="px-3 py-3 text-center">P</th><th className="px-3 py-3 text-center">W</th><th className="px-3 py-3 text-center">L</th><th className="px-3 py-3 text-center">Win %</th></tr></thead><tbody>{data.players.map((row) => <tr key={row.player_id} className="border-t border-white/5 text-slate-100"><td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td><td className="px-3 py-3 font-medium">{row.player_name}</td><td className="px-3 py-3 text-slate-300">{row.team_name}</td><td className="px-3 py-3 text-center">{row.appearances}</td><td className="px-3 py-3 text-center">{row.played}</td><td className="px-3 py-3 text-center">{row.won}</td><td className="px-3 py-3 text-center">{row.lost}</td><td className="px-3 py-3 text-center font-bold text-emerald-300">{row.win_pct}%</td></tr>)}</tbody></table></div>
            )}
          </section>
        ) : null}

        {!error && !loading && data.season && activeTab === "breaks" ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/10">
            {data.breaks.length === 0 ? <p className="p-8 text-center text-slate-300">Breaks of 30 or more will appear after results are approved.</p> : (
              <div className="overflow-x-auto"><table className="min-w-full text-sm sm:text-base"><thead className="bg-white/5 text-left text-slate-300"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Player</th><th className="px-3 py-3 text-center">Highest</th><th className="px-3 py-3 text-center">100+</th><th className="px-3 py-3 text-center">30+</th></tr></thead><tbody>{data.breaks.map((row) => <tr key={row.key} className="border-t border-white/5 text-slate-100"><td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td><td className="px-3 py-3 font-medium">{row.player_name}</td><td className="px-3 py-3 text-center text-lg font-black text-emerald-300">{row.high_break}</td><td className="px-3 py-3 text-center">{row.century_count}</td><td className="px-3 py-3 text-center">{row.breaks_30_plus}</td></tr>)}</tbody></table></div>
            )}
          </section>
        ) : null}

        {!error && !loading && data.season && activeTab === "handicaps" ? (
          /division 1/i.test(data.season.name) ? (
            <section className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-8 text-center">
              <h2 className="text-2xl font-black text-white">Division 1 is played off scratch</h2>
              <p className="mt-2 text-slate-200">Every player starts each frame on 0. Player ratings may still be recorded for historical statistics.</p>
            </section>
          ) : (
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/10">
              <div className="border-b border-white/10 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">The <strong>current handicap</strong> is the figure used on match night. Handicaps are reviewed periodically from approved results.</div>
              {data.handicaps.length === 0 ? <p className="p-8 text-center text-slate-300">No handicap list is currently available.</p> : (
                <div className="overflow-x-auto"><table className="min-w-full text-sm sm:text-base"><thead className="bg-white/5 text-left text-slate-300"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Player</th><th className="px-3 py-3 text-center">Current handicap</th><th className="px-3 py-3 text-center">Elo</th><th className="px-3 py-3 text-center">Rated matches</th></tr></thead><tbody>{data.handicaps.map((row) => <tr key={row.player_id} className="border-t border-white/5 text-slate-100"><td className="px-3 py-3 font-semibold text-cyan-300">{row.rank}</td><td className="px-3 py-3 font-medium">{row.player_name}</td><td className="px-3 py-3 text-center text-lg font-black text-emerald-300">{formatHandicap(row.current_handicap)}</td><td className="px-3 py-3 text-center">{row.elo}</td><td className="px-3 py-3 text-center">{row.rated_matches}</td></tr>)}</tbody></table></div>
              )}
            </section>
          )
        ) : null}

        {!error && !loading && data.season && activeTab === "notices" ? (
          data.announcement ? (
            <section className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-6 shadow-xl shadow-black/10">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-200">Current league notice</p>
              <h2 className="mt-2 text-2xl font-black text-white">{data.announcement.title || "League announcement"}</h2>
              <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-slate-100">{data.announcement.body}</p>
              {data.announcement.updated_at ? <p className="mt-5 text-xs text-amber-100/70">Updated {new Date(data.announcement.updated_at).toLocaleString("en-GB")}</p> : null}
            </section>
          ) : (
            <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">There are no current league notices.</section>
          )
        ) : null}

        <footer className="px-3 py-5 text-center text-xs text-slate-400">Rack &amp; Frame League Manager © 2026 Martin Chamberlain. All rights reserved.</footer>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import InfoModal from "@/components/InfoModal";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";

type Season = { id: string; name: string; is_published: boolean | null };
type Team = { id: string; name: string };
type Fixture = {
  id: string;
  season_id: string;
  status: "pending" | "in_progress" | "complete";
  fixture_date: string | null;
  home_team_id: string;
  away_team_id: string;
};
type BreakRow = { fixture_id: string; player_id: string | null; entered_player_name: string | null; break_value: number | null };
type Player = { id: string; display_name: string; full_name: string | null };
type BreakHistoryRow = {
  breakValue: number;
  fixtureLabel: string;
  fixtureDate: string | null;
};

type TableRow = {
  key: string;
  playerName: string;
  highBreak: number;
  centuryCount: number;
  breaks30Plus: number;
  seasons: Set<string>;
  breakHistory: BreakHistoryRow[];
};

export default function LeagueHighBreaksPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("all");
  const [selectedPlayer, setSelectedPlayer] = useState<TableRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      setMessage("Supabase is not configured.");
      return;
    }
    let active = true;
    const load = async () => {
      const [seasonRes, teamRes, fixtureRes, breakRes, playerRes] = await Promise.all([
        client.from("league_seasons").select("id,name,is_published").eq("is_published", true).order("created_at", { ascending: false }),
        client.from("league_teams").select("id,name"),
        client.from("league_fixtures").select("id,season_id,status,fixture_date,home_team_id,away_team_id").eq("status", "complete"),
        client.from("league_fixture_breaks").select("fixture_id,player_id,entered_player_name,break_value").gte("break_value", 30).order("break_value", { ascending: false }),
        client.from("players").select("id,display_name,full_name").eq("is_archived", false),
      ]);
      if (!active) return;
      const error = seasonRes.error?.message || teamRes.error?.message || fixtureRes.error?.message || breakRes.error?.message || playerRes.error?.message;
      if (error) {
        setMessage(error);
        setLoading(false);
        return;
      }
      setSeasons((seasonRes.data ?? []) as Season[]);
      setTeams((teamRes.data ?? []) as Team[]);
      setFixtures((fixtureRes.data ?? []) as Fixture[]);
      setBreaks((breakRes.data ?? []) as BreakRow[]);
      setPlayers((playerRes.data ?? []) as Player[]);
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const playerNameById = useMemo(
    () => new Map(players.map((player) => [player.id, player.full_name?.trim() || player.display_name])),
    [players]
  );
  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const fixtureById = useMemo(() => new Map(fixtures.map((fixture) => [fixture.id, fixture])), [fixtures]);
  const seasonNameById = useMemo(() => new Map(seasons.map((season) => [season.id, season.name])), [seasons]);

  const rows = useMemo(() => {
    const table = new Map<string, TableRow>();
    for (const row of breaks) {
      const fixture = fixtureById.get(row.fixture_id);
      if (!fixture) continue;
      if (selectedSeasonId !== "all" && fixture.season_id !== selectedSeasonId) continue;
      const value = Number(row.break_value ?? 0);
      if (!Number.isFinite(value) || value < 30) continue;
      const key = row.player_id ?? `manual:${(row.entered_player_name ?? "Unknown").trim().toLowerCase()}`;
      const playerName = row.player_id
        ? playerNameById.get(row.player_id) ?? row.entered_player_name?.trim() ?? "Unknown"
        : row.entered_player_name?.trim() || "Unknown";
      const current = table.get(key) ?? {
        key,
        playerName,
        highBreak: 0,
        centuryCount: 0,
        breaks30Plus: 0,
        seasons: new Set<string>(),
        breakHistory: [],
      };
      current.playerName = playerName;
      current.highBreak = Math.max(current.highBreak, value);
      current.breaks30Plus += 1;
      if (value >= 100) current.centuryCount += 1;
      current.seasons.add(fixture.season_id);
      current.breakHistory.push({
        breakValue: value,
        fixtureLabel: `${teamNameById.get(fixture.home_team_id) ?? "Home team"} vs ${teamNameById.get(fixture.away_team_id) ?? "Away team"}`,
        fixtureDate: fixture.fixture_date,
      });
      table.set(key, current);
    }
    return Array.from(table.values())
      .map((row) => ({
        ...row,
        breakHistory: [...row.breakHistory].sort((a, b) => {
          const byValue = b.breakValue - a.breakValue;
          if (byValue !== 0) return byValue;
          return (b.fixtureDate ?? "").localeCompare(a.fixtureDate ?? "");
        }),
      }))
      .sort((a, b) => b.highBreak - a.highBreak || b.centuryCount - a.centuryCount || b.breaks30Plus - a.breaks30Plus || a.playerName.localeCompare(b.playerName));
  }, [breaks, fixtureById, playerNameById, selectedSeasonId, teamNameById]);

  const selectedPlayerDescription = useMemo(() => {
    if (!selectedPlayer) return "";
    return selectedPlayer.breakHistory
      .map((entry) => {
        const dateLabel = entry.fixtureDate
          ? new Date(`${entry.fixtureDate}T12:00:00`).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Date not recorded";
        return `${entry.breakValue} - ${entry.fixtureLabel}\n${dateLabel}`;
      })
      .join("\n\n");
  }, [selectedPlayer]);

  const topBreak = rows[0]?.highBreak ?? 0;
  const totalCenturies = rows.reduce((sum, row) => sum + row.centuryCount, 0);
  const totalThirtyPlus = rows.reduce((sum, row) => sum + row.breaks30Plus, 0);

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="High Break Table" eyebrow="League" subtitle="Published league breaks recorded from approved fixture results." />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-slate-700" htmlFor="season-filter">Published league</label>
              <select
                id="season-filter"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
              >
                <option value="all">All published leagues</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top recorded break</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{topBreak}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Century breaks</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{totalCenturies}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Breaks 30+</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{totalThirtyPlus}</p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {loading ? <p className="text-sm text-slate-600">Loading high breaks...</p> : null}
            {!loading && message ? <p className="text-sm text-rose-700">{message}</p> : null}
            {!loading && !message ? (
              rows.length === 0 ? (
                <p className="text-sm text-slate-600">No 30+ breaks have been recorded for the selected published league(s).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Player</th>
                        <th className="px-3 py-2">High break</th>
                        <th className="px-3 py-2">Centuries</th>
                        <th className="px-3 py-2">Breaks 30+</th>
                        <th className="px-3 py-2">League(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-2 font-medium text-slate-900">#{index + 1}</td>
                          <td className="px-3 py-2 text-slate-900">
                            <button
                              type="button"
                              className="text-left font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800"
                              onClick={() => setSelectedPlayer(row)}
                            >
                              {row.playerName}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-slate-900">{row.highBreak}</td>
                          <td className="px-3 py-2 text-slate-700">{row.centuryCount}</td>
                          <td className="px-3 py-2 text-slate-700">{row.breaks30Plus}</td>
                          <td className="px-3 py-2 text-slate-700">{Array.from(row.seasons).map((id) => seasonNameById.get(id) ?? "League").join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </section>
        </RequireAuth>
      </div>
      <InfoModal
        open={Boolean(selectedPlayer)}
        title={selectedPlayer ? `${selectedPlayer.playerName} · 30+ breaks` : "30+ breaks"}
        description={selectedPlayerDescription}
        closeLabel="Close"
        onClose={() => setSelectedPlayer(null)}
      />
    </main>
  );
}

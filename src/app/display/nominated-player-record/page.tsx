import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { fetchAllSupabasePages, fetchAllSupabasePagesByChunks } from "@/lib/supabase-pagination";

export const metadata: Metadata = {
  title: "Nominated Player Record | Rack & Frame",
  robots: { index: false, follow: false },
};

type Season = { id: string; name: string };
type Team = { id: string; name: string };
type Fixture = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  status: string;
};
type Frame = {
  fixture_id: string;
  slot_no: number;
  slot_type: string;
  winner_side: "home" | "away" | null;
  home_forfeit: boolean | null;
  away_forfeit: boolean | null;
  home_nominated: boolean | null;
  away_nominated: boolean | null;
  home_player1_id: string | null;
  away_player1_id: string | null;
  home_nominated_name: string | null;
  away_nominated_name: string | null;
};
type Player = { id: string; display_name: string; full_name: string | null };
type RecordRow = { key: string; name: string; team: string; played: number; won: number; lost: number };

function playerName(player?: Player) {
  return player?.full_name?.trim() || player?.display_name?.trim() || "Unknown player";
}

export default async function NominatedPlayerRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ seasonId?: string }>;
}) {
  const { seasonId } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let seasons: Season[] = [];
  let selectedSeason: Season | null = null;
  let rows: RecordRow[] = [];
  let error: string | null = null;

  if (!supabaseUrl || !serviceRoleKey) {
    error = "The record is temporarily unavailable.";
  } else {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const seasonsResult = await fetchAllSupabasePages<Season>((from, to) =>
      admin
        .from("league_seasons")
        .select("id,name")
        .eq("is_published", true)
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, to)
    );

    if (seasonsResult.error) {
      error = "The record could not be loaded. Please try again later.";
    } else {
      seasons = seasonsResult.data ?? [];
      selectedSeason = seasons.find((season) => season.id === seasonId) ?? seasons[0] ?? null;
    }

    if (selectedSeason) {
      const [teamsResult, fixturesResult] = await Promise.all([
        fetchAllSupabasePages<Team>((from, to) =>
          admin.from("league_teams").select("id,name").eq("season_id", selectedSeason!.id).order("id", { ascending: true }).range(from, to)
        ),
        fetchAllSupabasePages<Fixture>((from, to) =>
          admin.from("league_fixtures").select("id,home_team_id,away_team_id,status").eq("season_id", selectedSeason!.id).eq("status", "complete").order("id", { ascending: true }).range(from, to)
        ),
      ]);

      if (teamsResult.error || fixturesResult.error) {
        error = "The record could not be loaded. Please try again later.";
      } else {
        const teamsById = new Map((teamsResult.data ?? []).map((team) => [team.id, team.name]));
        const fixtures = fixturesResult.data ?? [];
        const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
        const framesResult = fixtures.length
          ? await fetchAllSupabasePagesByChunks<Frame, string>(fixtures.map((fixture) => fixture.id), (chunk, from, to) =>
              admin
                .from("league_fixture_frames")
                .select("fixture_id,slot_no,slot_type,winner_side,home_forfeit,away_forfeit,home_nominated,away_nominated,home_player1_id,away_player1_id,home_nominated_name,away_nominated_name")
                .in("fixture_id", chunk)
                .eq("slot_type", "singles")
                .or("home_nominated.eq.true,away_nominated.eq.true")
                .order("fixture_id", { ascending: true })
                .order("slot_no", { ascending: true })
                .range(from, to)
            )
          : { data: [] as Frame[], error: null };

        if (framesResult.error) {
          error = "The record could not be loaded. Please try again later.";
        } else {
          const frames = (framesResult.data ?? []).filter(
            (frame) => frame.winner_side && !frame.home_forfeit && !frame.away_forfeit
          );
          const playerIds = Array.from(new Set(frames.flatMap((frame) => [
            frame.home_nominated ? frame.home_player1_id : null,
            frame.away_nominated ? frame.away_player1_id : null,
          ]).filter((id): id is string => Boolean(id))));
          const playersResult = playerIds.length
            ? await fetchAllSupabasePagesByChunks<Player, string>(playerIds, (chunk, from, to) =>
                admin.from("players").select("id,display_name,full_name").in("id", chunk).order("id", { ascending: true }).range(from, to)
              )
            : { data: [] as Player[], error: null };

          if (playersResult.error) {
            error = "The record could not be loaded. Please try again later.";
          } else {
            const playersById = new Map((playersResult.data ?? []).map((player) => [player.id, player]));
            const records = new Map<string, RecordRow>();
            for (const frame of frames) {
              const fixture = fixturesById.get(frame.fixture_id);
              if (!fixture) continue;
              for (const side of ["home", "away"] as const) {
                if (!frame[`${side}_nominated`]) continue;
                const playerId = frame[`${side}_player1_id`];
                const fallbackName = frame[`${side}_nominated_name`]?.trim();
                if (!playerId && !fallbackName) continue;
                const teamId = side === "home" ? fixture.home_team_id : fixture.away_team_id;
                const name = playerId && playersById.has(playerId)
                  ? playerName(playersById.get(playerId))
                  : fallbackName || "Unknown player";
                const key = `${teamId}:${playerId || name.toLocaleLowerCase("en-GB")}`;
                const row = records.get(key) ?? {
                  key,
                  name,
                  team: teamsById.get(teamId) ?? "Unknown team",
                  played: 0,
                  won: 0,
                  lost: 0,
                };
                row.played += 1;
                if (frame.winner_side === side) row.won += 1;
                else row.lost += 1;
                records.set(key, row);
              }
            }
            rows = Array.from(records.values()).sort(
              (a, b) => a.name.localeCompare(b.name) || a.team.localeCompare(b.team)
            );
          }
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-teal-950 p-6 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Rack &amp; Frame · For interest only</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Nominated player record</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
            A separate look at nominated singles frames actually played in completed league matches. These results do not count towards official player standings, Elo or handicaps.
          </p>
          {selectedSeason ? <p className="mt-3 text-sm font-semibold text-emerald-200">{selectedSeason.name}</p> : null}
          {seasons.length > 1 ? (
            <nav className="mt-5 flex flex-wrap gap-2" aria-label="Choose league">
              {seasons.map((season) => (
                <Link
                  key={season.id}
                  href={`/display/nominated-player-record?seasonId=${encodeURIComponent(season.id)}`}
                  aria-current={season.id === selectedSeason?.id ? "page" : undefined}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${season.id === selectedSeason?.id ? "border-emerald-300 bg-emerald-300 text-slate-950" : "border-white/20 text-slate-200 hover:bg-white/10"}`}
                >
                  {season.name}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>

        {error ? <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-5 text-rose-100">{error}</p> : null}
        {!error && !selectedSeason ? <p className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300">No live, published league season is available.</p> : null}
        {!error && selectedSeason ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl" aria-label="Unofficial nominated player results">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-lg font-bold">Nominated singles appearances</h2>
              <p className="mt-1 text-xs text-slate-400">Alphabetical record, not a ranking. No-shows and forfeits are excluded.</p>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/5 text-slate-300">
                    <tr>
                      <th scope="col" className="px-4 py-3">Player</th>
                      <th scope="col" className="px-4 py-3">Team</th>
                      <th scope="col" className="px-4 py-3 text-center">Played</th>
                      <th scope="col" className="px-4 py-3 text-center">Won</th>
                      <th scope="col" className="px-4 py-3 text-center">Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-t border-white/5">
                        <th scope="row" className="px-4 py-3 font-semibold text-white">{row.name}</th>
                        <td className="px-4 py-3 text-slate-300">{row.team}</td>
                        <td className="px-4 py-3 text-center">{row.played}</td>
                        <td className="px-4 py-3 text-center text-emerald-300">{row.won}</td>
                        <td className="px-4 py-3 text-center text-slate-300">{row.lost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-5 py-8 text-slate-300">No nominated singles frames have been completed in this league yet.</p>}
          </section>
        ) : null}
      </div>
    </main>
  );
}

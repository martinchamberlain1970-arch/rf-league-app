"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";
import { MAX_SNOOKER_START } from "@/lib/snooker-handicap";

type Player = {
  id: string;
  display_name: string;
  full_name: string | null;
  claimed_by?: string | null;
  rating_snooker?: number | null;
  rated_matches_snooker?: number | null;
  snooker_handicap?: number | null;
  snooker_handicap_base?: number | null;
};
type Competition = { id: string; sport_type: "snooker"; is_archived?: boolean | null; is_completed?: boolean | null };
type MatchRow = {
  competition_id: string;
  status: "pending" | "in_progress" | "complete" | "bye";
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
};
type LeagueSeason = { id: string; is_published?: boolean | null };
type LeagueTeamMember = { season_id: string; player_id: string };

const guideRows = [
  { elo: 1160, handicap: -32 },
  { elo: 1100, handicap: -20 },
  { elo: 1000, handicap: 0 },
  { elo: 960, handicap: 8 },
  { elo: 900, handicap: 20 },
];

const named = (player: Player) => (player.full_name?.trim() ? player.full_name : player.display_name);
const formatHandicap = (value: number | null | undefined) => {
  const next = Number(value ?? 0);
  return next > 0 ? `+${next}` : String(next);
};

export default function HandicapsPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [leagueSeasons, setLeagueSeasons] = useState<LeagueSeason[]>([]);
  const [leagueMembers, setLeagueMembers] = useState<LeagueTeamMember[]>([]);
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const run = async () => {
      const authRes = await client.auth.getUser();
      const userId = authRes.data.user?.id ?? null;
      let currentLinkedPlayerId: string | null = null;
      if (userId) {
        const linkRes = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
        currentLinkedPlayerId = linkRes.data?.linked_player_id ?? null;
      }
      const [playerRes, competitionRes, matchRes, seasonRes, memberRes] = await Promise.all([
        client
          .from("players")
          .select("id,display_name,full_name,claimed_by,rating_snooker,rated_matches_snooker,snooker_handicap,snooker_handicap_base")
          .eq("is_archived", false),
        client.from("competitions").select("id,sport_type,is_archived,is_completed"),
        client.from("matches").select("competition_id,status,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id"),
        client.from("league_seasons").select("id,is_published"),
        client.from("league_team_members").select("season_id,player_id"),
      ]);
      if (!active) return;
      if (playerRes.error || competitionRes.error || matchRes.error || seasonRes.error || memberRes.error) {
        setMessage(
          playerRes.error?.message ||
          competitionRes.error?.message ||
          matchRes.error?.message ||
          seasonRes.error?.message ||
          memberRes.error?.message ||
          "Failed to load handicap list."
        );
        return;
      }
      setLinkedPlayerId(currentLinkedPlayerId);
      setPlayers((playerRes.data ?? []) as Player[]);
      setCompetitions((competitionRes.data ?? []) as Competition[]);
      setMatches((matchRes.data ?? []) as MatchRow[]);
      setLeagueSeasons((seasonRes.data ?? []) as LeagueSeason[]);
      setLeagueMembers((memberRes.data ?? []) as LeagueTeamMember[]);
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  const livePlayerIds = useMemo(() => {
    const result = new Set<string>();
    const publishedSeasonIds = new Set(leagueSeasons.filter((season) => season.is_published).map((season) => season.id));
    const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));
    players.forEach((entry) => {
      if (entry.claimed_by) result.add(entry.id);
    });
    leagueMembers.forEach((member) => {
      if (publishedSeasonIds.has(member.season_id)) result.add(member.player_id);
    });
    matches.forEach((match) => {
      const competition = competitionById.get(match.competition_id);
      if (!competition) return;
      const participantIds = [
        match.player1_id,
        match.player2_id,
        match.team1_player1_id,
        match.team1_player2_id,
        match.team2_player1_id,
        match.team2_player2_id,
      ].filter((value): value is string => Boolean(value));
      if (!competition.is_archived && !competition.is_completed) {
        participantIds.forEach((playerId) => result.add(playerId));
      }
      if (match.status === "complete") {
        participantIds.forEach((playerId) => result.add(playerId));
      }
    });
    return result;
  }, [competitions, leagueMembers, leagueSeasons, matches, players]);
  const livePlayers = useMemo(
    () => players.filter((entry) => livePlayerIds.has(entry.id) && Number(entry.rated_matches_snooker ?? 0) > 0),
    [livePlayerIds, players]
  );

  const rows = useMemo(
    () =>
      [...livePlayers]
        .sort(
          (a, b) =>
            Number(b.rating_snooker ?? 1000) - Number(a.rating_snooker ?? 1000) ||
            named(a).localeCompare(named(b))
        )
        .map((player, index) => ({
          id: player.id,
          rank: index + 1,
          name: named(player),
          elo: Math.round(Number(player.rating_snooker ?? 1000)),
          current: Number(player.snooker_handicap ?? 0),
          baseline: Number(player.snooker_handicap_base ?? player.snooker_handicap ?? 0),
        })),
    [livePlayers]
  );

  const currentPlayer = rows.find((row) => row.id === linkedPlayerId) ?? null;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <ScreenHeader title="Handicaps" eyebrow="League" subtitle="Current snooker handicaps, Elo guide, and the 40-point start cap." />

          {message ? <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{message}</section> : null}

          {currentPlayer ? (
            <section className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Your Elo</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{currentPlayer.elo}</p>
                <p className="mt-1 text-sm text-slate-600">{currentPlayer.name}</p>
              </div>
              <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Current Handicap</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatHandicap(currentPlayer.current)}</p>
                <p className="mt-1 text-sm text-slate-600">Live reviewed handicap.</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Baseline Handicap</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatHandicap(currentPlayer.baseline)}</p>
                <p className="mt-1 text-sm text-slate-600">Original starting handicap.</p>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-fuchsia-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">How snooker handicaps work</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <p>
                Elo updates after each valid competitive frame. Handicap is then reviewed from Elo rather than changing automatically after every win or loss.
              </p>
              <p>
                The reviewed handicap can still show the full longer-term strength gap, but the live match start is capped at {MAX_SNOOKER_START}. This keeps frames competitive and stops very large rating gaps from turning the opening score into the whole contest.
              </p>
              <p>
                No-show, nominated-player, and void outcomes are excluded from Elo and handicap review. The Super User can still make manual corrections where league rules require it.
              </p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Elo to handicap guide</h2>
              <p className="mt-1 text-sm text-slate-600">Reference points for the current conversion model. Live starts are capped at {MAX_SNOOKER_START}.</p>
              <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                      <th className="px-3 py-2">Elo</th>
                      <th className="px-3 py-2">Handicap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guideRows.map((row) => (
                      <tr key={row.elo} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2">{row.elo}</td>
                        <td className="px-3 py-2 font-semibold">{formatHandicap(row.handicap)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Current handicap list</h2>
              <p className="mt-1 text-sm text-slate-600">All live players, ranked by current snooker Elo.</p>
              <div className="mt-3 max-h-[32rem] overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2">Elo</th>
                      <th className="px-3 py-2">Current</th>
                      <th className="px-3 py-2">Baseline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className={`border-b border-slate-100 last:border-b-0 ${row.id === linkedPlayerId ? "bg-cyan-50" : "bg-white"}`}>
                        <td className="px-3 py-2 font-semibold">{row.rank}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.elo}</td>
                        <td className="px-3 py-2 font-semibold">{formatHandicap(row.current)}</td>
                        <td className="px-3 py-2">{formatHandicap(row.baseline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}

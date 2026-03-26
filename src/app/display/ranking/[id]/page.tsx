"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Player = {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url?: string | null;
  claimed_by?: string | null;
  rating_snooker?: number | null;
  peak_rating_snooker?: number | null;
  rated_matches_snooker?: number | null;
  snooker_handicap?: number | null;
};
type Competition = { id: string; sport_type: "snooker"; is_archived?: boolean | null; is_completed?: boolean | null };
type MatchRow = {
  competition_id: string;
  status: "pending" | "in_progress" | "complete" | "bye";
  updated_at: string | null;
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
};
type LeagueSeason = { id: string; is_published?: boolean | null };
type LeagueTeamMember = { season_id: string; player_id: string };

const LIVE_ACTIVITY_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

function displayPlayerName(player: Pick<Player, "full_name" | "display_name">) {
  return player.full_name?.trim() || player.display_name || "Player";
}

export default function RankingDisplayPage() {
  const params = useParams();
  const playerId = String(params.id ?? "");
  const [player, setPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [leagueSeasons, setLeagueSeasons] = useState<LeagueSeason[]>([]);
  const [leagueMembers, setLeagueMembers] = useState<LeagueTeamMember[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const refresh = async () => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const [playerRes, playersRes, competitionRes, matchRes, seasonRes, memberRes] = await Promise.all([
      client
        .from("players")
        .select("id,display_name,full_name,avatar_url,claimed_by,rating_snooker,peak_rating_snooker,rated_matches_snooker,snooker_handicap")
        .eq("id", playerId)
        .maybeSingle(),
      client
        .from("players")
        .select("id,display_name,full_name,avatar_url,claimed_by,rating_snooker,peak_rating_snooker,rated_matches_snooker,snooker_handicap")
        .eq("is_archived", false),
      client.from("competitions").select("id,sport_type,is_archived,is_completed"),
      client.from("matches").select("competition_id,status,updated_at,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id"),
      client.from("league_seasons").select("id,is_published"),
      client.from("league_team_members").select("season_id,player_id"),
    ]);
    if (playerRes.error || !playerRes.data) {
      setMessage(playerRes.error?.message ?? "Player profile not found.");
      setLoading(false);
      return;
    }
    setPlayer(playerRes.data as Player);
    setPlayers((playersRes.data ?? []) as Player[]);
    setCompetitions((competitionRes.data ?? []) as Competition[]);
    setMatches((matchRes.data ?? []) as MatchRow[]);
    setLeagueSeasons((seasonRes.data ?? []) as LeagueSeason[]);
    setLeagueMembers((memberRes.data ?? []) as LeagueTeamMember[]);
    setMessage(null);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!active) return;
      await refresh();
    };
    void run();

    const client = supabase;
    if (!client) {
      return () => {
        active = false;
      };
    }

    const channel = client
      .channel(`league-display-ranking-${playerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        void run();
      })
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [playerId]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  const livePlayerIds = useMemo(() => {
    const result = new Set<string>();
    const publishedSeasonIds = new Set(leagueSeasons.filter((season) => season.is_published).map((season) => season.id));
    const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));
    const recentCutoff = Date.now() - LIVE_ACTIVITY_WINDOW_MS;
    for (const entry of players) {
      if (entry.claimed_by) result.add(entry.id);
    }
    for (const member of leagueMembers) {
      if (publishedSeasonIds.has(member.season_id)) result.add(member.player_id);
    }
    for (const match of matches) {
      const competition = competitionById.get(match.competition_id);
      if (!competition) continue;
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
      if (match.status === "complete" && match.updated_at && new Date(match.updated_at).getTime() >= recentCutoff) {
        participantIds.forEach((playerId) => result.add(playerId));
      }
    }
    return result;
  }, [competitions, leagueMembers, leagueSeasons, matches, players]);
  const livePlayers = useMemo(() => players.filter((entry) => livePlayerIds.has(entry.id)), [livePlayerIds, players]);

  const card = useMemo(() => {
    if (!player) return null;
    const bySnooker = [...livePlayers].sort((a, b) => (b.rating_snooker ?? 1000) - (a.rating_snooker ?? 1000));
    const snookerIndex = bySnooker.findIndex((p) => p.id === player.id);
    return {
      totalPlayers: livePlayers.length,
      snookerRank: snookerIndex >= 0 ? snookerIndex + 1 : null,
      snookerRating: player.rating_snooker ?? 1000,
      snookerPeak: player.peak_rating_snooker ?? 1000,
      snookerMatches: player.rated_matches_snooker ?? 0,
      handicap: player.snooker_handicap ?? 0,
    };
  }, [livePlayers, player]);

  const playerName = player ? displayPlayerName(player) : "Player";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Snooker Ranking Card</p>
            <h1 className="text-3xl font-semibold text-white">{playerName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleFullscreen} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200">
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <button type="button" onClick={() => void refresh()} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200">
              Refresh
            </button>
            <button type="button" onClick={() => window.close()} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200">
              Close
            </button>
          </div>
        </div>

        {loading ? <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-slate-200">Loading ranking...</p> : null}
        {message ? <p className="rounded-xl border border-amber-400/60 bg-amber-500/20 p-4 text-amber-100">{message}</p> : null}

        {card && player ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-700 bg-slate-900">
                {player.avatar_url ? <img src={player.avatar_url} alt={playerName} className="h-full w-full object-cover" /> : null}
              </div>
              <div>
                <p className="text-3xl font-semibold text-white">{playerName}</p>
                <p className="text-sm text-slate-300">Live players ranked: {card.totalPlayers}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Snooker Elo</p>
                <p className="mt-2 text-5xl font-bold text-white">{Math.round(card.snookerRating)}</p>
                <p className="mt-2 text-lg text-emerald-300">{card.snookerRank ? `Rank #${card.snookerRank}` : "Not in live rankings"}</p>
                <p className="mt-1 text-sm text-slate-300">Peak {Math.round(card.snookerPeak)} · Rated matches {card.snookerMatches}</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Current Handicap</p>
                <p className="mt-2 text-5xl font-bold text-white">{card.handicap > 0 ? `+${card.handicap}` : card.handicap}</p>
                <p className="mt-2 text-lg text-amber-300">
                  {card.handicap < 0 ? `Gives ${Math.abs(card.handicap)} start` : card.handicap > 0 ? `Receives ${card.handicap} start` : "Scratch"}
                </p>
                <p className="mt-1 text-sm text-slate-300">Live figure after latest handicap review</p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-300">
              Snooker rating uses an Elo-style model: expected result from ratings, then updated after approved completed frames. Upsets move rating more than expected wins. No-show, nominated-player, and void outcomes are excluded.
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

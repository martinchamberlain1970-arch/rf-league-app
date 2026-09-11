import { NextRequest, NextResponse } from "next/server";
import { isUuid, loadPublicLeagueRecordContext } from "@/lib/public-league-records";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const seasonId = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "";
    if (!isUuid(id) || !isUuid(seasonId)) {
      return NextResponse.json({ error: "Invalid team or league reference." }, { status: 400 });
    }

    const data = await loadPublicLeagueRecordContext(seasonId);
    const team = data.teams.find((entry) => entry.id === id);
    if (!team) return NextResponse.json({ error: "Team not found in this live league." }, { status: 404 });

    const playerById = new Map(data.players.map((player) => [player.id, player]));
    const rosterIds = data.members.filter((member) => member.team_id === id).map((member) => member.player_id);
    const appearances = new Map<string, Set<string>>();
    const results = new Map<string, { won: number; lost: number }>();
    const teamFixtureIds = new Set(
      data.fixtures.filter((fixture) => fixture.homeTeamId === id || fixture.awayTeamId === id).map((fixture) => fixture.id)
    );

    for (const frame of data.frames.filter((entry) => teamFixtureIds.has(entry.fixtureId))) {
      const fixture = data.fixtures.find((entry) => entry.id === frame.fixtureId);
      if (!fixture || fixture.status !== "complete") continue;
      const isHome = fixture.homeTeamId === id;
      const playerIds = isHome
        ? [frame.homePlayer1Id, frame.homePlayer2Id]
        : [frame.awayPlayer1Id, frame.awayPlayer2Id];
      for (const playerId of playerIds.filter((value): value is string => Boolean(value))) {
        const playerAppearances = appearances.get(playerId) ?? new Set<string>();
        playerAppearances.add(frame.fixtureId);
        appearances.set(playerId, playerAppearances);
        if (frame.homeForfeit || frame.awayForfeit || frame.homeNominated || frame.awayNominated || !frame.winnerSide) continue;
        const record = results.get(playerId) ?? { won: 0, lost: 0 };
        if ((isHome && frame.winnerSide === "home") || (!isHome && frame.winnerSide === "away")) record.won += 1;
        else record.lost += 1;
        results.set(playerId, record);
      }
    }

    const roster = rosterIds
      .map((playerId) => {
        const player = playerById.get(playerId);
        const record = results.get(playerId) ?? { won: 0, lost: 0 };
        return player ? {
          ...player,
          appearances: appearances.get(playerId)?.size ?? 0,
          played: record.won + record.lost,
          won: record.won,
          lost: record.lost,
        } : null;
      })
      .filter((player): player is NonNullable<typeof player> => Boolean(player))
      .sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({
      season: data.season,
      team,
      roster,
      fixtures: data.fixtures.filter((fixture) => teamFixtureIds.has(fixture.id)),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Team record could not be loaded." }, { status: 500 });
  }
}

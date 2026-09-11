import { NextRequest, NextResponse } from "next/server";
import { isUuid, loadPublicLeagueRecordContext } from "@/lib/public-league-records";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const seasonId = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "";
    if (!isUuid(id) || !isUuid(seasonId)) {
      return NextResponse.json({ error: "Invalid player or league reference." }, { status: 400 });
    }

    const data = await loadPublicLeagueRecordContext(seasonId);
    const player = data.players.find((entry) => entry.id === id);
    const memberships = data.members.filter((member) => member.player_id === id);
    if (!player || memberships.length === 0) {
      return NextResponse.json({ error: "Player not found in this live league roster." }, { status: 404 });
    }

    const playerById = new Map(data.players.map((entry) => [entry.id, entry]));
    const teamById = new Map(data.teams.map((team) => [team.id, team]));
    const fixtureById = new Map(data.fixtures.map((fixture) => [fixture.id, fixture]));
    const frameResults = data.frames.flatMap((frame) => {
      const fixture = fixtureById.get(frame.fixtureId);
      if (!fixture || fixture.status !== "complete") return [];
      const homeIds = [frame.homePlayer1Id, frame.homePlayer2Id].filter((value): value is string => Boolean(value));
      const awayIds = [frame.awayPlayer1Id, frame.awayPlayer2Id].filter((value): value is string => Boolean(value));
      const side = homeIds.includes(id) ? "home" : awayIds.includes(id) ? "away" : null;
      if (!side) return [];
      const opponentIds = side === "home" ? awayIds : homeIds;
      const teammateIds = (side === "home" ? homeIds : awayIds).filter((playerId) => playerId !== id);
      const excluded = frame.homeForfeit || frame.awayForfeit || frame.homeNominated || frame.awayNominated || !frame.winnerSide;
      const won = !excluded && frame.winnerSide === side;
      return [{
        fixtureId: fixture.id,
        fixtureDate: fixture.fixtureDate,
        weekNo: fixture.weekNo,
        fixtureLabel: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
        frameLabel: `${frame.slotType === "doubles" ? "Doubles" : "Singles"} ${frame.slotNo}`,
        opponents: opponentIds.map((playerId) => ({ id: playerId, name: playerById.get(playerId)?.name ?? "Player" })),
        teammates: teammateIds.map((playerId) => ({ id: playerId, name: playerById.get(playerId)?.name ?? "Player" })),
        score: frame.homeForfeit || frame.awayForfeit
          ? "Frame conceded"
          : frame.homePoints !== null && frame.awayPoints !== null
            ? `${side === "home" ? frame.homePoints : frame.awayPoints}-${side === "home" ? frame.awayPoints : frame.homePoints}`
            : "Score not recorded",
        outcome: excluded ? "Excluded" : won ? "Won" : "Lost",
        rated: !excluded,
      }];
    }).sort((left, right) =>
      (right.fixtureDate ?? "").localeCompare(left.fixtureDate ?? "") || right.frameLabel.localeCompare(left.frameLabel)
    );

    const ratedResults = frameResults.filter((frame) => frame.rated);
    const won = ratedResults.filter((frame) => frame.outcome === "Won").length;
    const teams = memberships
      .map((membership) => teamById.get(membership.team_id))
      .filter((team): team is NonNullable<typeof team> => Boolean(team));

    return NextResponse.json({
      season: data.season,
      player,
      teams,
      summary: {
        played: ratedResults.length,
        won,
        lost: ratedResults.length - won,
        winPct: ratedResults.length > 0 ? Math.round((won / ratedResults.length) * 1000) / 10 : 0,
        appearances: new Set(frameResults.map((frame) => frame.fixtureId)).size,
      },
      frames: frameResults,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Player record could not be loaded." }, { status: 500 });
  }
}

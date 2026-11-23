import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationEmail } from "@/lib/email";

const sentAction = "fixture_date_captain_email_sent";
const validEmail = (value?: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() ?? "");
const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London",
}).format(new Date(`${value}T12:00:00Z`));

export async function emailFixtureCaptains(client: SupabaseClient, requestId: string, actorUserId: string) {
  try {
    const { data: request, error: requestError } = await client.from("league_fixture_change_requests")
      .select("fixture_id,original_fixture_date,agreed_fixture_date,status").eq("id", requestId).maybeSingle();
    if (requestError) throw requestError;
    if (request?.status !== "rescheduled" || !request.agreed_fixture_date) {
      return { sent: false, message: "Emails require an approved fixture date." };
    }

    const { data: fixture, error: fixtureError } = await client.from("league_fixtures")
      .select("home_team_id,away_team_id,season_id,fixture_date,status").eq("id", request.fixture_id).single();
    if (fixtureError) throw fixtureError;
    if (fixture.fixture_date !== request.agreed_fixture_date || fixture.status === "complete" || fixture.status === "bye") {
      return { sent: false, message: "This request no longer matches an upcoming fixture." };
    }
    const teamIds = [fixture.home_team_id, fixture.away_team_id];
    const [teams, roster, receipts] = await Promise.all([
      client.from("league_teams").select("id,name,captain_email").in("id", teamIds),
      client.from("league_team_members").select("team_id,player_id").eq("season_id", fixture.season_id).in("team_id", teamIds).eq("is_captain", true),
      client.from("audit_logs").select("meta").eq("action", sentAction).eq("entity_type", "league_fixture_change_request").eq("entity_id", requestId),
    ]);
    if (teams.error || roster.error || receipts.error) throw teams.error ?? roster.error ?? receipts.error;
    const teamById = new Map(teams.data.map((team) => [team.id, team]));
    if (teamById.size !== 2) throw new Error("Missing fixture teams");
    const match = teamIds.map((id) => teamById.get(id)?.name).join(" vs ");
    const confirmedDate = formatDate(request.agreed_fixture_date);
    const previousDate = request.original_fixture_date ? formatDate(request.original_fixture_date) : null;
    const playerIds = [...new Set(roster.data.map((row) => row.player_id))];
    const players = playerIds.length
      ? await client.from("players").select("id,claimed_by,full_name,display_name,is_archived").in("id", playerIds)
      : { data: [], error: null };
    if (players.error) throw players.error;
    const playerById = new Map(players.data.map((player) => [player.id, player]));
    const outcomes = await Promise.all(teamIds.map(async (teamId) => {
      const teamRecord = teamById.get(teamId);
      const team = teamRecord?.name ?? "Team";
      const captains = roster.data.filter((row) => row.team_id === teamId);
      const player = captains.length === 1 ? playerById.get(captains[0].player_id) : undefined;
      const captain = player && !player.is_archived ? player.full_name?.trim() || player.display_name : null;
      const label = `${captain || "Captain"} (${team})`;
      if (receipts.data.some(({ meta }) => meta?.team_id === teamId && meta?.fixture_date === fixture.fixture_date)) {
        return { ok: true, detail: `${label}: already emailed` };
      }

      try {
        let email = teamRecord?.captain_email?.trim();
        if (!validEmail(email) && player?.claimed_by && !player.is_archived) {
          const { data, error } = await client.auth.admin.getUserById(player.claimed_by);
          const user = data.user;
          if (!error && user?.email_confirmed_at && !(user.banned_until && Date.parse(user.banned_until) > Date.now())) {
            email = user.email?.trim();
          }
        }
        if (!validEmail(email)) return { ok: false, detail: `${label}: no captain email available` };
        const delivery = await sendNotificationEmail({
          to: email,
          subject: `Fixture confirmed: ${match} — ${confirmedDate}`,
          text: [
            `Hi ${captain || "captain"},`,
            "",
            `Your league fixture, ${match}, has been rescheduled to ${confirmedDate}.`,
            ...(previousDate ? [`Original fixture date: ${previousDate}.`] : []),
            "",
            "The fixture will be available for line-up and score entry in Rack & Frame on the new date. Please let your team know.",
            "",
            "Thanks,",
            "Rack & Frame League",
            "https://rf-league-app.vercel.app/captain-results",
          ].join("\n"),
          idempotencyKey: `fixture-date-${requestId}-${teamId}-${fixture.fixture_date}`,
        });
        if (!delivery.sent) return { ok: false, detail: `${label}: email provider did not accept the message` };

        const receipt = await client.from("audit_logs").insert({
          actor_user_id: actorUserId,
          action: sentAction,
          entity_type: "league_fixture_change_request",
          entity_id: requestId,
          summary: "Fixture date confirmation accepted by the email provider.",
          meta: { team_id: teamId, captain_player_id: player?.id ?? null, fixture_date: fixture.fixture_date },
        });
        return { ok: true, detail: `${label}: email accepted${receipt.error ? " (receipt could not be saved)" : ""}` };
      } catch {
        return { ok: false, detail: `${label}: email could not be sent` };
      }
    }));
    return { sent: outcomes.every((outcome) => outcome.ok), message: outcomes.map((outcome) => outcome.detail).join("\n") };
  } catch {
    return { sent: false, message: "Could not load the fixture or captain details for email." };
  }
}

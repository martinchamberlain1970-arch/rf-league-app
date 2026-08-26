import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntryPackPayload } from "@/lib/league-entry-pack";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

async function openRegistrationData(client: SupabaseClient) {
  const [seasonsRes, teamsRes, locationsRes, packsRes, startedFixturesRes] = await Promise.all([
    client.from("league_seasons").select("id,name,is_active,created_at").eq("is_active", true).order("created_at", { ascending: false }),
    client.from("league_teams").select("id,season_id,location_id,name,is_active").eq("is_active", true).order("name"),
    client.from("locations").select("id,name"),
    client.from("league_entry_packs").select("team_id,status,players,common_draft_token"),
    client.from("league_fixtures").select("season_id").in("status", ["in_progress", "complete"]),
  ]);
  const error = seasonsRes.error?.message || teamsRes.error?.message || locationsRes.error?.message || packsRes.error?.message || startedFixturesRes.error?.message;
  if (error) throw new Error(error);
  const startedSeasonIds = new Set((startedFixturesRes.data ?? []).map((fixture) => fixture.season_id));
  const seasons = (seasonsRes.data ?? []).filter((season) => !startedSeasonIds.has(season.id));
  const seasonIds = new Set(seasons.map((season) => season.id));
  const locationName = new Map((locationsRes.data ?? []).map((location) => [location.id, location.name]));
  const statusByTeamId = new Map((packsRes.data ?? []).map((pack) => {
    const namedPlayerCount = normalizeEntryPackPayload({ players: pack.players }).players.filter((player) => Boolean(player.fullName)).length;
    const isUnclaimedDraft = (pack.status === "draft" || pack.status === "rejected") && !pack.common_draft_token;
    return [pack.team_id, isUnclaimedDraft || (pack.status === "draft" && namedPlayerCount === 0) ? "not_started" : pack.status];
  }));
  const teams = (teamsRes.data ?? []).filter((team) => seasonIds.has(team.season_id)).map((team) => ({
    id: team.id,
    seasonId: team.season_id,
    name: team.name,
    locationName: team.location_id ? locationName.get(team.location_id) ?? "Club" : "Club not set",
    registrationStatus: statusByTeamId.get(team.id) ?? "not_started",
  }));
  return { seasons, teams };
}

export async function GET() {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const client = createClient(supabaseUrl, serviceRoleKey);
    return NextResponse.json(await openRegistrationData(client), { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "League registration could not be loaded." }, { status: 400, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const body = await req.json().catch(() => ({}));
    const teamId = String(body?.teamId ?? "").trim();
    const draftToken = String(body?.draftToken ?? "").trim().toLowerCase();
    const startBlank = body?.startBlank === true;
    const takeOver = body?.takeOver === true;
    if (!teamId) throw new Error("Select your team.");
    if (!/^[a-f0-9]{48}$/.test(draftToken)) throw new Error("The private browser key is invalid. Reload the page and try again.");

    const client = createClient(supabaseUrl, serviceRoleKey);
    const data = await openRegistrationData(client);
    const team = data.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new Error("This team is not available for league registration.");

    const existingRes = await client
      .from("league_entry_packs")
      .select("id,public_token,status,common_draft_token")
      .eq("team_id", teamId)
      .eq("season_id", team.seasonId)
      .maybeSingle();
    if (existingRes.error) throw new Error(existingRes.error.message);

    let pack = existingRes.data;
    if (!pack) {
      const createRes = await client
        .from("league_entry_packs")
        .insert({ season_id: team.seasonId, team_id: teamId, common_draft_token: draftToken })
        .select("id,public_token,status,common_draft_token")
        .single();
      if (createRes.error) throw new Error(createRes.error.message);
      pack = createRes.data;
    } else if (pack.common_draft_token !== draftToken) {
      if (!pack.common_draft_token && (pack.status === "draft" || pack.status === "rejected")) {
        const claimRes = await client
          .from("league_entry_packs")
          .update({
            common_draft_token: draftToken,
            status: "draft",
            contact_name: null,
            contact_email: null,
            contact_phone: null,
            players: [],
            general_notes: null,
            phone_sharing_confirmed: false,
            accuracy_confirmed: false,
            submitted_at: null,
            reviewed_at: null,
            reviewed_by_user_id: null,
            review_notes: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pack.id)
          .is("common_draft_token", null)
          .select("id,public_token,status,common_draft_token")
          .single();
        if (claimRes.error) throw new Error(claimRes.error.message);
        pack = claimRes.data;
      } else if (pack.status === "submitted" || pack.status === "approved") {
        return NextResponse.json({ error: `This team registration is already ${pack.status}. Contact the League Secretary if it needs changing.` }, { status: 409, headers: noStore });
      } else if (takeOver && (pack.status === "draft" || pack.status === "rejected")) {
        const replacementPublicToken = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const takeOverRes = await client
          .from("league_entry_packs")
          .update({
            public_token: replacementPublicToken,
            common_draft_token: draftToken,
            status: "draft",
            contact_name: null,
            contact_email: null,
            contact_phone: null,
            players: [],
            competition_notes: null,
            general_notes: null,
            phone_sharing_confirmed: false,
            accuracy_confirmed: false,
            submitted_at: null,
            reviewed_at: null,
            reviewed_by_user_id: null,
            review_notes: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pack.id)
          .eq("common_draft_token", pack.common_draft_token)
          .select("id,public_token,status,common_draft_token")
          .single();
        if (takeOverRes.error) throw new Error(takeOverRes.error.message);
        pack = takeOverRes.data;
      } else {
        return NextResponse.json({
          error: "This team registration has already been started on another browser.",
          code: "DRAFT_SESSION_CONFLICT",
          canTakeOver: true,
        }, { status: 409, headers: noStore });
      }
    }

    if (startBlank && pack.common_draft_token === draftToken && (pack.status === "draft" || pack.status === "rejected")) {
      const blankRes = await client.from("league_entry_packs").update({
        status: "draft",
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        players: [],
        general_notes: null,
        phone_sharing_confirmed: false,
        accuracy_confirmed: false,
        submitted_at: null,
        reviewed_at: null,
        reviewed_by_user_id: null,
        review_notes: null,
        updated_at: new Date().toISOString(),
      }).eq("id", pack.id);
      if (blankRes.error) throw new Error(blankRes.error.message);
      pack = { ...pack, status: "draft" };
    }

    return NextResponse.json({ ok: true, status: pack.status, entryUrl: `/entry-pack/${pack.public_token}` }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Team registration could not be opened." }, { status: 400, headers: noStore });
  }
}

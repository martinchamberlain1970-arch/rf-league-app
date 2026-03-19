"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import InfoModal from "@/components/InfoModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";

type Season = { id: string; name: string; is_published?: boolean | null };
type Team = { id: string; season_id: string; name: string };
type TeamMember = { season_id: string; team_id: string; player_id: string; is_captain: boolean; is_vice_captain: boolean };
type TeamMembership = { season_id: string; team_id: string; player_id: string; is_captain: boolean; is_vice_captain: boolean };
type Fixture = { id: string; season_id: string; home_team_id: string; away_team_id: string; fixture_date: string | null; week_no: number | null; status: "pending" | "in_progress" | "complete" };
type FixtureChangeRequest = {
  id: string;
  fixture_id: string;
  requested_by_user_id: string;
  requester_team_id: string | null;
  request_type: "play_early" | "play_late";
  original_fixture_date: string | null;
  agreed_fixture_date?: string | null;
  opposing_team_agreed: boolean;
  reason: string;
  status: "pending" | "approved_outstanding" | "rescheduled" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const sectionCardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const tintedCardClass = "rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm";
const sectionTitleClass = "text-lg font-semibold text-slate-900";
const exceptionalReasons = ["Illness", "Severe weather conditions", "Death of a player / close relative", "Other"] as const;

export default function RescheduleFixturePage() {
  const admin = useAdminStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title: string; description: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null);
  const [requests, setRequests] = useState<FixtureChangeRequest[]>([]);
  const [requestType, setRequestType] = useState<"play_early" | "play_late">("play_early");
  const [opposingTeamAgreed, setOpposingTeamAgreed] = useState(false);
  const [lateReason, setLateReason] = useState<(typeof exceptionalReasons)[number]>("Illness");
  const [otherExplanation, setOtherExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
    const client = supabase;
    if (!client) return setMessage("Supabase is not configured.");
    setLoading(true);
    const authRes = await client.auth.getUser();
    const userId = authRes.data.user?.id ?? null;
    if (!userId) return setLoading(false);
    const appUserRes = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
    const playerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
    setLinkedPlayerId(playerId);
    if (!playerId) return setLoading(false);

    const [seasonRes, teamRes, memberRes, fixtureRes] = await Promise.all([
      client.from("league_seasons").select("id,name,is_published").eq("is_published", true).order("created_at", { ascending: false }),
      client.from("league_teams").select("id,season_id,name"),
      client.from("league_team_members").select("season_id,team_id,player_id,is_captain,is_vice_captain"),
      client.from("league_fixtures").select("id,season_id,home_team_id,away_team_id,fixture_date,week_no,status").order("fixture_date", { ascending: true }),
    ]);
    const firstError = seasonRes.error?.message || teamRes.error?.message || memberRes.error?.message || fixtureRes.error?.message || null;
    if (firstError) {
      setMessage(firstError);
      return setLoading(false);
    }
    setSeasons((seasonRes.data ?? []) as Season[]);
    setTeams((teamRes.data ?? []) as Team[]);
    setMembers((memberRes.data ?? []) as TeamMember[]);
    setFixtures((fixtureRes.data ?? []) as Fixture[]);

    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (token) {
      const reqRes = await fetch("/api/league/fixture-change-requests", { headers: { Authorization: `Bearer ${token}` } });
      const payload = (await reqRes.json().catch(() => ({}))) as { error?: string; rows?: FixtureChangeRequest[] };
      if (!reqRes.ok) {
        setMessage(payload.error ?? "Failed to load fixture date requests.");
        return setLoading(false);
      }
      setRequests(payload.rows ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { void loadAll(); }, []);

  const myMemberships = useMemo(
    () => (linkedPlayerId ? members.filter((m) => m.player_id === linkedPlayerId) : []) as TeamMembership[],
    [members, linkedPlayerId]
  );
  const captainTeamIds = useMemo(
    () => new Set(myMemberships.filter((m) => m.is_captain || m.is_vice_captain).map((m) => m.team_id)),
    [myMemberships]
  );
  const memberTeamIds = useMemo(() => new Set(myMemberships.map((m) => m.team_id)), [myMemberships]);
  const publishedSeasonIds = useMemo(() => new Set(seasons.map((s) => s.id)), [seasons]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const hasCaptainPrivileges = captainTeamIds.size > 0;

  const myFixtures = useMemo(
    () =>
      fixtures
        .filter(
          (f) =>
            publishedSeasonIds.has(f.season_id) &&
            f.status !== "complete" &&
            (memberTeamIds.has(f.home_team_id) || memberTeamIds.has(f.away_team_id))
        )
        .sort(
          (a, b) =>
            (a.fixture_date ? Date.parse(`${a.fixture_date}T12:00:00`) : Number.MAX_SAFE_INTEGER) -
            (b.fixture_date ? Date.parse(`${b.fixture_date}T12:00:00`) : Number.MAX_SAFE_INTEGER)
        ),
    [fixtures, publishedSeasonIds, memberTeamIds]
  );
  const captainsFixtures = useMemo(
    () =>
      myFixtures.filter((f) => captainTeamIds.has(f.home_team_id) || captainTeamIds.has(f.away_team_id)),
    [myFixtures, captainTeamIds]
  );

  const activeRequestFixtureIds = useMemo(() => new Set(requests.filter((r) => r.status === "pending" || r.status === "approved_outstanding").map((r) => r.fixture_id)), [requests]);
  const nextFixture = useMemo(() => captainsFixtures.find((f) => !activeRequestFixtureIds.has(f.id)) ?? null, [captainsFixtures, activeRequestFixtureIds]);
  const nextFixtureRequests = useMemo(() => nextFixture ? requests.filter((r) => r.fixture_id === nextFixture.id) : [], [requests, nextFixture]);
  const outstandingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending" || r.status === "approved_outstanding"),
    [requests]
  );

  const buildReason = () => {
    if (requestType === "play_early") return `Play before league date requested. Opposing team agreement: ${opposingTeamAgreed ? "confirmed" : "not confirmed"}.`;
    if (lateReason === "Other") return `Exceptional postponement requested: Other. ${otherExplanation.trim()}`.trim();
    return `Exceptional postponement requested: ${lateReason}.`;
  };

  const submitRequest = async () => {
    const client = supabase;
    if (!client || !nextFixture) return;
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) return setMessage("Session expired. Please sign in again.");
    if (requestType === "play_late" && lateReason === "Other" && !otherExplanation.trim()) return setMessage("Add an explanation for the exceptional circumstance.");
    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch("/api/league/fixture-change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fixtureId: nextFixture.id, requestType, opposingTeamAgreed, reason: buildReason() }),
      });
    } catch {
      setSubmitting(false);
      return setMessage("Network error while submitting fixture date request.");
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) return setMessage(payload.error ?? "Failed to submit fixture date request.");
    setInfo({ title: "Request submitted", description: "Your fixture date request is now pending League Secretary review." });
    setOtherExplanation("");
    await loadAll();
  };

  const requestTypeLabel = (value: "play_early" | "play_late") => value === "play_early" ? "Play before league date" : "Exceptional postponement / later date";

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Outstanding Fixtures" eyebrow="League" subtitle="Track approved change requests and, if you're captain or vice-captain, submit the next fixture-date request." />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          <InfoModal open={Boolean(info)} title={info?.title ?? ""} description={info?.description ?? ""} onClose={() => setInfo(null)} />

          {loading ? <section className={sectionCardClass}>Loading...</section> : null}
          {!linkedPlayerId && !loading ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">Your account must be linked to a player profile to request a fixture date change.</section> : null}
          {linkedPlayerId && myMemberships.length === 0 && !loading ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">Your linked player profile is not currently assigned to a published league team.</section> : null}
          {linkedPlayerId && myMemberships.length > 0 && !hasCaptainPrivileges && !loading ? <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900 shadow-sm">Only captains and vice-captains can submit fixture-date requests. Team players can still view outstanding fixtures below.</section> : null}

          {linkedPlayerId && myMemberships.length > 0 ? <>
            <section className={tintedCardClass}>
              <h2 className={sectionTitleClass}>Policy</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>No postponements are allowed as standard.</li>
                <li>Teams may request to play before the league date if the opposing team agrees and the League Secretary approves it first.</li>
                <li>Later-date requests are only for exceptional circumstances such as illness, severe weather conditions, or death of a player / close relative.</li>
                <li>Not having enough players is not treated as exceptional.</li>
                <li>Once approved, the fixture sits as outstanding until the League Secretary sets the agreed date.</li>
              </ul>
            </section>

            {hasCaptainPrivileges ? <section className={sectionCardClass}>
              <h2 className={sectionTitleClass}>Next available fixture</h2>
              {!nextFixture ? <p className="mt-3 text-sm text-slate-600">No outstanding fixture requests are available for your next team fixture right now.</p> : (
                <div className="mt-3 space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">{teamById.get(nextFixture.home_team_id) ?? "Home"} vs {teamById.get(nextFixture.away_team_id) ?? "Away"}</p>
                    <p className="mt-1 text-xs text-slate-600">League date: {nextFixture.fixture_date ? new Date(`${nextFixture.fixture_date}T12:00:00`).toLocaleDateString() : `Week ${nextFixture.week_no ?? "-"}`}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                    <select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={requestType} onChange={(e) => setRequestType(e.target.value as "play_early" | "play_late")}>
                      <option value="play_early">Play before league date</option>
                      <option value="play_late">Exceptional postponement / later date</option>
                    </select>
                    {requestType === "play_late" ? (
                      <select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={lateReason} onChange={(e) => setLateReason(e.target.value as (typeof exceptionalReasons)[number])}>
                        {exceptionalReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                      </select>
                    ) : <div />}
                  </div>
                  {requestType === "play_early" ? (
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={opposingTeamAgreed} onChange={(e) => setOpposingTeamAgreed(e.target.checked)} className="mt-1" />
                      <span>The opposing team has agreed to playing before the league date.</span>
                    </label>
                  ) : null}
                  {requestType === "play_late" && lateReason === "Other" ? (
                    <textarea className="min-h-[96px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Explain the exceptional circumstance." value={otherExplanation} onChange={(e) => setOtherExplanation(e.target.value)} />
                  ) : null}
                  {nextFixtureRequests.length > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      An active request already exists for this fixture and will stay outstanding until the League Secretary rejects it or sets a new agreed date.
                    </div>
                  ) : null}
                  <button type="button" onClick={() => void submitRequest()} disabled={submitting} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {submitting ? "Submitting..." : "Submit request"}
                  </button>
                </div>
              )}
            </section> : null}

            <section className={sectionCardClass}>
              <h2 className={sectionTitleClass}>Outstanding fixtures</h2>
              <div className="mt-3 space-y-2">
                {outstandingRequests.length === 0 ? <p className="text-sm text-slate-600">No outstanding fixture requests for your teams.</p> : null}
                {outstandingRequests.map((request) => {
                  const fixture = myFixtures.find((f) => f.id === request.fixture_id);
                  return <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{fixture ? `${teamById.get(fixture.home_team_id) ?? "Home"} vs ${teamById.get(fixture.away_team_id) ?? "Away"}` : "Fixture"}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${request.status === "approved_outstanding" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{request.status === "approved_outstanding" ? "Outstanding" : "Pending review"}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{requestTypeLabel(request.request_type)} · Original date: {request.original_fixture_date ? new Date(`${request.original_fixture_date}T12:00:00`).toLocaleDateString() : "Not set"}</p>
                    <p className="mt-1">{request.reason}</p>
                    {request.status === "approved_outstanding" ? (
                      <p className="mt-1 text-xs text-indigo-700">Awaiting the League Secretary to set the new agreed date.</p>
                    ) : null}
                    {request.review_notes ? <p className="mt-1 text-xs text-slate-600">League Secretary note: {request.review_notes}</p> : null}
                  </div>;
                })}
              </div>
            </section>
          </> : null}
        </RequireAuth>
      </div>
    </main>
  );
}

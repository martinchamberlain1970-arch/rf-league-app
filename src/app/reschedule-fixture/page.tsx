"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import InfoModal from "@/components/InfoModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";

type Season = {
  id: string;
  name: string;
  is_published?: boolean | null;
};
type Team = { id: string; season_id: string; name: string };
type TeamMember = {
  season_id: string;
  team_id: string;
  player_id: string;
  is_captain: boolean;
  is_vice_captain: boolean;
};
type Fixture = {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  fixture_date: string | null;
  week_no: number | null;
  status: "pending" | "in_progress" | "complete";
};
type FixtureChangeRequest = {
  id: string;
  fixture_id: string;
  requested_by_user_id: string;
  requester_team_id: string | null;
  request_type: "play_early" | "play_late";
  original_fixture_date: string | null;
  proposed_fixture_date: string;
  opposing_team_agreed: boolean;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const sectionCardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const tintedCardClass = "rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm";
const sectionTitleClass = "text-lg font-semibold text-slate-900";

const exceptionalReasons = [
  "Illness",
  "Severe weather conditions",
  "Death of a player / close relative",
  "Other",
] as const;

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
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [requests, setRequests] = useState<FixtureChangeRequest[]>([]);
  const [requestType, setRequestType] = useState<"play_early" | "play_late">("play_early");
  const [proposedDate, setProposedDate] = useState("");
  const [opposingTeamAgreed, setOpposingTeamAgreed] = useState(false);
  const [lateReason, setLateReason] = useState<(typeof exceptionalReasons)[number]>("Illness");
  const [otherExplanation, setOtherExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    setLoading(true);
    const authRes = await client.auth.getUser();
    const userId = authRes.data.user?.id ?? null;
    if (!userId) {
      setLoading(false);
      return;
    }
    const appUserRes = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
    const playerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
    setLinkedPlayerId(playerId);
    if (!playerId) {
      setLoading(false);
      return;
    }

    const [seasonRes, teamRes, memberRes, fixtureRes] = await Promise.all([
      client.from("league_seasons").select("id,name,is_published").eq("is_published", true).order("created_at", { ascending: false }),
      client.from("league_teams").select("id,season_id,name"),
      client.from("league_team_members").select("season_id,team_id,player_id,is_captain,is_vice_captain"),
      client.from("league_fixtures").select("id,season_id,home_team_id,away_team_id,fixture_date,week_no,status").order("fixture_date", { ascending: true }),
    ]);

    const firstError = seasonRes.error?.message || teamRes.error?.message || memberRes.error?.message || fixtureRes.error?.message || null;
    if (firstError) {
      setMessage(firstError);
      setLoading(false);
      return;
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
        setLoading(false);
        return;
      }
      setRequests(payload.rows ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const captainTeamIds = useMemo(() => {
    if (!linkedPlayerId) return new Set<string>();
    return new Set(
      members
        .filter((m) => m.player_id === linkedPlayerId && (m.is_captain || m.is_vice_captain))
        .map((m) => m.team_id)
    );
  }, [members, linkedPlayerId]);

  const publishedSeasonIds = useMemo(() => new Set(seasons.map((s) => s.id)), [seasons]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  const myFixtures = useMemo(
    () =>
      fixtures.filter(
        (f) =>
          publishedSeasonIds.has(f.season_id) &&
          f.status !== "complete" &&
          (captainTeamIds.has(f.home_team_id) || captainTeamIds.has(f.away_team_id))
      ),
    [fixtures, publishedSeasonIds, captainTeamIds]
  );

  const selectedFixture = useMemo(() => myFixtures.find((f) => f.id === selectedFixtureId) ?? null, [myFixtures, selectedFixtureId]);

  useEffect(() => {
    if (!selectedFixture) {
      setProposedDate("");
      return;
    }
    setProposedDate(selectedFixture.fixture_date ?? "");
  }, [selectedFixtureId, selectedFixture?.fixture_date]);

  const fixtureRequests = useMemo(
    () => (selectedFixture ? requests.filter((r) => r.fixture_id === selectedFixture.id) : []),
    [requests, selectedFixture]
  );

  const buildReason = () => {
    if (requestType === "play_early") {
      return `Play before league date requested. Opposing team agreement: ${opposingTeamAgreed ? "confirmed" : "not confirmed"}.`;
    }
    if (lateReason === "Other") {
      return `Exceptional postponement requested: Other. ${otherExplanation.trim()}`.trim();
    }
    return `Exceptional postponement requested: ${lateReason}.`;
  };

  const submitRequest = async () => {
    const client = supabase;
    if (!client || !selectedFixture) return;
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    if (!proposedDate) {
      setMessage("Select a proposed fixture date.");
      return;
    }
    if (requestType === "play_late" && lateReason === "Other" && !otherExplanation.trim()) {
      setMessage("Add an explanation for the exceptional circumstance.");
      return;
    }
    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch("/api/league/fixture-change-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fixtureId: selectedFixture.id,
          requestType,
          proposedFixtureDate: proposedDate,
          opposingTeamAgreed,
          reason: buildReason(),
        }),
      });
    } catch {
      setSubmitting(false);
      setMessage("Network error while submitting fixture date request.");
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to submit fixture date request.");
      return;
    }
    setInfo({ title: "Request submitted", description: "Your fixture date request is now pending League Secretary review." });
    setOtherExplanation("");
    await loadAll();
  };

  const requestTypeLabel = (value: "play_early" | "play_late") =>
    value === "play_early" ? "Play before league date" : "Exceptional postponement / later date";

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Reschedule Fixture" eyebrow="League" subtitle="Request an approved fixture date change." />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          <InfoModal open={Boolean(info)} title={info?.title ?? ""} description={info?.description ?? ""} onClose={() => setInfo(null)} />

          {loading ? <section className={sectionCardClass}>Loading...</section> : null}

          {!linkedPlayerId && !loading ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
              Your account must be linked to a player profile to request a fixture date change.
            </section>
          ) : null}

          {linkedPlayerId && captainTeamIds.size === 0 && !loading ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
              Only captains and vice-captains can request fixture date changes.
            </section>
          ) : null}

          {linkedPlayerId && captainTeamIds.size > 0 ? (
            <>
              <section className={tintedCardClass}>
                <h2 className={sectionTitleClass}>Policy</h2>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  <li>No postponements are allowed as standard.</li>
                  <li>Teams may request to play before the league date if the opposing team agrees and the League Secretary approves it first.</li>
                  <li>Later-date requests are only for exceptional circumstances such as illness, severe weather conditions, or death of a player / close relative.</li>
                  <li>Not having enough players is not treated as exceptional.</li>
                </ul>
              </section>

              <section className={sectionCardClass}>
                <h2 className={sectionTitleClass}>Request</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px]">
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    value={selectedFixtureId}
                    onChange={(e) => setSelectedFixtureId(e.target.value)}
                  >
                    <option value="">Select fixture</option>
                    {myFixtures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.fixture_date ? new Date(`${f.fixture_date}T12:00:00`).toLocaleDateString() : `Week ${f.week_no ?? "-"}`} · {teamById.get(f.home_team_id) ?? "Home"} vs {teamById.get(f.away_team_id) ?? "Away"}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value as "play_early" | "play_late")}
                    disabled={!selectedFixture}
                  >
                    <option value="play_early">Play before league date</option>
                    <option value="play_late">Exceptional postponement / later date</option>
                  </select>
                </div>

                {selectedFixture ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[220px_220px]">
                      <input
                        type="date"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={proposedDate}
                        onChange={(e) => setProposedDate(e.target.value)}
                      />
                      {requestType === "play_late" ? (
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={lateReason}
                          onChange={(e) => setLateReason(e.target.value as (typeof exceptionalReasons)[number])}
                        >
                          {exceptionalReasons.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>

                    {requestType === "play_early" ? (
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={opposingTeamAgreed}
                          onChange={(e) => setOpposingTeamAgreed(e.target.checked)}
                          className="mt-1"
                        />
                        <span>The opposing team has agreed to playing before the league date.</span>
                      </label>
                    ) : null}

                    {requestType === "play_late" && lateReason === "Other" ? (
                      <textarea
                        className="min-h-[96px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Explain the exceptional circumstance."
                        value={otherExplanation}
                        onChange={(e) => setOtherExplanation(e.target.value)}
                      />
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void submitRequest()}
                      disabled={submitting}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {submitting ? "Submitting..." : "Submit request"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">Select one of your team fixtures to submit a request.</p>
                )}
              </section>

              <section className={sectionCardClass}>
                <h2 className={sectionTitleClass}>Request history</h2>
                <div className="mt-3 space-y-2">
                  {requests.length === 0 ? <p className="text-sm text-slate-600">No fixture date requests logged yet.</p> : null}
                  {fixtureRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{requestTypeLabel(request.request_type)} · {new Date(`${request.proposed_fixture_date}T12:00:00`).toLocaleDateString()}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${request.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : request.status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                          {request.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">Requested {new Date(request.created_at).toLocaleString()}</p>
                      <p className="mt-1">{request.reason}</p>
                      {request.review_notes ? <p className="mt-1 text-xs text-slate-600">League Secretary note: {request.review_notes}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}

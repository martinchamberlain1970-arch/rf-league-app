"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { knockoutRoundLabel, knockoutSize } from "@/lib/knockout-draw";
import { mickWhiteScoring } from "@/lib/public-competition-entry";
import { supabase } from "@/lib/supabase";

type CupFixture = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  fixture_date: string | null;
  fixture_status: string | null;
  home_points: number | null;
  away_points: number | null;
};
type Tie = CupFixture & {
  round_no: number;
  match_no: number;
  is_bye: boolean;
  fixture_id: string | null;
  winner_team_id: string | null;
};
const dateLabel = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" });

export default function MickWhiteFixtures({ competitionId, canManage, entriesOpen, entryRevision, pendingCount, finalVenueId }: {
  competitionId: string;
  canManage: boolean;
  entriesOpen: boolean;
  entryRevision: string;
  pendingCount: number;
  finalVenueId: string | null;
}) {
  const [schedule, setSchedule] = useState<{ ties: Tie[]; legacy: CupFixture[]; names: Map<string, string>; approved: string[] } | null>(null);
  const [revision, setRevision] = useState(0);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let current = true;
    const load = async () => {
      try {
        const [draw, entries] = await Promise.all([
          client.from("mick_white_draw").select("id,round_no,match_no,home_team_id,away_team_id,is_bye,fixture_id,fixture_date,fixture_status,home_points,away_points,winner_team_id")
            .eq("competition_id", competitionId).order("round_no").order("match_no"),
          canManage ? client.from("competition_entries").select("league_team_id")
            .eq("competition_id", competitionId).eq("status", "approved").not("league_team_id", "is", null) : null,
        ]);
        if (draw.error || entries?.error) throw new Error("Cup draw or approved teams could not be loaded.");
        const existing = draw.data.length ? null : await client.from("league_fixtures")
          .select("id,home_team_id,away_team_id,fixture_date,status,home_points,away_points")
          .eq("cup_competition_id", competitionId).order("fixture_date").order("id");
        if (existing?.error) throw new Error("Existing cup fixtures could not be loaded.");
        const legacy = (existing?.data ?? []).map(({ status, ...fixture }) => ({ ...fixture, fixture_status: status }));
        const ids = [...new Set([...draw.data, ...legacy].flatMap((row) => [row.home_team_id, row.away_team_id]).filter(Boolean))];
        const roster = ids.length ? await client.from("league_teams").select("id,name").in("id", ids) : null;
        if (roster?.error) throw new Error("Cup team names could not be loaded.");
        if (current) setSchedule({
          ties: draw.data, legacy, names: new Map((roster?.data ?? []).map(({ id, name }) => [id, name])),
          approved: (entries?.data ?? []).map(({ league_team_id }) => league_team_id),
        });
      } catch (error) {
        if (current) setMessage(error instanceof Error ? error.message : "Cup fixtures could not be loaded.");
      }
    };
    void load();
    return () => { current = false; };
  }, [competitionId, canManage, revision, entryRevision]);

  const save = async (action: { action: "publish_team_draw"; teamIds: string[] } | { action: "date_team_tie"; tieId: string; fixtureDate: string }) => {
    if (!supabase || busy) return;
    setBusy(true);
    setConfirmDraw(false);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in as a league officer.");
      const response = await fetch("/api/league/manage-competition", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ ...action, competitionId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The cup update could not be saved.");
      setRevision((value) => value + 1);
      setMessage(action.action === "publish_team_draw" ? "Official draw published." : "Agreed date saved. The match-night scorecard is ready for that date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The cup update could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const ties = schedule?.ties ?? [];
  const totalRounds = ties.at(-1)?.round_no ?? 0;
  const teamName = (id: string | null) => id ? schedule?.names.get(id) ?? "League team" : "Awaiting result";
  const countdown = schedule ? knockoutSize(schedule.approved.length) : null;
  const drawBlocked = entriesOpen ? "Close entries before running the draw." : pendingCount ? "Review all pending entries before running the draw."
    : (schedule?.approved.length ?? 0) < 4 ? "Rule 30 requires at least four approved teams for a standard knockout." : "";
  const actionClass = "rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
  const showScorecard = (fixture: CupFixture, fixtureId: string) => (
    <div>
      {fixture.fixture_date ? <p className="text-slate-600">{dateLabel.format(new Date(fixture.fixture_date))}</p> : null}
      {fixture.fixture_status === "complete" ? (
        <strong>{fixture.home_points}–{fixture.away_points}</strong>
      ) : (
        <Link className="font-semibold text-teal-800 underline" href={`/captain-results?fixtureId=${fixtureId}`}>Match-night scorecard</Link>
      )}
    </div>
  );

  return (
    <section id="competition-fixtures" className="scroll-mt-28 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Cup fixtures</h3>
        {ties.length ? <button type="button" onClick={() => setRevision((value) => value + 1)} className="text-sm font-semibold text-teal-800 underline">Refresh results</button> : null}
      </div>
      <p className="text-sm text-slate-700">{mickWhiteScoring}</p>
      {schedule && !ties.length && !schedule.legacy.length ? <p className="text-sm font-medium">Awaiting official draw</p> : null}
      {schedule?.legacy.length ? (
        <ul className="divide-y divide-slate-200">
          {schedule.legacy.map((fixture) => <li key={fixture.id} className="py-2 text-sm">
            <strong>{teamName(fixture.home_team_id)} vs {teamName(fixture.away_team_id)}</strong>
            {showScorecard(fixture, fixture.id)}
          </li>)}
        </ul>
      ) : null}
      {canManage && schedule && !ties.length && !schedule.legacy.length ? (
        <div className="space-y-2">
          {drawBlocked ? <p className="text-sm text-slate-600">{drawBlocked}</p> : confirmDraw ? (
            <>
              <p className="text-sm">Publish the draw for {schedule.approved.length} teams across {countdown?.rounds} rounds?</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} className={actionClass} onClick={() => void save({ action: "publish_team_draw", teamIds: schedule.approved })}>Confirm and publish draw</button>
                <button type="button" onClick={() => setConfirmDraw(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancel</button>
              </div>
            </>
          ) : <button type="button" disabled={busy} className={actionClass} onClick={() => setConfirmDraw(true)}>Run official draw</button>}
        </div>
      ) : null}
      {Array.from({ length: totalRounds }, (_, index) => index + 1).map((round) => (
        <section key={round} className="rounded-xl border border-slate-200">
          <h4 className="border-b border-slate-200 bg-slate-50 p-3 text-sm font-semibold">{knockoutRoundLabel(round, totalRounds)}</h4>
          <ul className="divide-y divide-slate-200">
            {ties.filter((tie) => tie.round_no === round).map((tie) => (
              <li key={tie.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <strong>{teamName(tie.home_team_id)} {tie.is_bye ? "has a bye" : `vs ${teamName(tie.away_team_id)}`}</strong>
                  {tie.fixture_status === "complete" ? (
                    <p className="text-slate-600">{tie.winner_team_id ? `${teamName(tie.winner_team_id)} won` : "Tied score awaiting an officer decision"}</p>
                  ) : null}
                </div>
                {tie.fixture_id ? showScorecard(tie, tie.fixture_id)
                  : canManage && tie.home_team_id && tie.away_team_id ? (
                    round === totalRounds && !finalVenueId ? <a className="font-semibold text-teal-800 underline" href="#final-scheduling">Set the neutral final venue</a> :
                    <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
                      event.preventDefault();
                      const fixtureDate = String(new FormData(event.currentTarget).get("fixtureDate") ?? "");
                      if (fixtureDate) void save({ action: "date_team_tie", tieId: tie.id, fixtureDate });
                    }}>
                      <label className="flex flex-wrap items-center gap-2">Agreed date
                        <input type="date" name="fixtureDate" required className="rounded-lg border border-slate-300 bg-white p-2" />
                      </label>
                      <button type="submit" disabled={busy} className={actionClass}>Save date</button>
                    </form>
                  ) : tie.home_team_id && tie.away_team_id ? <span className="text-slate-600">Date to be agreed</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}

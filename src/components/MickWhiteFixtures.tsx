"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { mickWhiteScoring } from "@/lib/public-competition-entry";
import { supabase } from "@/lib/supabase";

type CupFixture = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  fixture_date: string;
  status: string;
  home_points: number;
  away_points: number;
};
type Team = { id: string; name: string };
const dateLabel = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" });

export default function MickWhiteFixtures({ competitionId, canManage, entriesOpen, entryRevision }: {
  competitionId: string;
  canManage: boolean;
  entriesOpen: boolean;
  entryRevision: string;
}) {
  const [fixtures, setFixtures] = useState<CupFixture[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [approved, setApproved] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let current = true;
    const load = async () => {
      try {
        const [schedule, entries] = await Promise.all([
          client.from("league_fixtures")
            .select("id,home_team_id,away_team_id,fixture_date,status,home_points,away_points")
            .eq("cup_competition_id", competitionId).order("fixture_date").order("id"),
          canManage ? client.from("competition_entries").select("league_team_id")
            .eq("competition_id", competitionId).eq("status", "approved").not("league_team_id", "is", null) : null,
        ]);
        if (schedule.error || entries?.error) throw new Error("Cup fixtures or approved teams could not be loaded.");
        const approvedIds = (entries?.data ?? []).map(({ league_team_id }) => String(league_team_id));
        const ids = [...new Set([...approvedIds, ...schedule.data.flatMap((row) => [row.home_team_id, row.away_team_id])])];
        const roster = ids.length ? await client.from("league_teams").select("id,name").in("id", ids).order("name") : null;
        if (roster?.error) throw new Error("Cup team names could not be loaded.");
        if (current) {
          setFixtures(schedule.data);
          setTeams(roster?.data ?? []);
          setApproved(approvedIds);
        }
      } catch (error) {
        if (current) setMessage(error instanceof Error ? error.message : "Cup fixtures could not be loaded.");
      }
    };
    void load();
    return () => { current = false; };
  }, [competitionId, canManage, revision, entryRevision]);

  const scheduleFixture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || busy || !home || !away || home === away || !date) return;
    setBusy(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in as a league officer to save a fixture.");
      const response = await fetch("/api/league/manage-competition", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ action: "schedule_team_fixture", competitionId, homeTeamId: home, awayTeamId: away, fixtureDate: date }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The cup fixture could not be saved.");
      setHome("");
      setAway("");
      setDate("");
      setRevision((value) => value + 1);
      setMessage("Fixture saved. The match-night scorecard is ready for the fixture date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The cup fixture could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const approvedTeams = teams.filter((team) => approved.includes(team.id));
  const teamName = (id: string) => teams.find((team) => team.id === id)?.name ?? "League team";
  const fieldClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2";
  return (
    <section id="competition-fixtures" className="scroll-mt-28 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-slate-900">Cup fixtures</h3>
      <p className="text-sm text-slate-700">{mickWhiteScoring}</p>
      {fixtures?.length ? (
        <ul className="divide-y divide-slate-200">
          {fixtures.map((fixture) => (
            <li key={fixture.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <strong>{teamName(fixture.home_team_id)} vs {teamName(fixture.away_team_id)}</strong>
                <p className="text-slate-600">{dateLabel.format(new Date(fixture.fixture_date))}</p>
              </div>
              {fixture.status === "complete" ? (
                <div>
                  <strong>{fixture.home_points}–{fixture.away_points}</strong>
                  {fixture.home_points !== fixture.away_points ? (
                    <p className="text-slate-700">{teamName(fixture.home_points > fixture.away_points ? fixture.home_team_id : fixture.away_team_id)} won</p>
                  ) : <p className="text-slate-700">Tied score awaiting an officer decision</p>}
                </div>
              ) : (
                <Link className="font-semibold text-teal-800 underline" href={`/captain-results?fixtureId=${fixture.id}`}>Match-night scorecard</Link>
              )}
            </li>
          ))}
        </ul>
      ) : fixtures ? <p className="text-sm font-medium">Awaiting official draw</p> : null}
      {canManage && fixtures && (
        entriesOpen ? <p className="text-sm text-slate-600">Close entries before adding scheduled fixtures from the draw.</p> :
        approvedTeams.length < 2 ? <p className="text-sm text-slate-600">At least two approved team entries are needed to add a fixture.</p> :
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer font-semibold">Add a scheduled fixture</summary>
          <form onSubmit={scheduleFixture} className="mt-3 space-y-3 text-sm">
            <p className="text-slate-600">Choose the teams from the official draw and enter the agreed match date.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <label>Home team
                <select required value={home} onChange={(event) => setHome(event.target.value)} className={fieldClass}>
                  <option value="">Select team</option>
                  {approvedTeams.filter(({ id }) => id !== away).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label>Away team
                <select required value={away} onChange={(event) => setAway(event.target.value)} className={fieldClass}>
                  <option value="">Select team</option>
                  {approvedTeams.filter(({ id }) => id !== home).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label>Agreed match date
                <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={fieldClass} />
              </label>
            </div>
            <button type="submit" disabled={busy || !home || !away || !date} className="rounded-lg bg-teal-800 px-3 py-2 font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save fixture and scorecard"}
            </button>
          </form>
        </details>
      )}
      {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}

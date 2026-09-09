"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Season = { id: string; name: string };
type Fixture = { id: string; season_id: string; week_no: number; fixture_date: string; home_team_id: string; away_team_id: string; submissionOpen: boolean; submissionStatus: "available" | "already_submitted" | "not_open_yet" };
type Team = { id: string; name: string };
type Slot = { fixture_id: string; slot_no: number; slot_type: "singles" | "doubles" };
type Player = { id: string; name: string };
type Payload = { seasons: Season[]; fixtures: Fixture[]; teams: Team[]; frames: Slot[]; rosters: Record<string, Player[]> };
type BreakEntry = { player_id: string; break_value: string };
type FrameEntry = {
  slot_no: number;
  slot_type: "singles" | "doubles";
  winner_side: "" | "home" | "away";
  home_player1_id: string;
  home_player2_id: string;
  away_player1_id: string;
  away_player2_id: string;
  home_forfeit: boolean;
  away_forfeit: boolean;
  home_points_scored: string;
  away_points_scored: string;
  break_entries: BreakEntry[];
};

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function CopyrightFooter() {
  return <footer className="px-3 py-5 text-center text-xs text-slate-500">Rack &amp; Frame League Manager &copy; {new Date().getFullYear()} Martin Chamberlain. All rights reserved.</footer>;
}

export default function PaperScorecardPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [seasonId, setSeasonId] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [submitterTeamId, setSubmitterTeamId] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [website, setWebsite] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [frames, setFrames] = useState<FrameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    void fetch("/api/public/paper-scorecard", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "The available fixtures could not be loaded.");
        setData(payload);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "The available fixtures could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const teamById = useMemo(() => new Map((data?.teams ?? []).map((team) => [team.id, team.name])), [data?.teams]);
  const seasonFixtures = useMemo(() => (data?.fixtures ?? []).filter((fixture) => fixture.season_id === seasonId), [data?.fixtures, seasonId]);
  const fixture = useMemo(() => (data?.fixtures ?? []).find((row) => row.id === fixtureId) ?? null, [data?.fixtures, fixtureId]);
  const homeRoster = fixture ? data?.rosters?.[fixture.home_team_id] ?? [] : [];
  const awayRoster = fixture ? data?.rosters?.[fixture.away_team_id] ?? [] : [];

  function selectSeason(value: string) {
    setSeasonId(value);
    setFixtureId("");
    setSubmitterTeamId("");
    setFrames([]);
    setError("");
  }

  function selectFixture(value: string) {
    setFixtureId(value);
    setSubmitterTeamId("");
    setError("");
    const slots = (data?.frames ?? []).filter((slot) => slot.fixture_id === value);
    setFrames(slots.map((slot) => ({
      slot_no: slot.slot_no,
      slot_type: slot.slot_type,
      winner_side: "",
      home_player1_id: "",
      home_player2_id: "",
      away_player1_id: "",
      away_player2_id: "",
      home_forfeit: false,
      away_forfeit: false,
      home_points_scored: "",
      away_points_scored: "",
      break_entries: [],
    })));
  }

  function updateFrame(index: number, patch: Partial<FrameEntry>) {
    setFrames((current) => current.map((frame, rowIndex) => rowIndex === index ? { ...frame, ...patch } : frame));
  }

  function addBreak(index: number) {
    setFrames((current) => current.map((frame, rowIndex) => rowIndex === index ? { ...frame, break_entries: [...frame.break_entries, { player_id: "", break_value: "" }] } : frame));
  }

  function updateBreak(frameIndex: number, breakIndex: number, patch: Partial<BreakEntry>) {
    setFrames((current) => current.map((frame, rowIndex) => rowIndex === frameIndex ? {
      ...frame,
      break_entries: frame.break_entries.map((entry, entryIndex) => entryIndex === breakIndex ? { ...entry, ...patch } : entry),
    } : frame));
  }

  function removeBreak(frameIndex: number, breakIndex: number) {
    setFrames((current) => current.map((frame, rowIndex) => rowIndex === frameIndex ? { ...frame, break_entries: frame.break_entries.filter((_, entryIndex) => entryIndex !== breakIndex) } : frame));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.set("fixtureId", fixtureId);
      form.set("submitterTeamId", submitterTeamId);
      form.set("submitterName", submitterName);
      form.set("bothTeamsConfirmed", String(confirmed));
      form.set("website", website);
      form.set("frameResults", JSON.stringify(frames.map((frame) => ({
        ...frame,
        home_points_scored: frame.home_points_scored === "" ? null : Number(frame.home_points_scored),
        away_points_scored: frame.away_points_scored === "" ? null : Number(frame.away_points_scored),
        break_entries: frame.break_entries.map((entry) => ({ player_id: entry.player_id, break_value: Number(entry.break_value) })),
      }))));
      if (photo) form.set("scorecardPhoto", photo);
      const response = await fetch("/api/public/paper-scorecard", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "The paper scorecard could not be submitted.");
      setComplete(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The paper scorecard could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><div className="mx-auto max-w-3xl"><section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-xl"><div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-7 text-white"><p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Rack &amp; Frame · Paper scorecard</p><h1 className="mt-3 text-3xl font-black">Submission received</h1></div><div className="p-7"><p className="text-lg font-bold text-emerald-800">Thank you. The scorecard has been sent to the League Secretary and Chairman for approval.</p><p className="mt-3 leading-7 text-slate-600">The fixture, league table, player records, Elo and handicaps have not been changed yet. Any uploaded photograph is private and will be deleted automatically after the submission is approved or rejected.</p><a href="/paper-scorecard" className="mt-6 inline-flex rounded-xl bg-teal-700 px-5 py-3 font-bold text-white">Submit another fixture</a></div></section><CopyrightFooter /></div></main>;

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-3xl bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Rack &amp; Frame · Public result entry</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Submit a paper scorecard</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-200">For teams using a signed paper scorecard. No app account is required. Every submission is checked by a league officer before any official record changes.</p>
        </header>

        {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-4 font-semibold text-rose-900">{error}</section> : null}
        {loading ? <section className="rounded-2xl bg-white p-6 text-slate-600 shadow-sm">Loading current league fixtures…</section> : null}

        {!loading && data ? <form onSubmit={submit} className="space-y-4">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">1. Select the match</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="font-bold text-slate-800">League division<select required value={seasonId} onChange={(event) => selectSeason(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"><option value="">Select division</option>{data.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
              <label className="font-bold text-slate-800">Fixture<select required value={fixtureId} onChange={(event) => selectFixture(event.target.value)} disabled={!seasonId} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal disabled:bg-slate-100"><option value="">{seasonId ? "Select fixture" : "Select the division first"}</option>{seasonFixtures.map((row) => <option key={row.id} value={row.id} disabled={!row.submissionOpen}>Week {row.week_no} · {formatDate(row.fixture_date)} · {teamById.get(row.home_team_id)} vs {teamById.get(row.away_team_id)}{row.submissionStatus === "already_submitted" ? " · already submitted" : row.submissionStatus === "not_open_yet" ? " · opens on match day" : ""}</option>)}</select></label>
            </div>
            {fixture ? <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4"><p className="text-sm font-bold text-teal-800">Week {fixture.week_no} · {formatDate(fixture.fixture_date)}</p><p className="mt-1 text-xl font-black text-slate-950">{teamById.get(fixture.home_team_id)} vs {teamById.get(fixture.away_team_id)}</p></div> : null}
          </section>

          {fixture ? <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">2. Enter every frame</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Copy the names and final scores from the signed paper card. Select “No show” only where the frame was forfeited.</p>
            <div className="mt-4 space-y-4">{frames.map((frame, index) => {
              const participants = [...homeRoster, ...awayRoster].filter((player) => [frame.home_player1_id, frame.home_player2_id, frame.away_player1_id, frame.away_player2_id].includes(player.id));
              const playerSelect = (side: "home" | "away", position: 1 | 2) => {
                const roster = side === "home" ? homeRoster : awayRoster;
                const key = `${side}_player${position}_id` as keyof FrameEntry;
                return <select required={!(side === "home" ? frame.home_forfeit : frame.away_forfeit)} disabled={side === "home" ? frame.home_forfeit : frame.away_forfeit} value={String(frame[key])} onChange={(event) => updateFrame(index, { [key]: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"><option value="">Select {position === 2 ? "second " : ""}player</option>{roster.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select>;
              };
              return <article key={frame.slot_no} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">Frame {frame.slot_no} · {frame.slot_type === "doubles" ? "Doubles" : "Singles"}</h3><select required value={frame.winner_side} onChange={(event) => updateFrame(index, { winner_side: event.target.value as FrameEntry["winner_side"] })} className="rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Select winner</option><option value="home">{teamById.get(fixture.home_team_id)}</option><option value="away">{teamById.get(fixture.away_team_id)}</option></select></div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_150px_1fr] lg:items-start">
                  <div><p className="mb-2 text-sm font-bold">{teamById.get(fixture.home_team_id)}</p><div className="space-y-2">{playerSelect("home", 1)}{frame.slot_type === "doubles" ? playerSelect("home", 2) : null}</div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={frame.home_forfeit} onChange={(event) => updateFrame(index, { home_forfeit: event.target.checked, home_player1_id: event.target.checked ? "" : frame.home_player1_id, home_player2_id: event.target.checked ? "" : frame.home_player2_id, winner_side: event.target.checked ? "away" : frame.winner_side })} />Home no show</label></div>
                  <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-600">Home score<input type="number" min="0" disabled={frame.home_forfeit || frame.away_forfeit} required={!frame.home_forfeit && !frame.away_forfeit} value={frame.home_points_scored} onChange={(event) => updateFrame(index, { home_points_scored: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base disabled:bg-slate-100" /></label><label className="text-xs font-bold text-slate-600">Away score<input type="number" min="0" disabled={frame.home_forfeit || frame.away_forfeit} required={!frame.home_forfeit && !frame.away_forfeit} value={frame.away_points_scored} onChange={(event) => updateFrame(index, { away_points_scored: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base disabled:bg-slate-100" /></label></div>
                  <div><p className="mb-2 text-sm font-bold">{teamById.get(fixture.away_team_id)}</p><div className="space-y-2">{playerSelect("away", 1)}{frame.slot_type === "doubles" ? playerSelect("away", 2) : null}</div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={frame.away_forfeit} onChange={(event) => updateFrame(index, { away_forfeit: event.target.checked, away_player1_id: event.target.checked ? "" : frame.away_player1_id, away_player2_id: event.target.checked ? "" : frame.away_player2_id, winner_side: event.target.checked ? "home" : frame.winner_side })} />Away no show</label></div>
                </div>
                <div className="mt-3 border-t border-slate-200 pt-3"><button type="button" onClick={() => addBreak(index)} className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-bold text-teal-800">Add a 30+ break</button>{frame.break_entries.map((entry, breakIndex) => <div key={breakIndex} className="mt-2 grid gap-2 sm:grid-cols-[1fr_130px_auto]"><select required value={entry.player_id} onChange={(event) => updateBreak(index, breakIndex, { player_id: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Select player making the break</option>{participants.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><input required type="number" min="30" max="147" placeholder="Break" value={entry.break_value} onChange={(event) => updateBreak(index, breakIndex, { break_value: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2" /><button type="button" onClick={() => removeBreak(index, breakIndex)} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700">Remove</button></div>)}</div>
              </article>;
            })}</div>
          </section> : null}

          {fixture ? <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">3. Confirm and submit</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="font-bold">Submitting team<select required value={submitterTeamId} onChange={(event) => setSubmitterTeamId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"><option value="">Select team</option><option value={fixture.home_team_id}>{teamById.get(fixture.home_team_id)}</option><option value={fixture.away_team_id}>{teamById.get(fixture.away_team_id)}</option></select></label><label className="font-bold">Your full name<input required value={submitterName} onChange={(event) => setSubmitterName(event.target.value)} placeholder="First name and surname" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label></div>
            <label className="mt-4 block font-bold">Signed scorecard photograph <span className="font-normal text-slate-500">(optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" /></label>
            <p className="mt-2 text-xs leading-5 text-slate-500">Maximum 6 MB. The image is held privately while the submission is reviewed, then permanently deleted after approval or rejection. If it is still awaiting review, it expires after 30 days.</p>
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-950"><input required type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5" /><span>I confirm that both teams have checked and agreed the result shown on the signed scorecard.</span></label>
            <div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label></div>
            <button disabled={submitting} className="mt-5 w-full rounded-xl bg-teal-700 px-5 py-4 text-lg font-black text-white disabled:opacity-50">{submitting ? "Submitting securely…" : "Send scorecard for league approval"}</button>
          </section> : null}
        </form> : null}
        <CopyrightFooter />
      </div>
    </main>
  );
}

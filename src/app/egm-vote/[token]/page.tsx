"use client";

import { FormEvent, useEffect, useState } from "react";

type Proposal = { id: number; title: string; summary: string };
type Attendee = { id: string; name: string; teamName: string; clubName: string };
type Meeting = {
  title: string;
  seasonLabel: string;
  meetingAt: string | null;
  status: string;
  activeRound: number | null;
  proposals: Proposal[];
};

export default function EgmVotePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [attendeeId, setAttendeeId] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ name: string; round: number } | null>(null);

  useEffect(() => {
    let active = true;
    void params.then(async ({ token: resolvedToken }) => {
      if (!active) return;
      setToken(resolvedToken);
      const response = await fetch(`/api/public/egm-voting/${encodeURIComponent(resolvedToken)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The EGM ballot could not be loaded.");
      if (active) {
        setMeeting(payload.meeting);
        setAttendees(payload.attendees ?? []);
      }
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "The EGM ballot could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params]);

  const meetingStatus = meeting?.status;
  useEffect(() => {
    if (!token || !meetingStatus || meetingStatus === "round_1_open" || meetingStatus === "round_2_open" || meetingStatus === "completed") return;
    const timer = window.setInterval(() => {
      void fetch(`/api/public/egm-voting/${encodeURIComponent(token)}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json();
          if (response.ok) {
            setMeeting(payload.meeting);
            setAttendees(payload.attendees ?? []);
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [meetingStatus, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/public/egm-voting/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId, identityConfirmed, choice, website: "" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Your vote could not be recorded.");
      setConfirmation({ name: payload.representativeName, round: payload.roundNo });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your vote could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  const selectedAttendee = attendees.find((attendee) => attendee.id === attendeeId) ?? null;

  if (loading) return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><p className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm">Loading EGM ballot…</p></main>;

  return <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 p-6 text-white shadow-xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">Rack &amp; Frame · EGM ballot</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">{meeting?.title ?? "Premier Handicap EGM"}</h1>
        <p className="mt-3 text-slate-200">{meeting?.seasonLabel}{meeting?.meetingAt ? ` · ${new Date(meeting.meetingAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}` : ""}</p>
        <p className="mt-3 text-sm font-semibold text-cyan-100">One vote per represented Premier League team.</p>
      </header>

      {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-900">{error}</section> : null}

      {confirmation ? <section className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Vote recorded</p>
        <h2 className="mt-2 text-2xl font-black">Thank you, {confirmation.name}</h2>
        <p className="mt-3 leading-7 text-slate-700">Your ballot {confirmation.round} vote has been securely recorded. Another vote cannot be submitted under your name in this ballot.</p>
        <p className="mt-3 text-sm text-slate-600">Keep this page open during the meeting. If a second ballot is announced, refresh the page and select your name again.</p>
      </section> : meeting?.activeRound ? <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div><p className="text-sm font-bold uppercase tracking-wider text-teal-700">Ballot {meeting.activeRound} is open</p><h2 className="mt-2 text-2xl font-black">Cast your vote</h2><p className="mt-2 text-sm leading-6 text-slate-600">Select one proposal or abstain. Your choice is final for this ballot and will remain hidden until the ballot closes.</p></div>
        <div className="space-y-3">{meeting.proposals.map((proposal) => <label key={proposal.id} className={`block cursor-pointer rounded-2xl border p-4 ${choice === `proposal_${proposal.id}` ? "border-teal-700 bg-teal-50" : "border-slate-200"}`}><span className="flex gap-3"><input type="radio" name="choice" value={`proposal_${proposal.id}`} checked={choice === `proposal_${proposal.id}`} onChange={(event) => setChoice(event.target.value)} className="mt-1 h-5 w-5 shrink-0" /><span><strong>Proposal {proposal.id}: {proposal.title}</strong><span className="mt-1 block text-sm leading-6 text-slate-600">{proposal.summary}</span></span></span></label>)}
          <label className={`block cursor-pointer rounded-2xl border p-4 ${choice === "abstain" ? "border-slate-700 bg-slate-100" : "border-slate-200"}`}><span className="flex gap-3"><input type="radio" name="choice" value="abstain" checked={choice === "abstain"} onChange={(event) => setChoice(event.target.value)} className="mt-1 h-5 w-5 shrink-0" /><strong>Abstain</strong></span></label>
        </div>
        <div><label htmlFor="attendee" className="block font-bold">Your name</label><select id="attendee" value={attendeeId} onChange={(event) => { setAttendeeId(event.target.value); setIdentityConfirmed(false); }} required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"><option value="">Select your name from the attendance register</option>{attendees.map((attendee) => <option key={attendee.id} value={attendee.id}>{attendee.name} · {attendee.teamName}</option>)}</select></div>
        {selectedAttendee ? <label className="flex cursor-pointer gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold leading-6 text-slate-800"><input type="checkbox" checked={identityConfirmed} onChange={(event) => setIdentityConfirmed(event.target.checked)} required className="mt-1 h-5 w-5 shrink-0" /><span>I confirm that I am <strong>{selectedAttendee.name}</strong>, representing <strong>{selectedAttendee.teamName}</strong> at <strong>{selectedAttendee.clubName}</strong>, and I am personally submitting this vote during the live EGM.</span></label> : null}
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button type="submit" disabled={busy || !attendeeId || !identityConfirmed || !choice} className="w-full rounded-xl bg-teal-700 px-5 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Recording vote…" : `Submit ballot ${meeting.activeRound} vote`}</button>
      </form> : meeting ? <section className="rounded-2xl border border-amber-300 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">The ballot is not open</h2><p className="mt-2 leading-7 text-slate-700">{meeting.status === "completed" ? "The EGM has been completed and voting is closed." : "Please remain in the Microsoft Teams meeting. The League Secretary or Chairman will announce when voting opens, then refresh this page."}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Refresh ballot status</button></section> : null}

      <footer className="px-2 text-center text-xs leading-5 text-slate-500">Only the confirmed voting representative for each team should use this ballot. Rack &amp; Frame retains the representative, selection and submission time as part of the formal EGM record.</footer>
    </div>
  </main>;
}

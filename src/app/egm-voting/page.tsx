"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { useAppDialog } from "@/components/AppDialogProvider";
import { supabase } from "@/lib/supabase";

type Proposal = { id: number; title: string; summary: string };
type Team = { id: string; name: string; location_id: string; clubName: string };
type Attendee = { id: string; team_id: string; location_id: string; representative_name: string; teamName: string; clubName: string };
type Vote = { id: string; attendee_id: string; round_no: number; choice: string | null; submission_method: "attendee" | "officer"; recorded_at: string };
type Meeting = {
  id: string;
  public_token: string;
  title: string;
  season_label: string;
  meeting_at: string | null;
  status: string;
  runoff_proposals: number[];
  adopted_proposal: number | null;
  decision_note: string | null;
  completed_at: string | null;
};
type Payload = { meeting: Meeting; proposals: Proposal[]; teams: Team[]; attendees: Attendee[]; votes: Vote[]; attestationCount: number };

const statusLabels: Record<string, string> = {
  register_open: "Attendance register open",
  round_1_open: "First ballot open",
  round_1_closed: "First ballot closed",
  round_2_open: "Second ballot open",
  round_2_closed: "Second ballot closed",
  completed: "Meeting completed",
};

function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function EgmVotingPage() {
  const { showConfirm } = useAppDialog();
  const [data, setData] = useState<Payload | null>(null);
  const [teamId, setTeamId] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [runoff, setRunoff] = useState<number[]>([]);
  const [adoptedProposal, setAdoptedProposal] = useState(0);
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");

  const request = useCallback(async (body?: object) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    const response = await fetch("/api/league/egm-voting", {
      method: body ? "POST" : "GET",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "The EGM voting record could not be loaded.");
    return payload as Payload;
  }, []);

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await request();
      setData(payload);
      setMeetingAt(localDateTimeValue(payload.meeting.meeting_at));
      setRunoff(payload.meeting.runoff_proposals ?? []);
      setAdoptedProposal(payload.meeting.adopted_proposal ?? 0);
      setDecisionNote(payload.meeting.decision_note ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The EGM voting record could not be loaded.");
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const votesByAttendeeAndRound = useMemo(() => new Map((data?.votes ?? []).map((vote) => [`${vote.attendee_id}:${vote.round_no}`, vote.choice])), [data?.votes]);
  const voteRecordByAttendeeAndRound = useMemo(() => new Map((data?.votes ?? []).map((vote) => [`${vote.attendee_id}:${vote.round_no}`, vote])), [data?.votes]);
  const activeRound = data?.meeting.status === "round_1_open" ? 1 : data?.meeting.status === "round_2_open" ? 2 : null;

  useEffect(() => {
    if (!activeRound) return;
    const timer = window.setInterval(() => {
      void request().then((payload) => setData(payload)).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeRound, request]);

  function tally(roundNo: number) {
    const totals: Record<string, number> = { proposal_1: 0, proposal_2: 0, proposal_3: 0, abstain: 0 };
    (data?.votes ?? []).filter((vote) => vote.round_no === roundNo && vote.choice).forEach((vote) => { if (vote.choice) totals[vote.choice] = (totals[vote.choice] ?? 0) + 1; });
    return totals;
  }

  async function mutate(body: object, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await request(body);
      setData(payload);
      setMessage(success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The EGM record could not be updated.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addAttendee(event: FormEvent) {
    event.preventDefault();
    if (await mutate({ action: "add_attendee", teamId, representativeName }, "Voting representative added and available on the shared voting page.")) setRepresentativeName("");
  }

  async function removeAttendee(attendee: Attendee) {
    if (!await showConfirm({ title: "Remove voting representative?", description: `Remove ${attendee.representative_name} from the EGM attendance register?`, confirmLabel: "Remove representative", tone: "danger" })) return;
    await mutate({ action: "remove_attendee", attendeeId: attendee.id }, "Voting representative removed.");
  }

  function votingUrl() {
    if (!data || !origin) return "";
    return `${origin}/egm-vote/${data.meeting.public_token}`;
  }

  async function copyVotingLink() {
    await navigator.clipboard.writeText(votingUrl());
    setMessage("Shared attendee voting link copied.");
  }

  async function clearVote(attendee: Attendee, roundNo: number) {
    if (!await showConfirm({ title: "Clear submitted vote?", description: `Clear ${attendee.representative_name}'s ballot ${roundNo} submission so they can select their name and vote again? Their choice is not displayed while voting is open.`, confirmLabel: "Clear and allow another vote", tone: "danger" })) return;
    await mutate({ action: "clear_vote", attendeeId: attendee.id, roundNo }, `${attendee.representative_name} can now vote again in ballot ${roundNo}.`);
  }

  async function changeStatus(status: string, extra: object = {}) {
    const descriptions: Record<string, string> = {
      round_1_open: "Lock the attendance register and open the first ballot? Attendance cannot then be changed.",
      round_1_closed: "Close the first ballot after every representative has voted or abstained?",
      round_2_open: "Open a second ballot using the two selected proposals?",
      round_2_closed: "Close the second ballot after every representative has voted or abstained?",
      completed: "Record the selected proposal as the EGM decision and complete the meeting?",
    };
    if (!await showConfirm({ title: statusLabels[status] ?? "Update meeting", description: descriptions[status], confirmLabel: status === "completed" ? "Complete meeting" : "Continue", tone: status === "completed" ? "danger" : "default" })) return;
    await mutate({ action: "set_status", status, ...extra }, status === "completed" ? "The EGM decision has been recorded." : `${statusLabels[status]}.`);
  }

  function toggleRunoff(id: number) {
    setRunoff((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 2 ? [...current, id] : current);
  }

  async function copyMinutes() {
    if (!data) return;
    const lines = [
      data.meeting.title,
      data.meeting.meeting_at ? `Held by Microsoft Teams on ${new Date(data.meeting.meeting_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}.` : "Held by Microsoft Teams.",
      `${data.attendees.length} voting representative${data.attendees.length === 1 ? "" : "s"} attended, representing ${new Set(data.attendees.map((row) => row.location_id)).size} club${new Set(data.attendees.map((row) => row.location_id)).size === 1 ? "" : "s"}.`,
      "",
      ...[1, 2].flatMap((roundNo) => {
        const votes = data.votes.filter((vote) => vote.round_no === roundNo);
        if (!votes.length) return [];
        const totals = tally(roundNo);
        return [`Ballot ${roundNo}: ${data.proposals.map((proposal) => `${proposal.title} – ${totals[`proposal_${proposal.id}`]}`).join("; ")}; Abstentions – ${totals.abstain}.`];
      }),
      data.meeting.adopted_proposal ? `Decision: Proposal ${data.meeting.adopted_proposal} – ${data.proposals.find((proposal) => proposal.id === data.meeting.adopted_proposal)?.title} was adopted.` : "Decision not yet recorded.",
      data.meeting.decision_note ? `Decision note: ${data.meeting.decision_note}` : "",
    ].filter(Boolean);
    await navigator.clipboard.writeText(lines.join("\n"));
    setMessage("Minutes-ready voting summary copied.");
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <ScreenHeader title="Premier Handicap EGM" eyebrow="League governance" subtitle="Attendance, ballot rounds and the formal decision record for the Microsoft Teams meeting." />
          {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900">{error}</section> : null}
          {message ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">{message}</section> : null}
          {data ? <>
            <section className="rounded-2xl border border-teal-300 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wider text-teal-700">Shared attendee voting page</p><h2 className="mt-1 text-xl font-black">One link for everyone</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Post this link once in the Teams chat. Each representative selects their own name, confirms the displayed team and club, then votes. No individual messages or codes are needed.</p></div><button type="button" disabled={!origin} onClick={() => void copyVotingLink()} className="rounded-xl bg-teal-700 px-5 py-3 font-black text-white disabled:opacity-40">Copy voting link</button></div>
              <p className="mt-4 break-all rounded-xl bg-slate-100 p-3 font-mono text-xs text-slate-700">{votingUrl()}</p>
            </section>

            <section className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</p><p className="mt-2 font-black text-slate-950">{statusLabels[data.meeting.status]}</p></div>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Attestations</p><p className="mt-2 text-2xl font-black text-teal-800">{data.attestationCount}</p></div>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Teams represented</p><p className="mt-2 text-2xl font-black text-slate-950">{new Set(data.attendees.map((row) => row.team_id)).size} / 9</p><p className="text-xs text-slate-500">Current Premier League teams</p></div>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Voting entitlement</p><p className="mt-2 text-2xl font-black text-slate-950">{data.attendees.length}</p><p className="text-xs text-slate-500">Across {new Set(data.attendees.map((row) => row.location_id)).size} clubs; maximum two each</p></div>
            </section>

            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
              <h2 className="font-black">Voting basis</h2>
              <p className="mt-1">The nine teams identify who is represented. Under Rule 8, the vote belongs to attending club representatives: one attendee gives the club one vote, two attendees give two votes, and no club may cast more than two. The team-to-club link is checked automatically.</p>
            </section>

            {data.meeting.status === "register_open" ? <section className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
              <form onSubmit={addAttendee} className="rounded-2xl bg-white p-5 shadow-sm">
                <h2 className="text-xl font-black">1. Prepare the meeting</h2>
                <label className="mt-4 block text-sm font-bold">Microsoft Teams meeting date and time</label>
                <div className="mt-2 flex gap-2"><input type="datetime-local" value={meetingAt} onChange={(event) => setMeetingAt(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2" /><button type="button" disabled={busy} onClick={() => void mutate({ action: "set_meeting", meetingAt }, "Meeting date saved.")} className="rounded-xl border border-teal-600 px-4 py-2 font-bold text-teal-800">Save</button></div>
                <label className="mt-5 block text-sm font-bold">Team represented</label>
                <select value={teamId} onChange={(event) => setTeamId(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"><option value="">Select team</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.clubName}</option>)}</select>
                <label className="mt-4 block text-sm font-bold">Representative’s full name</label>
                <input value={representativeName} onChange={(event) => setRepresentativeName(event.target.value)} required placeholder="First name and surname" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" />
                <button disabled={busy} className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 font-black text-white disabled:opacity-50">Add voting representative</button>
              </form>
              <section className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Attendance register</h2><p className="text-sm text-slate-600">Check the names aloud before voting starts.</p></div><button type="button" disabled={busy || data.attendees.length === 0} onClick={() => void changeStatus("round_1_open")} className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white disabled:opacity-40">Lock register &amp; open ballot 1</button></div>
                <div className="mt-4 divide-y divide-slate-200">{data.attendees.map((attendee) => <div key={attendee.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold">{attendee.representative_name}</p><p className="text-sm text-slate-600">{attendee.teamName} · {attendee.clubName}</p></div><button type="button" onClick={() => void removeAttendee(attendee)} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-800">Remove</button></div>)}{data.attendees.length === 0 ? <p className="py-8 text-center text-slate-500">No representatives recorded yet.</p> : null}</div>
              </section>
            </section> : null}

            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">The three proposals</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">{data.proposals.map((proposal) => <article key={proposal.id} className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wider text-teal-700">Proposal {proposal.id}</p><h3 className="mt-1 font-black">{proposal.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{proposal.summary}</p></article>)}</div>
            </section>

            {[1, 2].map((roundNo) => {
              const hasRound = data.votes.some((vote) => vote.round_no === roundNo) || data.meeting.status.includes(`round_${roundNo}`) || (roundNo === 1 && data.meeting.status !== "register_open");
              if (!hasRound) return null;
              const open = activeRound === roundNo;
              const totals = tally(roundNo);
              const allowedProposals = roundNo === 2 ? data.meeting.runoff_proposals : [1, 2, 3];
              const recorded = data.votes.filter((vote) => vote.round_no === roundNo).length;
              return <section key={roundNo} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Ballot {roundNo}</h2><p className="text-sm text-slate-600">{recorded} of {data.attendees.length} votes or abstentions recorded.</p></div>{open ? <button type="button" disabled={busy || recorded !== data.attendees.length} onClick={() => void changeStatus(roundNo === 1 ? "round_1_closed" : "round_2_closed")} className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white disabled:opacity-40">Close ballot {roundNo}</button> : <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold">Closed</span>}</div>
                {open ? <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950"><strong>Choices are hidden while voting is open.</strong> Only the number of received votes is shown, so early results cannot influence remaining representatives.</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{allowedProposals.map((id) => <div key={id} className="rounded-xl bg-teal-50 p-4"><p className="text-sm font-bold">Proposal {id}</p><p className="text-3xl font-black text-teal-900">{totals[`proposal_${id}`]}</p></div>)}<div className="rounded-xl bg-slate-100 p-4"><p className="text-sm font-bold">Abstentions</p><p className="text-3xl font-black">{totals.abstain}</p></div></div>}
                <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-3">Representative</th><th className="p-3">Team / club</th><th className="p-3">Ballot status</th></tr></thead><tbody>{data.attendees.map((attendee) => {
                  const vote = voteRecordByAttendeeAndRound.get(`${attendee.id}:${roundNo}`);
                  return <tr key={attendee.id} className="border-t border-slate-200"><td className="p-3 font-bold">{attendee.representative_name}</td><td className="p-3">{attendee.teamName}<br /><span className="text-slate-500">{attendee.clubName}</span></td><td className="p-3">{open ? vote ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-emerald-700">Vote received {vote.submission_method === "attendee" ? "from attendee" : "by officer proxy"}</span><button type="button" onClick={() => void clearVote(attendee, roundNo)} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-800">Clear mistaken submission</button></div> : <div><p className="mb-2 text-xs text-slate-500">Awaiting attendee · officer proxy:</p><select defaultValue="" disabled={busy} onChange={(event) => void mutate({ action: "record_vote", attendeeId: attendee.id, roundNo, choice: event.target.value }, `Proxy vote recorded for ${attendee.representative_name}.`)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Select only if proxy agreed</option>{allowedProposals.map((id) => <option key={id} value={`proposal_${id}`}>Proposal {id} · {data.proposals.find((proposal) => proposal.id === id)?.title}</option>)}<option value="abstain">Abstain</option></select></div> : <span className="font-bold">{(() => { const choice = votesByAttendeeAndRound.get(`${attendee.id}:${roundNo}`); return choice === "abstain" ? "Abstained" : choice ? `Proposal ${choice.slice(-1)}` : "Not recorded"; })()}<span className="ml-2 text-xs font-normal text-slate-500">({vote?.submission_method === "attendee" ? "attendee submission" : "officer proxy"})</span></span>}</td></tr>;
                })}</tbody></table></div>
              </section>;
            })}

            {data.meeting.status === "round_1_closed" ? <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5"><h2 className="text-xl font-black">Decide the next step</h2><p className="mt-1 text-sm text-slate-700">If a proposal has the required majority, complete the meeting. Otherwise select the two proposals proceeding to ballot 2.</p><div className="mt-4 flex flex-wrap gap-2">{data.proposals.map((proposal) => <button key={proposal.id} type="button" onClick={() => toggleRunoff(proposal.id)} className={`rounded-xl border px-4 py-2 font-bold ${runoff.includes(proposal.id) ? "border-indigo-700 bg-indigo-700 text-white" : "border-indigo-300 bg-white text-indigo-950"}`}>Proposal {proposal.id}</button>)}</div><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy || runoff.length !== 2} onClick={() => void changeStatus("round_2_open", { runoffProposals: runoff })} className="rounded-xl bg-indigo-700 px-4 py-3 font-black text-white disabled:opacity-40">Open ballot 2</button><button type="button" onClick={() => { setAdoptedProposal(0); document.getElementById("decision-panel")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl border border-emerald-600 bg-white px-4 py-3 font-black text-emerald-800">Record a first-ballot decision</button></div></section> : null}

            {(data.meeting.status === "round_1_closed" || data.meeting.status === "round_2_closed") ? <section id="decision-panel" className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Complete the formal record</h2><label className="mt-4 block text-sm font-bold">Proposal adopted</label><select value={adoptedProposal} onChange={(event) => setAdoptedProposal(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"><option value={0}>Select adopted proposal</option>{data.proposals.map((proposal) => <option key={proposal.id} value={proposal.id}>Proposal {proposal.id} · {proposal.title}</option>)}</select><label className="mt-4 block text-sm font-bold">Decision note (optional)</label><textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} rows={3} placeholder="For example: adopted by majority on ballot 1, or Secretary exercised casting vote following a tie." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" /><button type="button" disabled={busy || !adoptedProposal} onClick={() => void changeStatus("completed", { adoptedProposal, decisionNote })} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-40">Complete meeting and record decision</button></section> : null}

            {data.meeting.status === "completed" ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6"><p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Formal decision recorded</p><h2 className="mt-2 text-2xl font-black">Proposal {data.meeting.adopted_proposal}: {data.proposals.find((proposal) => proposal.id === data.meeting.adopted_proposal)?.title}</h2>{data.meeting.decision_note ? <p className="mt-3 text-slate-700">{data.meeting.decision_note}</p> : null}<button type="button" onClick={() => void copyMinutes()} className="mt-5 rounded-xl bg-emerald-800 px-5 py-3 font-black text-white">Copy minutes-ready summary</button></section> : null}
          </> : null}
        </div>
      </main>
    </RequireAuth>
  );
}

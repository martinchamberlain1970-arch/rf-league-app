"use client";

import { useState } from "react";
import { competitionDeadlineLabel, competitionEntriesOpen } from "@/lib/fixed-competition-handicaps";
import { entryRoster, isLeagueCup, knockoutOpeningRound, knockoutRoundLabel, knockoutSize, shuffleDraw } from "@/lib/knockout-draw";
import { entrantsRequired } from "@/lib/public-competition-entry";

type Entry = { id: string; player_id: string; note?: string | null };
type RoundDeadline = { round_no: number; deadline_at: string };

export default function CompetitionDrawPreview({ competition, entries, entryLabel, pendingCount, deadlines, onPublish }: {
  competition: { name: string; match_mode?: string; signup_open?: boolean; signup_deadline?: string | null };
  entries: Entry[];
  entryLabel: (entry: Entry) => string;
  pendingCount: number;
  deadlines: RoundDeadline[];
  onPublish: (entryIds: string[]) => Promise<boolean>;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const size = knockoutSize(entries.length);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const valid = order.length > 0 && order.length === entries.length && order.every((id) => byId.has(id));
  const minimum = isLeagueCup(competition.name) ? 4 : 2;
  const rosters = entries.map(entryRoster);
  const incomplete = entries.filter((_, index) => rosters[index].length !== entrantsRequired(competition));
  const duplicated = new Set(rosters.flat()).size !== rosters.flat().length;
  const entriesOpen = competition.signup_open && competitionEntriesOpen(competition.signup_deadline);

  async function publish() {
    setPublishing(true);
    try {
      if (await onPublish(order)) setOrder([]);
    } finally {
      setPublishing(false);
      setConfirm(false);
    }
  }

  return (
    <section id="draw-preview" className="mt-4 scroll-mt-28 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Private draw preview</h3>
      <p className="mt-1 text-sm text-slate-700">
        {entries.length} approved · {pendingCount} awaiting approval
        {size.rounds ? ` · ${size.rounds} ${size.rounds === 1 ? "round" : "rounds"} · ${size.byes} ${size.byes === 1 ? "bye" : "byes"}` : ""}
      </p>
      {entries.length < minimum ? (
        <p className="mt-2 text-sm text-amber-800">{minimum === 4
          ? "Rule 30 requires the winner to play before the final. A standard knockout needs four entrants."
          : "Approve at least two entries to create a draw."}</p>
      ) : null}
      {incomplete.length ? <p className="mt-2 text-sm text-amber-800">Link every player record before publishing. Check {incomplete.map(entryLabel).join(", ")}.</p> : null}
      {duplicated ? <p className="mt-2 text-sm text-amber-800">A player appears in more than one slot. Resolve duplicate entries before publishing.</p> : null}
      <button type="button" disabled={!size.rounds || publishing}
        onClick={() => { setOrder(shuffleDraw(entries.map((entry) => entry.id))); setConfirm(false); }}
        className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {order.length ? "Shuffle preview again" : "Preview draw"}
      </button>
      {order.length && !valid ? <p className="mt-2 text-sm text-amber-800">Entries changed. Create a fresh preview.</p> : null}
      {valid ? (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Opening round · {knockoutRoundLabel(1, size.rounds)}</h4>
              <ol className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
                {knockoutOpeningRound(order).map(({ home, away }, index) => (
                  <li key={home} className="px-3 py-2 text-slate-800">
                    <span className="mr-2 text-slate-500">{index + 1}</span>
                    {entryLabel(byId.get(home)!)} {away ? `vs ${entryLabel(byId.get(away)!)}` : "· Bye"}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Round deadlines (UK time)</h4>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {Array.from({ length: size.rounds }, (_, index) => {
                  const deadline = deadlines.find((row) => row.round_no === index + 1);
                  return <li key={index}>{knockoutRoundLabel(index + 1, size.rounds)} · {deadline ? competitionDeadlineLabel(deadline.deadline_at) : "Date to be set"}</li>;
                })}
              </ul>
              <a href="/league?view=knockouts" className="mt-2 inline-block text-sm font-semibold text-teal-800 underline">Manage round deadlines</a>
            </div>
          </div>
          {entriesOpen || pendingCount ? <p className="mt-3 text-sm text-amber-800">
            {entriesOpen ? "Close entries before publishing. " : ""}
            {pendingCount ? "Review all pending entries before publishing." : ""}
          </p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button"
              disabled={publishing || Boolean(entriesOpen) || pendingCount > 0 || entries.length < minimum || incomplete.length > 0 || duplicated}
              onClick={() => confirm ? void publish() : setConfirm(true)}
              className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {publishing ? "Publishing…" : confirm ? "Confirm and publish draw" : "Publish draw"}
            </button>
            {confirm ? <button type="button" disabled={publishing} onClick={() => setConfirm(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Cancel</button> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { competitionDeadlineLabel, competitionEntriesOpen } from "@/lib/fixed-competition-handicaps";
import { entryRoster, isLeagueCup, knockoutRoundLabel, knockoutSize } from "@/lib/knockout-draw";
import { entrantsRequired } from "@/lib/public-competition-entry";

type Entry = { id: string; player_id: string; note?: string | null };
type RoundDeadline = { round_no: number; deadline_at: string };

export default function CompetitionOfficialDraw({ competition, entries, entryLabel, pendingCount, deadlines, onPublish }: {
  competition: { name: string; match_mode?: string; signup_open?: boolean; signup_deadline?: string | null };
  entries: Entry[];
  entryLabel: (entry: Entry) => string;
  pendingCount: number;
  deadlines: RoundDeadline[];
  onPublish: (entryIds: string[]) => Promise<boolean>;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const { rounds } = knockoutSize(entries.length);
  const ids = entries.map((entry) => entry.id);
  const snapshot = [...ids].sort().join(",");
  const confirming = confirmation === snapshot;
  const minimum = isLeagueCup(competition.name) ? 4 : 2;
  const rosters = entries.map(entryRoster);
  const incomplete = entries.filter((_, index) => rosters[index].length !== entrantsRequired(competition));
  const duplicated = new Set(rosters.flat()).size !== rosters.flat().length;
  const entriesOpen = competition.signup_open && competitionEntriesOpen(competition.signup_deadline);
  const blocked = entriesOpen || pendingCount > 0 || entries.length < minimum || incomplete.length > 0 || duplicated;

  async function publish() {
    setPublishing(true);
    try {
      await onPublish(ids);
    } finally {
      setPublishing(false);
      setConfirmation(null);
    }
  }

  return (
    <section id="official-draw" className="mt-4 scroll-mt-28 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Official draw</h3>
      <p className="mt-1 text-sm text-slate-700">{entries.length} approved · {pendingCount} awaiting approval</p>
      {entriesOpen ? <p className="mt-2 text-sm text-amber-800">Close entries before running the draw.</p> : null}
      {pendingCount > 0 ? <p className="mt-2 text-sm text-amber-800">Review all pending entries before running the draw.</p> : null}
      {entries.length < minimum ? (
        <p className="mt-2 text-sm text-amber-800">{minimum === 4
          ? "Rule 30 requires the winner to play before the final. A standard knockout needs four entrants."
          : "Approve at least two entries to run the draw."}</p>
      ) : null}
      {incomplete.length ? <p className="mt-2 text-sm text-amber-800">Link every player record before running the draw. Check {incomplete.map(entryLabel).join(", ")}.</p> : null}
      {duplicated ? <p className="mt-2 text-sm text-amber-800">A player appears in more than one slot. Resolve duplicate entries before running the draw.</p> : null}
      {rounds > 0 && !entriesOpen ? (
        <details className="mt-3 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium">Round deadlines (UK time)</summary>
          <ul className="mt-2 space-y-1">
            {Array.from({ length: rounds }, (_, index) => {
              const deadline = deadlines.find((row) => row.round_no === index + 1);
              return <li key={index}>{knockoutRoundLabel(index + 1, rounds)} · {deadline ? competitionDeadlineLabel(deadline.deadline_at) : "Date to be set"}</li>;
            })}
          </ul>
          <Link href="/league?view=knockouts" className="mt-2 inline-block font-semibold text-teal-800 underline">Manage round deadlines</Link>
        </details>
      ) : null}
      {confirming ? (
        <p role="status" className="mt-3 text-sm text-slate-800">
          Confirming will generate the pairings and publish the opening fixtures for this competition.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={publishing || Boolean(blocked)}
          onClick={() => confirming ? void publish() : setConfirmation(snapshot)}
          className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {publishing ? "Running draw…" : confirming ? "Confirm and publish draw" : "Run official draw"}
        </button>
        {confirming ? <button type="button" disabled={publishing} onClick={() => setConfirmation(null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Cancel</button> : null}
      </div>
    </section>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { competitionAgeRule, entrantsRequired } from "@/lib/public-competition-entry";

type PlayerOption = { id: string; display_name: string; full_name: string | null };

export default function CompetitionOfficerEntry({ competition, players, usedPlayerIds, onAdd }: {
  competition: { name: string; match_mode?: string };
  players: PlayerOption[];
  usedPlayerIds: ReadonlySet<string>;
  onAdd: (playerIds: string[], dateOfBirth: string) => Promise<boolean>;
}) {
  const size = entrantsRequired(competition);
  const age = competitionAgeRule(competition.name);
  const [selected, setSelected] = useState<string[]>([]);
  const [dob, setDob] = useState("");
  const [saving, setSaving] = useState(false);
  const ids = Array.from({ length: size }, (_, index) => selected[index] ?? "");
  const options = [...players].sort((a, b) => (a.full_name || a.display_name).localeCompare(b.full_name || b.display_name));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (await onAdd(ids, dob)) {
        setSelected([]);
        setDob("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="manual-entry" onSubmit={submit} className="mt-4 scroll-mt-28 rounded-xl border border-teal-200 bg-teal-50 p-4">
      <h3 className="font-semibold text-slate-900">Add offline entry</h3>
      <p className="mt-1 text-sm text-slate-700">
        Select the {size === 1 ? "player" : "players"} to save an approved entry.
        {size > 1 ? " For league cups, choose players registered at the same club." : ""}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {ids.map((id, index) => (
          <label key={index} className="grid gap-1 text-sm font-medium text-slate-800">
            {size === 1 ? "Player" : `Player ${index + 1}`}
            <select required value={id} disabled={saving} onChange={(event) => {
              const next = [...ids];
              next[index] = event.target.value;
              setSelected(next);
              if (index === 0) setDob("");
            }} className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="">Select player</option>
              {options.filter((player) => player.id === id || (!usedPlayerIds.has(player.id) && !ids.includes(player.id))).map((player) => (
                <option key={player.id} value={player.id}>{player.full_name?.trim() || player.display_name}</option>
              ))}
            </select>
          </label>
        ))}
        {age.minimum !== null || age.maximum !== null ? (
          <label className="grid gap-1 text-sm font-medium text-slate-800">
            Date of birth (if missing from player record)
            <input type="date" value={dob} disabled={saving} onChange={(event) => setDob(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
        ) : null}
        <button type="submit" disabled={saving || ids.some((id) => !id || usedPlayerIds.has(id))}
          className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Adding…" : "Add approved entry"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CompetitionEntryWithdrawal({
  entryId, label, withdrawn, disabled, onDone, mayAwardWalkover = true,
}: {
  entryId: string;
  label: string;
  withdrawn: boolean;
  disabled?: boolean;
  onDone: (message: string) => void;
  mayAwardWalkover?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const withdraw = async (awardWalkover: boolean) => {
    const client = supabase;
    if (!client) return;
    setSaving(true);
    setError("");
    try {
      const result = await client.rpc("withdraw_knockout_entry", { p_entry_id: entryId, p_award_walkover: awardWalkover });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      onDone(result.data === "walkover"
        ? "Withdrawal recorded. The opponent advances by walkover."
        : result.data === "tie_pending"
          ? "Withdrawal recorded. The open tie needs an officer decision."
          : "Withdrawal recorded.");
    } catch {
      setError("The withdrawal could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (withdrawn && !mayAwardWalkover) return null;
  return (
    <div className="text-sm">
      <button type="button" disabled={disabled || saving} onClick={() => setOpen(!open)} aria-expanded={open}
        className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800 disabled:opacity-60">
        {withdrawn ? "Resolve withdrawn tie" : "Withdraw entry"}
      </button>
      {open ? (
        <div className="mt-2 max-w-md rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="font-semibold">{withdrawn ? "Resolve a walkover" : "Confirm withdrawal"}</p>
          <p className="mt-1">{label}</p>
          <p className="mt-1 text-xs text-slate-700">
            {mayAwardWalkover
              ? "Award a walkover only if the opponent is confirmed and the tie has not started."
              : "This withdraws this entry from the competition. For doubles or triples, it applies to the whole pair or team."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!withdrawn ? (
              <button type="button" disabled={disabled || saving} onClick={() => void withdraw(false)}
                className="rounded-lg bg-rose-800 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Confirm withdrawal</button>
            ) : null}
            {mayAwardWalkover ? (
              <button type="button" disabled={disabled || saving} onClick={() => void withdraw(true)}
                className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-900 disabled:opacity-60">
                {withdrawn ? "Award opponent a walkover" : "Withdraw and award walkover"}
              </button>
            ) : null}
            <button type="button" disabled={saving} onClick={() => { setOpen(false); setError(""); }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold">Cancel</button>
          </div>
          {error ? <p role="alert" className="mt-2 text-rose-900">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

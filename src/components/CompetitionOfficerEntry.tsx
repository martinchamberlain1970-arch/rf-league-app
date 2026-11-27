"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { competitionAgeRule, entrantsRequired } from "@/lib/public-competition-entry";

import CompetitionPlayerPicker from "@/components/CompetitionPlayerPicker";
import { loadCompetitionClubs, playersShareCompetitionClub, type CompetitionClubs } from "@/lib/competition-clubs";
import { isLeagueCup } from "@/lib/knockout-draw";
import { supabase } from "@/lib/supabase";

type PlayerOption = { id: string; display_name: string; full_name: string | null; location_id?: string | null };

export default function CompetitionOfficerEntry({ competition, players, locations, usedPlayerIds, onAdd }: {
  competition: { name: string; match_mode?: string };
  players: PlayerOption[];
  locations: { id: string; name: string }[];
  usedPlayerIds: ReadonlySet<string>;
  onAdd: (playerIds: string[], dateOfBirth: string) => Promise<boolean>;
}) {
  const size = entrantsRequired(competition);
  const age = competitionAgeRule(competition.name);
  const [selected, setSelected] = useState<string[]>([]);
  const [dob, setDob] = useState("");
  const [saving, setSaving] = useState(false);
  const ids = Array.from({ length: size }, (_, index) => selected[index] ?? "");
  const sameClubRequired = size > 1 && isLeagueCup(competition.name);
  const [clubs, setClubs] = useState<CompetitionClubs>(new Map());
  const [clubState, setClubState] = useState<"loading" | "ready" | "error">("loading");
  const [clubRetry, setClubRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const getClubs = async () => {
      try {
        if (!supabase) throw new Error("Competition clubs unavailable.");
        const clubs = await loadCompetitionClubs(supabase);
        if (!active) return;
        setClubs(clubs);
        setClubState("ready");
      } catch {
        if (active) setClubState("error");
      }
    };
    void getClubs();
    return () => { active = false; };
  }, [clubRetry]);

  const options = useMemo(() => {
    const venueNames = new Map(locations.map(({ id, name }) => [id, name]));
    return players.map((player) => {
      const registered = clubs.get(player.id) ?? [];
      const club = registered.map(({ locationId, teamName }) => venueNames.get(locationId ?? "") ?? teamName).join(" / ");
      return { id: player.id, name: player.full_name?.trim() || player.display_name, club: club || venueNames.get(player.location_id ?? "") || "" };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [players, locations, clubs]);

  function pickPlayer(index: number, playerId: string) {
    const next = [...ids];
    next[index] = playerId;
    if (index === 0) {
      setDob("");
      if (sameClubRequired && playerId !== ids[0]) next.fill("", 1);
    }
    setSelected(next);
  }

  function pickerOptions(index: number) {
    const others = ids.filter((id, slot) => id && slot !== index);
    return options.filter(({ id }) => {
      if (ids[index] === id) return true;
      if (usedPlayerIds.has(id) || others.includes(id)) return false;
      return !sameClubRequired || (index === 0
        ? Boolean(clubs.get(id)?.length)
        : playersShareCompetitionClub(clubs, [...others, id]));
    });
  }

  const selectionReady = ids.every((id) => id && !usedPlayerIds.has(id))
    && new Set(ids).size === ids.length
    && (!sameClubRequired || playersShareCompetitionClub(clubs, ids));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectionReady || saving) return;
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
        {sameClubRequired ? " Partner choices follow Player 1’s club registration." : ""}
      </p>
      {clubState === "error" && sameClubRequired ? (
        <p role="status" className="mt-2 text-sm text-amber-900">
          Club registrations could not be loaded.{" "}
          <button type="button" className="font-semibold underline" onClick={() => {
            setClubState("loading");
            setClubRetry((revision) => revision + 1);
          }}>Retry</button>
        </p>
      ) : null}
      <div className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ids.map((id, index) => (
          <CompetitionPlayerPicker key={index}
            label={size === 1 ? "Player" : `Player ${index + 1}`}
            value={id} options={pickerOptions(index)}
            disabled={saving || (sameClubRequired && (clubState !== "ready" || (index > 0 && !ids[0])))}
            placeholder={sameClubRequired && clubState === "loading" ? "Loading clubs…" : sameClubRequired && index > 0 && !ids[0] ? "Select Player 1 first" : "Search name or club"}
            onSelect={(playerId) => pickPlayer(index, playerId)}
          />
        ))}
        {age.minimum !== null || age.maximum !== null ? (
          <label className="grid gap-1 text-sm font-medium text-slate-800">
            Date of birth (if missing from player record)
            <input type="date" value={dob} disabled={saving} onChange={(event) => setDob(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
        ) : null}
        <button type="submit" disabled={saving || !selectionReady}
          className="justify-self-start rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Adding…" : "Add approved entry"}
        </button>
      </div>
    </form>
  );
}

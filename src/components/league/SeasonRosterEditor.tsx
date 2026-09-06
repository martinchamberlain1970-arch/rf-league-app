"use client";

type RosterPlayer = { id: string; display_name: string; full_name: string | null; claimed_by?: string | null };
type RosterTeam = { id: string; name: string };
type RosterMember = { id: string; season_id: string; team_id: string; player_id: string; is_captain: boolean; is_vice_captain: boolean; player: RosterPlayer | null };
type RegistrationState = { hasCaptainAssigned: boolean; hasViceAssigned: boolean; captainRegistered: boolean; viceRegistered: boolean };

type Props = {
  seasonId: string;
  teams: RosterTeam[];
  teamsMissingRegistration: RosterTeam[];
  registrationByTeam: Map<string, RegistrationState>;
  selectedTeamId: string;
  selectedPlayerId: string;
  selectedTeam: RosterTeam | null;
  selectedVenueName: string;
  availablePlayers: RosterPlayer[];
  selectedBulkPlayerIds: string[];
  members: RosterMember[];
  captainEmail: string;
  captainPhone: string;
  viceCaptainEmail: string;
  viceCaptainPhone: string;
  onTeamChange: (teamId: string) => void;
  onPlayerChange: (playerId: string) => void;
  onBulkSelectionChange: (playerIds: string[]) => void;
  onAddPlayer: () => void;
  onAddBulkPlayers: () => void;
  onSaveContacts: () => void;
  onCaptainEmailChange: (value: string) => void;
  onCaptainPhoneChange: (value: string) => void;
  onViceCaptainEmailChange: (value: string) => void;
  onViceCaptainPhoneChange: (value: string) => void;
  onRoleChange: (member: RosterMember, role: "captain" | "vice", checked: boolean) => void;
  onRemoveMember: (memberId: string) => void;
};

const nameOf = (player: RosterPlayer | null) => player?.full_name?.trim() || player?.display_name || "Unknown player";

export default function SeasonRosterEditor({ seasonId, teams, teamsMissingRegistration, registrationByTeam, selectedTeamId, selectedPlayerId, selectedTeam, selectedVenueName, availablePlayers, selectedBulkPlayerIds, members, captainEmail, captainPhone, viceCaptainEmail, viceCaptainPhone, onTeamChange, onPlayerChange, onBulkSelectionChange, onAddPlayer, onAddBulkPlayers, onSaveContacts, onCaptainEmailChange, onCaptainPhoneChange, onViceCaptainEmailChange, onViceCaptainPhoneChange, onRoleChange, onRemoveMember }: Props) {
  return <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">Season roster editor</p><p className="mt-1 text-xs text-slate-600">Edit the live roster for the selected league season directly. This is separate from the reusable registered-team template.</p></div><span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">One team per player in this season</span></div>
    {!seasonId ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">Select a league season in <strong>League Setup</strong> first, then return here to manage the live season roster.</div> : <>
      {teamsMissingRegistration.length > 0 ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Captain / vice-captain app registration check</p><p className="mt-1 text-xs text-amber-800">These teams have a captain or vice-captain assigned in the roster, but at least one of those role holders has not yet registered and linked to the app.</p><ul className="mt-2 space-y-1 text-sm text-amber-900">{teamsMissingRegistration.map((team) => {
        const state = registrationByTeam.get(team.id);
        const issues = [state?.hasCaptainAssigned && !state.captainRegistered ? "captain not registered" : null, state?.hasViceAssigned && !state.viceRegistered ? "vice-captain not registered" : null].filter(Boolean);
        return <li key={`role-registration-${team.id}`} className="rounded-lg border border-amber-200 bg-white px-3 py-2"><strong>{team.name}</strong>: {issues.join(" and ")}</li>;
      })}</ul></div> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]"><select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={selectedTeamId} onChange={(event) => onTeamChange(event.target.value)}><option value="">Select league team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={selectedPlayerId} onChange={(event) => onPlayerChange(event.target.value)} disabled={!selectedTeam}><option value="">{selectedTeam ? "Select player to add to this season roster" : "Select league team first"}</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{nameOf(player)}</option>)}</select><button type="button" onClick={onAddPlayer} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white" disabled={!selectedTeam || !selectedPlayerId}>Add to season roster</button></div>
      {selectedTeam ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">Bulk add existing players</p><p className="mt-1 text-xs text-slate-600">Choose existing players from the same venue and add them to this season team in one action.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700" onClick={() => onBulkSelectionChange(availablePlayers.map((player) => player.id))} disabled={!availablePlayers.length}>Select all available</button><button type="button" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700" onClick={() => onBulkSelectionChange([])} disabled={!selectedBulkPlayerIds.length}>Clear</button></div></div><div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">{availablePlayers.map((player) => <label key={`season-roster-bulk-${player.id}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"><input type="checkbox" checked={selectedBulkPlayerIds.includes(player.id)} onChange={(event) => onBulkSelectionChange(event.target.checked ? Array.from(new Set([...selectedBulkPlayerIds, player.id])) : selectedBulkPlayerIds.filter((id) => id !== player.id))} /><span>{nameOf(player)}</span></label>)}{!availablePlayers.length ? <p className="text-sm text-slate-500">No eligible existing players are currently available for this season team.</p> : null}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-600">{selectedBulkPlayerIds.length} player(s) selected.</p><button type="button" onClick={onAddBulkPlayers} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700" disabled={!selectedBulkPlayerIds.length}>Add selected existing players</button></div></div> : null}
      {selectedTeam ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">Captain contact details</p><p className="mt-1 text-xs text-slate-600">Store the season-specific captain and vice-captain contact details for this team.</p></div><button type="button" onClick={onSaveContacts} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">Save contacts</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Captain</p><input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Captain email" value={captainEmail} onChange={(event) => onCaptainEmailChange(event.target.value)} /><input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Captain phone" value={captainPhone} onChange={(event) => onCaptainPhoneChange(event.target.value)} /></div><div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vice-captain</p><input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Vice-captain email" value={viceCaptainEmail} onChange={(event) => onViceCaptainEmailChange(event.target.value)} /><input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Vice-captain phone" value={viceCaptainPhone} onChange={(event) => onViceCaptainPhoneChange(event.target.value)} /></div></div></div> : null}
      {selectedTeam ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">{selectedTeam.name}</p><p className="mt-1 text-xs text-slate-600">Changes here affect this selected league season only.{selectedVenueName ? ` Venue: ${selectedVenueName}.` : ""}</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{members.length} player(s)</span></div>{(() => {
        const state = registrationByTeam.get(selectedTeam.id);
        const issues = [state?.hasCaptainAssigned && !state.captainRegistered ? "captain not registered in app" : null, state?.hasViceAssigned && !state.viceRegistered ? "vice-captain not registered in app" : null].filter(Boolean);
        return issues.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Registration warning:</strong> {issues.join(" and ")}.</div> : null;
      })()}<ul className="mt-3 space-y-2 text-sm text-slate-700">{members.map((member) => <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><div><span className="font-medium text-slate-900">{nameOf(member.player)}</span>{member.is_captain ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Captain</span> : null}{member.is_vice_captain ? <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">Vice-captain</span> : null}{member.is_captain || member.is_vice_captain ? <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${member.player?.claimed_by ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{member.player?.claimed_by ? "App registered" : "Not yet registered"}</span> : null}</div><div className="flex flex-wrap items-center gap-2 text-xs"><label className="inline-flex items-center gap-1"><input type="checkbox" checked={member.is_captain} onChange={(event) => onRoleChange(member, "captain", event.target.checked)} />Captain</label><label className="inline-flex items-center gap-1"><input type="checkbox" checked={member.is_vice_captain} onChange={(event) => onRoleChange(member, "vice", event.target.checked)} />Vice-captain</label><button type="button" className="rounded border border-rose-300 bg-white px-2 py-1 text-xs text-rose-700" onClick={() => onRemoveMember(member.id)}>Remove</button></div></li>)}{!members.length ? <li className="text-slate-500">No players assigned to this season team yet.</li> : null}</ul></div> : <p className="mt-3 text-sm text-slate-600">Select a league team above to edit its live season roster.</p>}
    </>}
  </div>;
}

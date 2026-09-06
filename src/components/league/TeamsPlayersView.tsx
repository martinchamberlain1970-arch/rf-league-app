"use client";

import Link from "next/link";

type SeasonOption = {
  id: string;
  name: string;
  is_active: boolean;
  is_published?: boolean | null;
  handicap_enabled?: boolean | null;
};

type DirectoryPlayer = {
  id: string;
  display_name: string;
  full_name: string | null;
  claimed_by?: string | null;
  rating_snooker?: number | null;
  snooker_handicap?: number | null;
};

type DirectoryRow = {
  team: { id: string; name: string };
  venue: string;
  roster: Array<{ id: string; is_captain: boolean; is_vice_captain: boolean; player: DirectoryPlayer }>;
  registrationStatus: string;
  directoryStatus: string;
};

type PlayerProfileRow = { id: string; name: string; venue: string; currentHandicap: number; rating: number };
type Venue = { id: string; name: string };
export type TeamDirectoryStatus = "all" | "approved" | "submitted" | "incomplete";

type Props = {
  seasonId: string;
  seasons: SeasonOption[];
  currentSeason: SeasonOption | null;
  rows: DirectoryRow[];
  search: string;
  statusFilter: TeamDirectoryStatus;
  venueFilterId: string;
  venues: Venue[];
  playerProfiles: PlayerProfileRow[];
  formatSeasonLabel: (season: SeasonOption) => string;
  formatVenueLabel: (name: string) => string;
  onSeasonChange: (seasonId: string) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (status: TeamDirectoryStatus) => void;
  onVenueFilterChange: (venueId: string) => void;
};

const playerName = (player: DirectoryPlayer) => player.full_name?.trim() || player.display_name;

export default function TeamsPlayersView({
  seasonId,
  seasons,
  currentSeason,
  rows,
  search,
  statusFilter,
  venueFilterId,
  venues,
  playerProfiles,
  formatSeasonLabel,
  formatVenueLabel,
  onSeasonChange,
  onSearchChange,
  onStatusFilterChange,
  onVenueFilterChange,
}: Props) {
  return (
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
      <h2 className="text-xl font-black text-sky-950">Teams &amp; Players</h2>
      <p className="mt-1 text-sm text-slate-600">The quickest place to check the selected league&apos;s teams, registered players, roles and current playing handicaps.</p>

      <div className="mt-4 grid gap-3 rounded-xl border border-sky-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,220px)_auto]">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">League season
          <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" value={seasonId} onChange={(event) => onSeasonChange(event.target.value)}>
            {seasons.map((season) => <option key={`directory-season-${season.id}`} value={season.id}>{formatSeasonLabel(season)}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Find a team or player
          <input className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Type a team, club or player name" />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Registration status
          <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as TeamDirectoryStatus)}>
            <option value="all">All teams</option><option value="approved">Roster confirmed</option><option value="submitted">Awaiting approval</option><option value="incomplete">Not confirmed</option>
          </select>
        </label>
        <div className="flex items-end"><div className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-950 lg:min-w-36"><span className="font-black">{rows.length}</span> team{rows.length === 1 ? "" : "s"} shown</div></div>
      </div>

      {currentSeason ? <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${currentSeason.handicap_enabled ? "border-teal-200 bg-teal-50 text-teal-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><strong>{currentSeason.handicap_enabled ? "Handicap league:" : "Scratch league:"}</strong>{" "}{currentSeason.handicap_enabled ? "the Playing handicap column shows each player's current live handicap." : "every player starts league frames at 0. Their recorded handicap is still shown for historical tracking."}</div> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {rows.map(({ team, venue, roster, registrationStatus, directoryStatus }) => {
          const statusLabel = directoryStatus === "approved" ? "Roster confirmed" : directoryStatus === "submitted" ? "Awaiting approval" : registrationStatus === "rejected" ? "Changes required" : "Not confirmed";
          const statusClass = directoryStatus === "approved" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : directoryStatus === "submitted" ? "border-amber-300 bg-amber-100 text-amber-950" : registrationStatus === "rejected" ? "border-rose-300 bg-rose-100 text-rose-900" : "border-slate-300 bg-slate-100 text-slate-800";
          return <details key={`team-directory-${team.id}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-950 to-sky-950 px-4 py-3 text-white"><div><h3 className="text-lg font-black">{team.name}</h3><p className="mt-0.5 text-xs text-sky-100">{venue}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}>{statusLabel}</span>{directoryStatus === "approved" ? <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold">{roster.length} player{roster.length === 1 ? "" : "s"}</span> : null}<span className="text-xs font-bold text-sky-100 group-open:hidden">Open roster ▾</span><span className="hidden text-xs font-bold text-sky-100 group-open:inline">Close roster ▴</span></div></summary>
            {directoryStatus === "approved" && roster.length > 0 ? <div className="overflow-x-auto"><table className="min-w-full border-collapse text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2">Player</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Playing handicap</th><th className="px-3 py-2 text-right">Elo</th></tr></thead><tbody>{roster.map((member) => {
              const recordedHandicap = Number(member.player.snooker_handicap ?? 0);
              const handicapLabel = recordedHandicap > 0 ? `+${recordedHandicap}` : String(recordedHandicap);
              return <tr key={`team-directory-member-${member.id}`} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-3"><Link href={`/players/${member.player.id}`} className="font-semibold text-slate-950 underline decoration-slate-300 underline-offset-2 hover:text-sky-800">{playerName(member.player)}</Link>{member.player.claimed_by ? <span className="mt-1 block text-[11px] text-emerald-700">App account linked</span> : null}</td><td className="px-3 py-3 text-slate-700">{member.is_captain ? <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-800">Captain</span> : member.is_vice_captain ? <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">Vice-captain</span> : <span className="text-xs">Player</span>}</td><td className="px-3 py-3"><span className="font-black text-slate-950">{currentSeason?.handicap_enabled ? handicapLabel : "0 (scratch)"}</span>{!currentSeason?.handicap_enabled ? <span className="mt-1 block text-[11px] text-slate-500">Recorded: {handicapLabel}</span> : null}</td><td className="px-3 py-3 text-right font-semibold text-slate-700">{Math.round(Number(member.player.rating_snooker ?? 1000))}</td></tr>;
            })}</tbody></table></div> : directoryStatus === "approved" ? <p className="px-4 py-5 text-sm text-amber-800">This registration is approved, but no players are currently attached to the season roster.</p> : directoryStatus === "submitted" ? <div className="px-4 py-5 text-sm text-amber-900"><p>The new-season roster has been submitted but is not shown here until a league officer approves and imports it.</p><Link href={`/entry-packs?seasonId=${seasonId}&teamId=${team.id}`} className="mt-3 inline-flex rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">Review submitted roster</Link></div> : <p className="px-4 py-5 text-sm text-slate-700">This team&apos;s roster has not yet been confirmed for the selected season. Previous-season or reusable template assignments are deliberately not presented as current.</p>}
          </details>;
        })}
        {!rows.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 xl:col-span-2">No team or player matches this search in the selected league.</div> : null}
      </div>

      <details className="mt-5 rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer font-semibold text-slate-900">Browse every player profile by club</summary><p className="mt-1 text-xs text-slate-600">This includes club players who may not yet be assigned to the selected season.</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={venueFilterId} onChange={(event) => onVenueFilterChange(event.target.value)}><option value="">All venues</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{formatVenueLabel(venue.name)}</option>)}</select><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Profiles shown: <span className="font-semibold text-slate-900">{playerProfiles.length}</span></div></div><ul className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">{playerProfiles.map((player) => <li key={`profile-row-${player.id}`} className="grid items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 sm:grid-cols-[1fr_auto]"><div><Link href={`/players/${player.id}`} className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700">{player.name}</Link><p className="mt-1 text-xs text-slate-600">{player.venue}</p></div><div className="flex flex-wrap items-center gap-2 justify-self-start sm:justify-self-end"><span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">Elo {player.rating}</span><span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">Current {player.currentHandicap > 0 ? `+${player.currentHandicap}` : player.currentHandicap}</span></div></li>)}{!playerProfiles.length ? <li className="px-2 py-1 text-sm text-slate-500">No players found for this venue.</li> : null}</ul></details>
    </section>
  );
}

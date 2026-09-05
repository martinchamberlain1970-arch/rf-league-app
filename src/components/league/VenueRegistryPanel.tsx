"use client";

type Venue = { id: string; name: string; snooker_table_count?: number | null };
type VenueCapacity = { teamCount: number; maxTeams: number; remainingSlots: number };

type Props = {
  seasonId: string;
  venues: Venue[];
  selectedVenueId: string;
  expanded: boolean;
  newVenueName: string;
  venueName: string;
  address: string;
  postcode: string;
  phone: string;
  email: string;
  tableCount: string;
  capacityByVenueId: Map<string, VenueCapacity>;
  formatVenueLabel: (name: string) => string;
  onNewVenueNameChange: (value: string) => void;
  onVenueNameChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onPostcodeChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onTableCountChange: (value: string) => void;
  onCreateVenue: () => void;
  onSaveVenue: () => void;
  onToggleExpanded: () => void;
  onSelectVenue: (venueId: string) => void;
};

export default function VenueRegistryPanel({
  seasonId,
  venues,
  selectedVenueId,
  expanded,
  newVenueName,
  venueName,
  address,
  postcode,
  phone,
  email,
  tableCount,
  capacityByVenueId,
  formatVenueLabel,
  onNewVenueNameChange,
  onVenueNameChange,
  onAddressChange,
  onPostcodeChange,
  onPhoneChange,
  onEmailChange,
  onTableCountChange,
  onCreateVenue,
  onSaveVenue,
  onToggleExpanded,
  onSelectVenue,
}: Props) {
  return <>
    <div className="mt-3 grid gap-2 sm:grid-cols-4">
      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 sm:col-span-3" placeholder="New venue name" value={newVenueName} onChange={(event) => onNewVenueNameChange(event.target.value)} />
      <button type="button" onClick={onCreateVenue} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Register venue</button>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-6">
      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="Venue name" value={venueName} onChange={(event) => onVenueNameChange(event.target.value)} />
      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="Address" value={address} onChange={(event) => onAddressChange(event.target.value)} />
      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="Postcode" value={postcode} onChange={(event) => onPostcodeChange(event.target.value)} />
      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="Contact phone" value={phone} onChange={(event) => onPhoneChange(event.target.value)} />
      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="Contact email" value={email} onChange={(event) => onEmailChange(event.target.value)} />
      <input className="rounded-xl border border-slate-300 bg-white px-3 py-2" type="number" min={1} max={12} placeholder="Snooker tables" value={tableCount} onChange={(event) => onTableCountChange(event.target.value)} />
    </div>
    <p className="mt-2 text-xs text-slate-600">Fixture generation respects snooker table count. One table allows one home fixture at a time, so a one-table venue will normally support up to two league teams.</p>
    {!selectedVenueId ? <p className="mt-2 text-xs text-slate-600">Click a venue in “All Registered Venues” to edit details.</p> : null}
    <div className="mt-2"><button type="button" onClick={onSaveVenue} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">Save venue details</button></div>
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900">All Registered Venues ({venues.length})</p><button type="button" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700" onClick={onToggleExpanded}>{expanded ? "Collapse" : "Expand"}</button></div>
      {expanded ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{venues.slice().sort((left, right) => left.name.localeCompare(right.name)).map((venue) => {
        const capacity = capacityByVenueId.get(venue.id) ?? null;
        const atCapacity = capacity?.remainingSlots === 0;
        const tables = Math.max(1, Number(venue.snooker_table_count ?? 1));
        const selected = selectedVenueId === venue.id;
        return <button type="button" key={`venue-list-${venue.id}`} onClick={() => onSelectVenue(venue.id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"}`}><div className="font-medium">{formatVenueLabel(venue.name)}</div><div className={`mt-1 text-xs ${selected ? "text-cyan-100" : "text-slate-500"}`}>{tables} snooker table{tables === 1 ? "" : "s"}</div>{seasonId && capacity ? <div className={`mt-1 text-xs ${selected ? "text-cyan-100" : atCapacity ? "text-rose-600" : "text-amber-700"}`}>{capacity.teamCount} team{capacity.teamCount === 1 ? "" : "s"} in selected league · max {capacity.maxTeams}{atCapacity ? " · full" : ` · ${capacity.remainingSlots} slot${capacity.remainingSlots === 1 ? "" : "s"} left`}</div> : null}</button>;
      })}{!venues.length ? <p className="text-sm text-slate-600">No venues registered yet.</p> : null}</div> : null}
    </div>
  </>;
}

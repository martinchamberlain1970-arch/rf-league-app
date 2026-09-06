"use client";

export type LeagueWorkspaceView =
  | "guide"
  | "teamManagement"
  | "venues"
  | "profiles"
  | "setup"
  | "knockouts"
  | "fixtures"
  | "table"
  | "playerTable"
  | "handicaps";

export type LeagueWorkspaceSeason = {
  id: string;
  name: string;
  is_active: boolean;
  is_published?: boolean | null;
  handicap_enabled?: boolean | null;
};

export const LEAGUE_WORKSPACE_OPTIONS: Array<{
  value: LeagueWorkspaceView;
  label: string;
  officerOnly?: boolean;
}> = [
  { value: "guide", label: "Overview", officerOnly: true },
  { value: "teamManagement", label: "Teams & roles", officerOnly: true },
  { value: "venues", label: "Venues", officerOnly: true },
  { value: "profiles", label: "Teams & players", officerOnly: true },
  { value: "setup", label: "League setup", officerOnly: true },
  { value: "fixtures", label: "Fixtures & results" },
  { value: "table", label: "League table" },
  { value: "playerTable", label: "Player table" },
  { value: "knockouts", label: "Knockout competitions" },
  { value: "handicaps", label: "Handicap management", officerOnly: true },
];

type Props<TSeason extends LeagueWorkspaceSeason> = {
  seasons: TSeason[];
  selectedSeasonId: string;
  selectedView: LeagueWorkspaceView;
  currentSeason: TSeason | null;
  canManage: boolean;
  description: string;
  formatSeasonLabel: (season: TSeason) => string;
  onSeasonChange: (seasonId: string) => void;
  onViewChange: (view: LeagueWorkspaceView) => void;
};

export default function LeagueWorkspaceSwitcher<TSeason extends LeagueWorkspaceSeason>({
  seasons,
  selectedSeasonId,
  selectedView,
  currentSeason,
  canManage,
  description,
  formatSeasonLabel,
  onSeasonChange,
  onViewChange,
}: Props<TSeason>) {
  const active = seasons.filter((season) => season.is_active !== false && season.is_published);
  const drafts = seasons.filter((season) => season.is_active !== false && !season.is_published);
  const completed = seasons.filter((season) => season.is_active === false);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-[#0f1a31] via-[#12304a] to-teal-800 px-4 py-3 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">League workspace</p>
            <p className="mt-0.5 text-sm font-semibold">Choose the league first, then the area you need.</p>
          </div>
          {currentSeason ? (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                currentSeason.is_active === false
                  ? "border-slate-400/60 bg-slate-700/70 text-slate-100"
                  : currentSeason.is_published
                    ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-100"
                    : "border-amber-300/60 bg-amber-400/15 text-amber-100"
              }`}
            >
              {currentSeason.is_active === false ? "Completed" : currentSeason.is_published ? "Published & active" : "Draft"}
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(220px,1fr)]">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          League
          <select
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            value={selectedSeasonId}
            onChange={(event) => onSeasonChange(event.target.value)}
          >
            <option value="">Select a league</option>
            {active.length ? (
              <optgroup label="Published and active">
                {active.map((season) => <option key={`active-${season.id}`} value={season.id}>{formatSeasonLabel(season)}</option>)}
              </optgroup>
            ) : null}
            {drafts.length ? (
              <optgroup label="Draft leagues">
                {drafts.map((season) => <option key={`draft-${season.id}`} value={season.id}>{formatSeasonLabel(season)}</option>)}
              </optgroup>
            ) : null}
            {completed.length ? (
              <optgroup label="Completed leagues">
                {completed.map((season) => <option key={`complete-${season.id}`} value={season.id}>{formatSeasonLabel(season)}</option>)}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          League area
          <select
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            value={selectedView}
            onChange={(event) => onViewChange(event.target.value as LeagueWorkspaceView)}
          >
            {LEAGUE_WORKSPACE_OPTIONS.filter((option) => canManage || !option.officerOnly).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">{description}</div>
    </section>
  );
}

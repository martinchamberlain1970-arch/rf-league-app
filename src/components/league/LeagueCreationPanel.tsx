"use client";

import type { GuidedSetupStep } from "./LeagueOverviewPanels";

export type LeagueTemplateOption = "premier" | "division1" | "summer";
type Template = { label: string; singlesCount: number; doublesCount: number; handicapEnabled: boolean };

type Props = {
  bodyName: string;
  seasonId: string;
  currentSeason: { is_published?: boolean | null; is_active: boolean } | null;
  nextStep: GuidedSetupStep | null;
  templates: Record<LeagueTemplateOption, Template>;
  template: LeagueTemplateOption;
  seasonName: string;
  summerHandicapEnabled: boolean;
  publishBlockers: string[];
  createHighlightClass: string;
  publishHighlightClass: string;
  onOpenNext: (step: GuidedSetupStep) => void;
  onTemplateChange: (template: LeagueTemplateOption) => void;
  onSeasonNameChange: (value: string) => void;
  onSummerHandicapChange: (enabled: boolean) => void;
  onCreate: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onToggleCompletion: () => void;
};

const format = (singles: number, doubles: number) => doubles > 0 ? `${singles} singles + ${doubles} doubles` : `${singles} singles`;

export default function LeagueCreationPanel({ bodyName, seasonId, currentSeason, nextStep, templates, template, seasonName, summerHandicapEnabled, publishBlockers, createHighlightClass, publishHighlightClass, onOpenNext, onTemplateChange, onSeasonNameChange, onSummerHandicapChange, onCreate, onDelete, onPublish, onToggleCompletion }: Props) {
  const published = Boolean(currentSeason?.is_published);
  return <>
    <div className="mt-3 rounded-xl border border-teal-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">Current setup position</p><p className="mt-1 text-sm text-slate-600">{published ? "This league is already published. Use the workspace areas for maintenance, fixture management, and live updates." : nextStep ? `Next recommended step: ${nextStep.title.replace(/^\d+\.\s*/, "")}.` : "This league setup is complete. You can still return here to edit league details or publish status."}</p></div>{published ? <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${currentSeason?.is_active === false ? "border-slate-300 bg-slate-100 text-slate-800" : "border-emerald-300 bg-emerald-100 text-emerald-900"}`}>{currentSeason?.is_active === false ? "League completed" : "League published"}</span> : nextStep ? <button type="button" onClick={() => onOpenNext(nextStep)} className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-900">Go to {nextStep.actionLabel}</button> : null}</div></div>
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">League body</p><p className="text-sm font-semibold text-slate-900">{bodyName}</p></div>
    <div className={`mt-3 rounded-2xl border p-3 ${published ? "border-slate-200 bg-slate-50/80" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">Create a new league</p><p className="mt-1 text-sm text-slate-600">{published ? "The selected league is already live. These creation controls are softened so this area reads as maintenance-first. Use them only when creating the next league." : "Use these controls to create the next draft league before moving on to teams, fixtures and publishing."}</p></div>{published ? <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">Creation controls softened</span> : null}</div>
      <div id="guided-create-league" className={`mt-3 grid gap-2 sm:grid-cols-4 scroll-mt-24 ${createHighlightClass} ${published ? "opacity-60" : ""}`}>
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2" value={template} onChange={(event) => onTemplateChange(event.target.value as LeagueTemplateOption)}><option value="premier">{templates.premier.label} 2026/2027 ({format(templates.premier.singlesCount, templates.premier.doublesCount)})</option><option value="division1">{templates.division1.label} 2026/2027 ({format(templates.division1.singlesCount, templates.division1.doublesCount)})</option><option value="summer">{bodyName} - {templates.summer.label} ({format(templates.summer.singlesCount, templates.summer.doublesCount)})</option></select>
        <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 sm:col-span-2" placeholder="Season label (optional, e.g. 2026/2027)" value={seasonName} onChange={(event) => onSeasonNameChange(event.target.value)} />
        <button type="button" onClick={onCreate} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Create league</button>
      </div>
      <p className="mt-2 text-xs text-slate-600">Selected format: <span className="font-semibold text-slate-800">{format(templates[template].singlesCount, templates[template].doublesCount)}</span></p>
      {template === "summer" ? <div className={`mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 ${published ? "opacity-70" : ""}`}><p className="font-semibold">Summer League rules applied</p><ul className="mt-1 space-y-1 text-xs text-amber-800"><li>6 singles frames and no doubles.</li><li>Each player can play a maximum of 2 singles frames.</li><li>If a side only has 2 players, frames 5 and 6 should be recorded as No Show.</li><li>No Show on both sides gives no frame point and no player stats.</li></ul></div> : template === "premier" ? <div className={`mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 ${published ? "opacity-70" : ""}`}><p className="font-semibold">Premier League 2026/2027 rules applied automatically</p><ul className="mt-1 space-y-1 text-xs text-sky-800"><li>4 singles frames and 1 doubles frame.</li><li>A team must field at least 2 players. With only 2 players, frame 3 is forfeited, the system randomly nominates one of them for frame 4, and both play the doubles.</li><li>Players begin at Elo 1000 and handicap 0; handicaps are reviewed at least every 4 weeks.</li><li>Handicap match play is enabled with no maximum start.</li><li>On the third miss attempt while snookered, the balls remain where they lie.</li><li>Teams play each other three times.</li></ul></div> : <div className={`mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950 ${published ? "opacity-70" : ""}`}><p className="font-semibold">Division 1 2026/2027 rules applied automatically</p><ul className="mt-1 space-y-1 text-xs text-violet-900"><li>4 singles frames and 1 doubles frame.</li><li>A team must field at least 2 players. With only 2 players, frame 3 is forfeited, the system randomly nominates one of them for frame 4, and both play the doubles.</li><li>All matches are played off scratch with no handicap start.</li><li>Elo is still recorded in the background for player history.</li><li>The miss rule is not used.</li><li>Teams play each other three times.</li></ul></div>}
      {template === "summer" ? <label className={`mt-2 inline-flex items-center gap-2 text-sm text-slate-700 ${published ? "opacity-70" : ""}`}><input type="checkbox" checked={summerHandicapEnabled} onChange={(event) => onSummerHandicapChange(event.target.checked)} />Handicap league (no maximum start)</label> : <p className="mt-2 text-xs font-medium text-slate-700">Handicap mode, Elo tracking, fixture cycles and miss rule are locked to the selected division template.</p>}
    </div>
    <div id="guided-publish-league" className={`mt-3 scroll-mt-24 ${publishHighlightClass}`}><button type="button" onClick={onDelete} disabled={!seasonId} className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm text-rose-700 disabled:cursor-not-allowed disabled:opacity-50">Delete selected league</button><button type="button" onClick={onPublish} disabled={!seasonId || published || publishBlockers.length > 0} className="ml-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{published ? "League published" : "Publish selected league"}</button>{published ? <button type="button" onClick={onToggleCompletion} disabled={!seasonId} className={`ml-2 rounded-xl border bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${currentSeason?.is_active === false ? "border-teal-300 text-teal-800" : "border-slate-400 text-slate-800"}`}>{currentSeason?.is_active === false ? "Reopen this league" : "Mark league as completed"}</button> : null}</div>
    {!published && publishBlockers.length > 0 ? <p className="mt-2 text-xs text-slate-600">Publish is disabled until the checklist above is complete.</p> : null}
  </>;
}

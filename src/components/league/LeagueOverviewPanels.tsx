"use client";

import type { LeagueWorkspaceView } from "./LeagueWorkspaceSwitcher";

export type GuidedTarget = "create-league" | "add-league-teams" | "assign-players" | "generate-fixtures" | "publish-league";
export type FixtureSummaryFilter = "all" | "pending" | "in_progress" | "complete" | "pending_review";
export type LeagueSummary = { teams: number; fixtures: number; complete: number; inProgress: number; pending: number; pendingApprovals: number };
export type GuidedSetupStep = {
  key: string;
  title: string;
  done: boolean;
  detail: string;
  actionLabel: string;
  view: LeagueWorkspaceView;
  target: GuidedTarget;
};

export function LeagueAreaGuide({ title, points, expanded }: { title: string; points: string[]; expanded: boolean }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><details className="group" open={expanded}><summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">{title}<span className="ml-2 text-xs font-medium text-slate-500 group-open:hidden">Show guide</span><span className="ml-2 hidden text-xs font-medium text-slate-500 group-open:inline">Hide guide</span></summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">{points.map((point) => <li key={point}>{point}</li>)}</ul></details></section>;
}

type PublishedStatusProps = {
  season: { name: string; is_active: boolean };
  summary: LeagueSummary;
  onToggleCompletion: () => void;
  onOpen: (view: LeagueWorkspaceView, target?: GuidedTarget, fixtureFilter?: FixtureSummaryFilter) => void;
};

export function PublishedLeagueStatus({ season, summary, onToggleCompletion, onOpen }: PublishedStatusProps) {
  const completed = season.is_active === false;
  const cards = [
    { label: "Teams", value: summary.teams, detail: "League teams currently assigned.", action: "Open Team Management", tone: "indigo", run: () => onOpen("teamManagement", "assign-players") },
    { label: "Fixtures", value: summary.fixtures, detail: "Generated and available in the published season.", action: "Open Fixtures", tone: "sky", run: () => onOpen("fixtures", undefined, "all") },
    { label: "In Progress", value: summary.inProgress, detail: "Fixtures currently carrying live admin or captain activity.", action: "Review Active Fixtures", tone: "emerald", run: () => onOpen("fixtures", undefined, "in_progress") },
    { label: "Pending Approvals", value: summary.pendingApprovals, detail: "Use Fixtures and Results Queue for any remaining actions.", action: "Open Fixture Actions", tone: "amber", run: () => onOpen("fixtures", undefined, "pending_review") },
  ];
  const toneClass: Record<string, string> = { indigo: "border-indigo-200 from-indigo-50 text-indigo-700", sky: "border-sky-200 from-sky-50 text-sky-700", emerald: "border-emerald-200 from-emerald-50 text-emerald-700", amber: "border-amber-200 from-amber-50 text-amber-700" };
  return <section className={`rounded-2xl border p-4 shadow-sm ${completed ? "border-slate-300 bg-gradient-to-br from-white via-slate-100 to-slate-50" : "border-emerald-300 bg-gradient-to-br from-white via-emerald-50 to-sky-50"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">League status</p><h2 className="mt-1 text-xl font-black text-slate-950">{completed ? "This league is completed" : "This league is active"}</h2><p className="mt-1 text-sm text-slate-600"><span className="font-semibold text-slate-800">{season.name}</span>{completed ? " is retained as history. Fixtures, results and tables remain visible, but captains cannot submit new results." : " is published and open for fixtures, administration and captain result submissions."}</p></div><span className={`rounded-full border px-4 py-1.5 text-sm font-bold ${completed ? "border-slate-400 bg-slate-200 text-slate-900" : "border-emerald-400 bg-emerald-100 text-emerald-900"}`}>{completed ? "Completed" : "Active"}</span></div>
    <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${completed ? "border-teal-200 bg-white" : "border-amber-300 bg-amber-50"}`}><div><p className="text-sm font-semibold text-slate-950">{completed ? "Need to accept more results?" : "Has the league season finished?"}</p><p className="mt-1 text-xs text-slate-600">{completed ? "Reopening restores league activity and captain result submissions." : "Mark it completed to close result submissions without deleting any league history."}</p></div><button type="button" onClick={onToggleCompletion} className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm ${completed ? "bg-teal-700 hover:bg-teal-800" : "bg-slate-900 hover:bg-slate-800"}`}>{completed ? "Reopen this league" : "Mark league as completed"}</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <button key={card.label} type="button" onClick={card.run} className={`rounded-xl border bg-gradient-to-br to-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass[card.tone]}`}><p className="text-xs font-semibold uppercase tracking-[0.2em]">{card.label}</p><p className="mt-2 text-2xl font-black text-slate-950">{card.value}</p><p className="mt-1 text-xs text-slate-600">{card.detail}</p><p className="mt-3 text-[11px] font-semibold uppercase tracking-wide">{card.action}</p></button>)}</div>
  </section>;
}

type GuidedSetupProps = { steps: GuidedSetupStep[]; nextStep: GuidedSetupStep | null; blockers: string[]; onOpen: (view: LeagueWorkspaceView, target: GuidedTarget) => void; onPublish: () => void };
export function GuidedSetup({ steps, nextStep, blockers, onOpen, onPublish }: GuidedSetupProps) {
  return <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50 to-sky-50 p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Guided setup</h2><p className="mt-1 text-sm text-slate-600">Follow the league creation flow in order. The workspace selector still allows direct editing, while this checklist keeps the setup sequence clear.</p></div>{nextStep ? <button type="button" onClick={() => onOpen(nextStep.view, nextStep.target)} className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-900">Next: {nextStep.actionLabel}</button> : <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">Setup complete</span>}</div>
    <div className="mt-4 grid gap-3 lg:grid-cols-5">{steps.map((step) => <div key={step.key} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{step.title}</p><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${step.done ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-amber-300 bg-amber-100 text-amber-900"}`}>{step.done ? "Complete" : "Needs attention"}</span></div><p className="mt-2 text-xs text-slate-600">{step.detail}</p><button type="button" onClick={() => step.key === "publish" && !step.done && blockers.length === 0 ? onPublish() : onOpen(step.view, step.target)} disabled={step.key === "publish" && !step.done && blockers.length > 0} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{step.actionLabel}</button></div>)}</div>
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><p className="text-sm font-semibold text-slate-900">Publish checklist</p>{blockers.length === 0 ? <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">This league is ready to publish.</p> : <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Action still required before publish</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}</div>
  </section>;
}

type SnapshotProps = { seasonLabel: string; completed: boolean; summary: LeagueSummary; onOpen: (view: LeagueWorkspaceView, target?: GuidedTarget, fixtureFilter?: FixtureSummaryFilter) => void };
export function LeagueSnapshot({ seasonLabel, completed, summary, onOpen }: SnapshotProps) {
  const cards = [
    { label: "Teams", value: summary.teams, detail: "League entries in the selected season.", action: "Review Team Setup", tone: "indigo", run: () => onOpen("teamManagement", "assign-players") },
    { label: "Fixtures", value: summary.fixtures, detail: "Scheduled matches generated so far.", action: "Open Fixtures", tone: "sky", run: () => onOpen("fixtures", undefined, "all") },
    { label: "Complete", value: summary.complete, detail: "Fixtures with approved results.", action: "Review Completed Fixtures", tone: "emerald", run: () => onOpen("fixtures", undefined, "complete") },
    { label: "In Progress", value: summary.inProgress, detail: "Fixtures with a live submission or partial entry.", action: "Review Active Fixtures", tone: "indigo", run: () => onOpen("fixtures", undefined, "in_progress") },
    { label: "Pending Fixtures", value: summary.pending, detail: "Still waiting to be played or submitted.", action: "Open Fixture Schedule", tone: "slate", run: () => onOpen("fixtures", undefined, "pending") },
    { label: "Pending Approvals", value: summary.pendingApprovals, detail: "Results or fixture requests awaiting action.", action: "Open Review Work", tone: "amber", run: () => onOpen("fixtures", undefined, "pending_review") },
  ];
  const tones: Record<string, string> = { indigo: "border-indigo-200 from-indigo-50 text-indigo-700", sky: "border-sky-200 from-sky-50 text-sky-700", emerald: "border-emerald-200 from-emerald-50 text-emerald-700", slate: "border-slate-200 from-slate-50 text-slate-600", amber: "border-amber-200 from-amber-50 text-amber-700" };
  return <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">League Snapshot</p><h2 className="mt-1 text-xl font-black text-slate-950">{seasonLabel}</h2><p className="mt-1 text-sm text-slate-600">{completed ? "This league has finished. Its fixtures, results and tables are retained as league history." : "Use this as the operating summary for setup progress, fixture completion, and review workload."}</p></div>{completed ? <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">League completed</span> : null}<div className={`rounded-full px-3 py-1 text-xs font-semibold ${summary.pendingApprovals > 0 ? "border border-amber-300 bg-amber-100 text-amber-900" : "border border-emerald-300 bg-emerald-100 text-emerald-900"}`}>{summary.pendingApprovals > 0 ? `${summary.pendingApprovals} approval${summary.pendingApprovals === 1 ? "" : "s"} require attention` : "No approval backlog"}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map((card) => <button key={card.label} type="button" onClick={card.run} className={`rounded-xl border bg-gradient-to-br to-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[card.tone]}`}><p className="text-xs font-semibold uppercase tracking-[0.2em]">{card.label}</p><p className="mt-2 text-2xl font-black text-slate-950">{card.value}</p><p className="mt-1 text-xs text-slate-600">{card.detail}</p><p className="mt-3 text-[11px] font-semibold uppercase tracking-wide">{card.action}</p></button>)}</div></section>;
}

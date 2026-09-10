"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";

type Stage = "lineup" | "scorecard" | "review";

const players = ["Alex Carter (0)", "Ben Morris (+8)", "Chris Taylor (-4)", "Daniel White (+16)"];
const opponents = ["Jamie Smith (+4)", "Lee Harris (0)", "Morgan Jones (+12)", "Pat Brown (-4)"];

export default function CaptainTrainingPage() {
  const [stage, setStage] = useState<Stage>("lineup");
  const [submitted, setSubmitted] = useState(false);
  const [breakEntry, setBreakEntry] = useState(false);

  const tabClass = (active: boolean) => `flex-1 rounded-xl border px-3 py-3 text-left ${active ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-white text-slate-600"}`;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <ScreenHeader title="Captain Results Training" eyebrow="Training mode" subtitle="Practise the complete match-night process. Nothing on this page is saved to league records." />

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <strong>Safe practice fixture</strong><br />Training Home vs Training Away · 10 September 2026
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setStage("lineup")} className={tabClass(stage === "lineup")}><span className="block text-xs font-bold uppercase">Step 1</span><span className="font-semibold">Team lineup</span></button>
            <button type="button" onClick={() => setStage("scorecard")} className={tabClass(stage === "scorecard")}><span className="block text-xs font-bold uppercase">Step 2</span><span className="font-semibold">Scorecard</span></button>
            <button type="button" onClick={() => setStage("review")} className={tabClass(stage === "review")}><span className="block text-xs font-bold uppercase">Step 3</span><span className="font-semibold">Final review</span></button>
          </div>
        </section>

        {stage === "lineup" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Home team view</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Enter the home lineup first</h2>
            <p className="mt-1 text-sm text-slate-600">Save a draft while deciding. Submit only when the lineup is final and ready for the away captain.</p>
            <div className="mt-4 space-y-3">
              {players.map((player, index) => (
                <label key={player} className="block rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-slate-800">
                  Frame {index + 1} · Singles
                  <select className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" defaultValue={player}>
                    {players.map((name) => <option key={name}>{name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700">Save draft</button>
              <button type="button" onClick={() => setStage("scorecard")} className="rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white">Submit lineup</button>
            </div>
          </section>
        ) : null}

        {stage === "scorecard" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Both lineups locked</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Enter each completed frame</h2>
            <p className="mt-1 text-sm text-slate-600">Check the players, enter the points and save the frame before moving on.</p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-bold text-slate-950">Frame 1 · Singles</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_90px_40px_90px_1fr] sm:items-center">
                <div><p className="text-xs font-bold text-slate-500">TRAINING HOME</p><p className="font-semibold">Alex Carter (0)</p></div>
                <input aria-label="Home points" defaultValue="68" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-lg font-bold" />
                <span className="text-center font-bold text-slate-500">–</span>
                <input aria-label="Away points" defaultValue="41" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-lg font-bold" />
                <div className="sm:text-right"><p className="text-xs font-bold text-slate-500">TRAINING AWAY</p><p className="font-semibold">Jamie Smith (+4)</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setBreakEntry((value) => !value)} className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900">Add break 30+</button>
                <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Save completed frame</button>
              </div>
              {breakEntry ? (
                <div className="mt-4 grid gap-2 rounded-xl border border-violet-200 bg-white p-3 sm:grid-cols-[1fr_130px]">
                  <select aria-label="Break player" className="rounded-lg border border-slate-300 px-3 py-2" defaultValue={players[0]}>{[...players, ...opponents].map((name) => <option key={name}>{name}</option>)}</select>
                  <input aria-label="Break value" defaultValue="42" className="rounded-lg border border-slate-300 px-3 py-2" />
                  <p className="text-xs text-violet-800 sm:col-span-2">Break recorded against Frame 1. Only breaks of 30 or more should be entered.</p>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => setStage("review")} className="mt-4 w-full rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white">Continue to final review</button>
          </section>
        ) : null}

        {stage === "review" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Final review</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Check the full scorecard with both teams</h2>
            <p className="mt-1 text-sm text-slate-600">Confirm every player, score and break before submitting the official result.</p>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[55px_1fr_80px_1fr] bg-slate-900 px-3 py-2 text-xs font-bold text-white"><span>Frame</span><span>Home</span><span>Score</span><span>Away</span></div>
              {players.map((player, index) => <div key={player} className="grid grid-cols-[55px_1fr_80px_1fr] border-t border-slate-200 px-3 py-2 text-sm"><span>{index + 1}</span><span>{player.split(" (")[0]}</span><span>{index === 0 ? "68–41" : "Entered"}</span><span>{opponents[index].split(" (")[0]}</span></div>)}
            </div>
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"><strong>Breaks 30+</strong><br />Alex Carter · 42 · Frame 1</div>
            {submitted ? <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><strong>Training submission complete</strong><br />A live submission would now enter the league-officer approval queue.</div> : null}
            <button type="button" onClick={() => setSubmitted(true)} className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white">Submit match result</button>
          </section>
        ) : null}
      </div>
      </main>
    </RequireAuth>
  );
}

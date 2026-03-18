"use client";

import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";

const faqs = [
  {
    question: "How do snooker Elo and handicap work together?",
    answer:
      "Valid approved competitive snooker frames update Elo. Handicap is then reviewed from Elo rather than changing automatically after every win or loss.",
  },
  {
    question: "Why is there a maximum 40-point start?",
    answer:
      "The live match start is capped at 40 so frames stay competitive and do not feel decided before play begins. Elo still tracks the full strength gap in the background.",
  },
  {
    question: "Do no-shows or nominated-player frames affect Elo or handicap?",
    answer:
      "No. No-show, void, and nominated-player outcomes are excluded from Elo and handicap review.",
  },
  {
    question: "Where can I see current handicaps?",
    answer:
      "Use the Handicaps page for the current list, the Elo-to-handicap guide, and the explanation of how the capped start is applied.",
  },
  {
    question: "Who can change a handicap?",
    answer:
      "The Super User can run Elo reviews and apply manual corrections where league rules require it.",
  },
];

const guideSections = [
  {
    title: "Players",
    bullets: [
      "Use League Manager to view published fixtures, the league table, and the player table.",
      "Use Handicaps to see the current snooker handicap list and the Elo explanation.",
      "Open your player profile to see your current Elo, baseline handicap, current handicap, and history.",
    ],
  },
  {
    title: "Captains And Vice-Captains",
    bullets: [
      "Use Captain Results to submit weekly team results for approval.",
      "In handicapped doubles, team handicap is based on both players and the live start is capped at 40.",
      "Only approved results affect Elo, standings, and player records.",
    ],
  },
  {
    title: "Super User Governance",
    bullets: [
      "Use League Manager > Handicaps to run the Elo review and export the handicap list.",
      "Manual corrections remain available, but normal movement is driven by the Elo review flow.",
      "Use Signup Requests, Results Queue, and Notifications to manage the live system.",
    ],
  },
];

export default function HelpPage() {
  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <ScreenHeader title="User Guide" eyebrow="Help" subtitle="League help, handicap explanations, and common questions." />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Quick Guide</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {guideSections.map((section) => (
                <div key={section.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">FAQs</h2>
            <div className="mt-3 space-y-3">
              {faqs.map((faq) => (
                <div key={faq.question} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">{faq.question}</h3>
                  <p className="mt-1 text-sm text-slate-700">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}

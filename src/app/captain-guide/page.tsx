import Link from "next/link";
import ScreenHeader from "@/components/ScreenHeader";

const quickChecklist = [
  "Register for the app and wait for your account/profile approval.",
  "Open Notifications regularly — lineup requests and fixture reminders land there.",
  "Before match night, use Captain Results if your fixture needs a pre-match lineup.",
  "On match night, enter the frame players, points, and any breaks accurately.",
  "Use Save progress if you need to stop and come back before submitting.",
  "Submit the result once the card is complete. The Super User then approves it.",
];

const sections = [
  {
    title: "1. First-time setup",
    bullets: [
      "Create your account using the normal registration flow. Captains and vice-captains do not use a separate sign-up form.",
      "Ask the league Super User to link your account to the correct player profile and assign your captain or vice-captain role.",
      "Once linked, your dashboard tiles, captain permissions, and notifications will appear automatically.",
    ],
  },
  {
    title: "2. Before the fixture",
    bullets: [
      "Check Notifications for fixture reminders, lineup requests, or admin messages.",
      "If your league is using pre-match lineups, the home team submits first on the day of the fixture and the away team responds before 19:30.",
      "If both teams agree to use paper instead, choose the paper-record option so the system knows the digital lineup was skipped intentionally.",
      "If the fixture date needs changing, use the fixture date request workflow rather than relying on an informal message alone.",
    ],
  },
  {
    title: "3. On match night",
    bullets: [
      "Open Captain Results and select the fixture.",
      "Check the team names, date, and whether you are entering for the home or away side.",
      "Enter the players in the correct frame slots. For summer leagues, remember the two-singles-per-player limit. For winter leagues, check nominated-player and no-show rules carefully.",
      "Enter the points scored for each frame and any qualifying breaks.",
      "If you need to stop mid-way, use Save progress and come back later on the same device.",
    ],
  },
  {
    title: "4. Submitting the result",
    bullets: [
      "Review the full card before you submit. Make sure players, scores, and breaks match the paper card if one was used.",
      "Add a scorecard photo URL if your league process requires it.",
      "Submit the result. The card is then locked into the review queue for Super User approval.",
      "Only approved results update the league table, player records, and Elo-driven handicap history.",
    ],
  },
  {
    title: "5. If something goes wrong",
    bullets: [
      "If you entered the wrong lineup or score before submitting, correct it immediately or use Save progress and return once you have checked the paper card.",
      "If you already submitted the card, contact the Super User. They can reject it back for correction or amend it in review.",
      "If a player is missing from the roster, do not guess. Contact the Super User so the season roster can be corrected properly.",
    ],
  },
];

export default function CaptainGuidePage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <ScreenHeader
          title="Captain / Vice-captain Guide"
          eyebrow="League Help"
          subtitle="A practical guide you can send to team captains and vice-captains before the season starts."
        />

        <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Quick checklist</h2>
              <p className="mt-1 text-sm text-slate-600">This is the short version to send in a WhatsApp group or captain email.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/auth/sign-up" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Register for the app
              </Link>
              <Link href="/auth/sign-in" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Sign in
              </Link>
            </div>
          </div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            {quickChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">What captains should keep open</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              <p className="mt-1 text-sm text-slate-700">For lineup prompts, fixture reminders, and admin messages.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Captain Results</h3>
              <p className="mt-1 text-sm text-slate-700">For pre-match lineups, saving progress, and final result submission.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Help / Handicaps</h3>
              <p className="mt-1 text-sm text-slate-700">For current handicap guidance and the wider user guide.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

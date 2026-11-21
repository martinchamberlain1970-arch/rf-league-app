import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ProductEnquiryForm from "@/components/ProductEnquiryForm";

export const metadata: Metadata = {
  title: "Pool & Snooker Club and League Management",
  description: "Rack & Frame is a live digital platform for running internal club competitions and local pool and snooker leagues.",
  alternates: { canonical: "https://www.rackandframe.app/" },
  openGraph: {
    title: "Rack & Frame — Pool and snooker management, built around the game",
    description: "Fixtures, scoring, results, tables, handicaps and table bookings for cue-sports clubs and leagues.",
    url: "https://www.rackandframe.app/",
    siteName: "Rack & Frame",
    type: "website",
  },
};

const leagueFeatures = [
  ["Fixtures without the spreadsheet", "Create seasons, teams, venues and fixture programmes, with changes tracked clearly."],
  ["A better match night", "Captains enter line-ups and frame scores from their phones while supporters follow live."],
  ["Tables that update themselves", "Approved results flow into league tables, player records, reports and high-break lists."],
  ["Handicaps with an audit trail", "Elo-based ratings, scheduled handicap reviews and a clear record of every change."],
  ["Knockouts and entries", "Collect competition entries, administer draws and publish results from the same place."],
  ["Governance built in", "Approvals, officer roles, notifications, voting, documents and audit records reduce the burden on volunteers."],
];

const clubFeatures = [
  "Internal pool and snooker leagues",
  "Fixtures, score entry and result approval",
  "Elo rankings and reviewed handicaps",
  "Table bookings linked to players and fixtures",
  "Outstanding-fixture and reschedule workflows",
  "Public displays, reports and player communications",
];

const proofPoints = [
  { value: "2", label: "live products", detail: "Club and League" },
  { value: "2", label: "cue sports", detail: "Pool and snooker" },
  { value: "1", label: "connected record", detail: "from fixture to final table" },
];

function TickIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 fill-none stroke-current" strokeWidth="2"><path d="m4 10 3.5 3.5L16 5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="absolute -inset-8 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[#111d35] p-3 shadow-2xl shadow-black/40 sm:p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Live league night</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">Tonight</p>
            <p className="mt-2 text-lg font-black text-white">Premier League</p>
            <div className="mt-5 space-y-3 text-xs">
              {["Live matches", "Fixtures & results", "Player standings", "High breaks"].map((item, index) => (
                <div key={item} className={`rounded-xl px-3 py-2.5 font-bold ${index === 0 ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}>{item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Frame 4 · Singles</p><p className="mt-1 text-base font-black text-white">Match in progress</p></div>
              <span className="rounded-full bg-rose-400/15 px-2.5 py-1 text-[10px] font-black uppercase text-rose-200">Live</span>
            </div>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <div className="rounded-xl bg-slate-950/55 p-3"><p className="text-xs text-slate-400">Home</p><p className="mt-1 text-sm font-black text-white">Greenhithe A</p><p className="mt-3 text-3xl font-black text-cyan-200">42</p></div>
              <span className="text-xs font-black text-slate-500">VS</span>
              <div className="rounded-xl bg-slate-950/55 p-3"><p className="text-xs text-slate-400">Away</p><p className="mt-1 text-sm font-black text-white">Perry Street C</p><p className="mt-3 text-3xl font-black text-white">37</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3">
              <div className="flex items-center justify-between text-xs"><span className="font-bold text-emerald-100">Frames completed</span><span className="font-black text-white">3 of 5</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-950/70"><div className="h-full w-3/5 rounded-full bg-emerald-300" /></div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[["9", "teams"], ["4", "live"], ["30s", "updates"]].map(([value, label]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center"><p className="text-xl font-black text-white">{value}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p></div>)}
        </div>
      </div>
    </div>
  );
}

export default function ProductPage() {
  return (
    <main className="min-h-screen bg-[#07101f] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-[-12rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-12rem] top-[20rem] h-[32rem] w-[32rem] rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <header className="relative z-30 border-b border-white/10 bg-[#07101f]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/product" className="block">
            <Image src="/brand/rack-and-frame-wordmark-light.svg" alt="Rack & Frame — Snooker Management" width={300} height={60} priority className="h-10 w-auto sm:h-14" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-bold text-slate-300 md:flex" aria-label="Product navigation">
            <a href="#clubs" className="hover:text-white">For clubs</a>
            <a href="#leagues" className="hover:text-white">For leagues</a>
            <a href="#in-use" className="hover:text-white">Live examples</a>
          </nav>
          <a href="#enquire" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-black text-cyan-100 transition hover:bg-cyan-300 hover:text-slate-950">Book a walkthrough</a>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.02fr_0.98fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-emerald-200"><span className="h-2 w-2 rounded-full bg-emerald-300" />Live in club and league use</div>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">Run your club.<br />Run your league.<br /><span className="bg-gradient-to-r from-cyan-200 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">Keep everyone playing.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Rack &amp; Frame brings fixtures, scoring, results, league tables, handicaps, competitions and table bookings into one purpose-built home for pool and snooker.</p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">Built through real use at Greenhithe Legion Social Club and in the Gravesend &amp; District Indoor Games League—not adapted from a generic sports system.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#enquire" className="inline-flex items-center justify-center rounded-2xl bg-cyan-300 px-6 py-3.5 font-black text-slate-950 shadow-xl shadow-cyan-950/30 transition hover:bg-cyan-200">Book a walkthrough</a>
              <a href="/league-hub" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 font-black text-white transition hover:bg-white/10">View a live league example</a>
            </div>
            <p className="mt-4 text-xs font-semibold text-slate-500">An informal look at the live products. No pricing or commitment at this stage.</p>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="relative border-y border-white/10 bg-white/[0.035] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-3">
          {proofPoints.map((point) => <div key={point.label} className="flex items-center gap-4 rounded-2xl border border-white/8 bg-slate-950/30 p-4"><span className="text-3xl font-black text-cyan-300">{point.value}</span><span><span className="block text-sm font-black text-white">{point.label}</span><span className="block text-xs text-slate-400">{point.detail}</span></span></div>)}
        </div>
      </section>

      <section id="in-use" className="relative scroll-mt-8 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Proven through everyday use</p><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">One platform idea, proven in a club and a league.</h2><p className="mt-5 text-lg leading-8 text-slate-400">Rack &amp; Frame is shaped by the people entering scores, rearranging fixtures, reviewing results and keeping local cue sport running every week.</p></div>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <article className="group relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/12 to-slate-900 p-7 sm:p-9">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Rack &amp; Frame League · Live</span><h3 className="mt-5 text-2xl font-black text-white sm:text-3xl">Gravesend &amp; District Indoor Games League</h3><p className="mt-4 max-w-xl leading-7 text-slate-300">A local snooker league using published fixtures, mobile score entry, approvals, tables, player records, handicaps, competitions, weekly reports and governance tools.</p><a href="/league-hub" className="mt-7 inline-flex items-center font-black text-cyan-200 hover:text-white">Explore the public league hub</a>
            </article>
            <article className="group relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-300/12 to-slate-900 p-7 sm:p-9">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Rack &amp; Frame Club · Live</span><h3 className="mt-5 text-2xl font-black text-white sm:text-3xl">Greenhithe Legion Social Club</h3><p className="mt-4 max-w-xl leading-7 text-slate-300">Running internal Masters pool and snooker competitions with player fixtures, result entry, league tables, Elo-based handicaps, rescheduling and linked table bookings.</p><span className="mt-7 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-emerald-200">Pool and snooker in active use</span>
            </article>
          </div>
        </div>
      </section>

      <section id="leagues" className="relative scroll-mt-8 border-y border-white/10 bg-slate-950/45 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Built for league volunteers</p><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Less chasing.<br />Less duplication.<br /><span className="text-cyan-300">More control.</span></h2></div><p className="max-w-2xl text-lg leading-8 text-slate-400 lg:justify-self-end">Every result should only need entering once. Every captain should know what they need to do. Every supporter should be able to find the information without messaging the secretary.</p></div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {leagueFeatures.map(([title, description], index) => <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 transition hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-white/[0.065]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-sm font-black text-cyan-200">0{index + 1}</span><h3 className="mt-5 text-xl font-black text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{description}</p></article>)}
          </div>
        </div>
      </section>

      <section id="clubs" className="relative scroll-mt-8 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#102542] to-[#0a1426] p-6 shadow-2xl sm:p-9">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">For clubs</p><h2 className="mt-4 text-3xl font-black text-white">Give your internal competitions a proper home.</h2><p className="mt-4 leading-7 text-slate-400">Replace fixture lists, message threads and manual tables with a simple player app and a clear management view for the people running the competition.</p><ul className="mt-7 space-y-4">{clubFeatures.map((feature) => <li key={feature} className="flex gap-3 font-bold text-slate-200"><span className="text-emerald-300"><TickIcon /></span>{feature}</li>)}</ul>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Purpose-built, not generic</p><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Cue sport has its own way of working.</h2><p className="mt-6 text-lg leading-8 text-slate-400">Handicaps, opening breaks, frame-by-frame scores, rearranged fixtures, no-shows, approvals, table availability and knockout eligibility are not edge cases—they are the weekly reality.</p><p className="mt-5 text-lg leading-8 text-slate-400">Rack &amp; Frame is designed around those realities, while still giving each club or league room to preserve its own rules and identity.</p>
          </div>
        </div>
      </section>

      <section id="pilot" className="relative border-y border-white/10 bg-gradient-to-r from-cyan-300/10 via-transparent to-emerald-300/10 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center"><p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">See it working</p><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Could Rack &amp; Frame work for your club or league?</h2><p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300">We are inviting conversations with UK pool and snooker clubs and leagues that want clearer administration, a better player experience and less weekly chasing.</p><div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">{["Tell us how you run things now", "See the live Club and League products", "Explore a setup shaped around your rules"].map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm font-bold leading-6 text-slate-200"><span className="mb-2 block text-cyan-300"><TickIcon /></span>{item}</div>)}</div></div>
      </section>

      <section id="enquire" className="relative scroll-mt-8 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div><p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Book a walkthrough</p><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Start with how you work today.</h2><p className="mt-6 text-lg leading-8 text-slate-400">Tell us a little about your club or league and the jobs that take the most time. This is an informal enquiry—not a sales commitment.</p><div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5"><p className="font-black text-white">What happens next?</p><ol className="mt-4 space-y-3 text-sm leading-6 text-slate-400"><li><strong className="text-slate-200">1.</strong> We learn how your club or league operates.</li><li><strong className="text-slate-200">2.</strong> We show the relevant live product.</li><li><strong className="text-slate-200">3.</strong> We discuss whether Rack &amp; Frame is a good fit.</li></ol></div></div>
          <ProductEnquiryForm />
        </div>
      </section>

      <footer className="relative border-t border-white/10 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div><Image src="/brand/rack-and-frame-wordmark-light.svg" alt="Rack & Frame — Pool and snooker management" width={245} height={49} className="h-11 w-auto opacity-90" /><p className="mt-2 text-xs">Pool and snooker management, built around the game.</p></div><div className="flex flex-wrap gap-5"><a href="#enquire" className="hover:text-white">Enquiries</a><Link href="/privacy" className="hover:text-white">Privacy</Link><Link href="/auth/sign-in" className="hover:text-white">League sign in</Link></div><p>© {new Date().getFullYear()} Martin Chamberlain</p></div></footer>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hall of Fame",
  description: "Historic league and competition honours for the Gravesend & District Indoor Games League.",
};

type HonourRow = {
  season: string;
  values: string[];
};

const leagueChampions: HonourRow[] = [
  { season: "2025-26", values: ["Bexley A", "Traders B"] },
  { season: "2024-25", values: ["Jordans", "One division"] },
  { season: "2023-24", values: ["Perry Street B", "Southfleet B"] },
  { season: "2022-23", values: ["Hartley CC A", "Greenhithe Social B"] },
  { season: "2021-22", values: ["Hartley CC A", "Bexley Ex Servicemens"] },
  { season: "2020-21", values: ["Not held - COVID", "Not held - COVID"] },
  { season: "2019-20", values: ["Hartley CC A", "Hartley CC D"] },
  { season: "2018-19", values: ["Hartley CC A", "Traders B"] },
  { season: "2017-18", values: ["Hartley CC A", "Southfleet B"] },
  { season: "2016-17", values: ["Hartley CC A", "Arriva A"] },
  { season: "2015-16", values: ["Hartley CC A", "Southfleet B"] },
  { season: "2014-15", values: ["Pockets A", "Traders B"] },
  { season: "2013-14", values: ["Pockets A", "Cliffe Social"] },
  { season: "2012-13", values: ["Pockets", "Fleet Leisure B"] },
  { season: "2011-12", values: ["Hartley CC A", "Milton Social A"] },
  { season: "2010-11", values: ["Players", "Pockets"] },
  { season: "2009-10", values: ["Hartley CC A", "Cliffe Temperance B"] },
];

const individualHonours: HonourRow[] = [
  { season: "2025-26", values: ["Amrik Cheema - Bexley", "Steve Bull - Greenhithe", "Amrik Cheema - Bexley", "Raj Puri - Hartley"] },
  { season: "2024-25", values: ["Rob Molinari - Jordans", "Amrik Cheema - Bexley", "Amrik Cheema - Bexley", "Raj Puri - Hartley"] },
  { season: "2023-24", values: ["Mick Quinnell - Bexley", "Luke Coyne - Traders", "Joe Mears - Bexley", "Raj Puri - Hartley"] },
  { season: "2022-23", values: ["Amrik Cheema - Bexley", "Graham Ould - Perry Street", "Amrik Cheema", "Raj Puri - Hartley"] },
  { season: "2021-22", values: ["Steve Hartley - Hartley CC", "Graham Ould - Perry Street", "Raj Puri", "Patrick Whyte"] },
  { season: "2020-21", values: ["Not held - COVID", "Not held - COVID", "Not held - COVID", "Not held - COVID"] },
  { season: "2019-20", values: ["Amrik Cheema - Hartley CC", "Mark Britton - Perry Street", "Amrik Cheema", "Patrick Whyte"] },
  { season: "2018-19", values: ["Mick Quinnell - Hartley CC", "Ben Sizer - Hartley CC", "J Tait", "J Tait"] },
  { season: "2017-18", values: ["Steve Hartley - Hartley CC", "Steve Hartley - Hartley CC", "J Tait", "J Tait"] },
  { season: "2016-17", values: ["Steve Hartley - Hartley CC", "Steve Hartley - Hartley CC", "J Tait", "J Tait"] },
  { season: "2015-16", values: ["Lee Martin - Higham", "Steve Hartley - Hartley CC", "J Tait", "J Tait"] },
  { season: "2014-15", values: ["Steve Hartley - Hartley CC", "Kevin Matthews - Hartley CC", "S Hills", "J Tait"] },
  { season: "2013-14", values: ["Colin Randall - Pockets", "Ben Trowell - Jordans", "K Bance", "J Tait"] },
  { season: "2012-13", values: ["Steve Hartley - Hartley CC", "Steve Hartley - Hartley CC", "J Tait", "Colin Wenham"] },
  { season: "2011-12", values: ["Steve Hartley - Hartley CC", "Steve Hartley - Hartley CC", "S Hills", "T Barron"] },
];

const teamHonours: HonourRow[] = [
  { season: "2025-26", values: ["A Cheema & G Viscogliosi", "Legion A", "No entrants"] },
  { season: "2024-25", values: ["A Cheema & G Viscogliosi", "Jordans", "Not held - one division"] },
  { season: "2023-24", values: ["A Cheema & J Mears", "Legion A", "Southfleet B"] },
  { season: "2022-23", values: ["S Wood & S Hartley", "Jordans", "Greenhithe B"] },
  { season: "2021-22", values: ["S Wood & S Hartley", "Hartley CC A", "Hartley CC B"] },
  { season: "2020-21", values: ["Not held - COVID", "Not held - COVID", "Not held - COVID"] },
  { season: "2019-20", values: ["K Matthews & A Cheema", "Hartley CC A", "Hartley CC D"] },
  { season: "2018-19", values: ["K Matthews & A Cheema", "Hartley CC A", "Traders B"] },
  { season: "2017-18", values: ["K Matthews & A Cheema", "Hartley CC A", "Southfleet B"] },
  { season: "2016-17", values: ["B Sizer & S Hartley", "Hartley CC", "Hartley CC C"] },
  { season: "2015-16", values: ["L Martin & C Randall", "Hartley CC A", "Southfleet B"] },
  { season: "2014-15", values: ["L Martin & C Short", "Pockets", "Traders B"] },
  { season: "2013-14", values: ["P Williams & R Molinari", "Hartley CC A", "British Legion"] },
  { season: "2012-13", values: ["K Parris & B Stamp", "Jordans", "Cliffe Temperance A"] },
  { season: "2011-12", values: ["T Martin & S Hartley", "Hartley CC A", "Cliffe Temperance B"] },
];

const highestBreaks: HonourRow[] = [
  { season: "2025-26", values: ["Amrik Cheema", "100"] },
  { season: "2024-25", values: ["Harry Compton", "72"] },
  { season: "2023-24", values: ["Jordan Church", "97"] },
  { season: "2022-23", values: ["Steve Hartley", "96"] },
  { season: "2021-22", values: ["Steve Hartley", "85"] },
  { season: "2020-21", values: ["Not held - COVID", "-"] },
  { season: "2019-20", values: ["Stuart Wood", "133"] },
  { season: "2018-19", values: ["Lee Martin", "104"] },
  { season: "2017-18", values: ["Amrik Cheema", "99"] },
  { season: "2016-17", values: ["Lee Martin", "103"] },
  { season: "2015-16", values: ["Colin Randall", "90"] },
  { season: "2014-15", values: ["Lee Martin", "81"] },
  { season: "2013-14", values: ["Lee Martin", "88"] },
  { season: "2012-13", values: ["Matt Howard", "89"] },
  { season: "2011-12", values: ["Kevin Kelleher and Danny Bush", "64"] },
  { season: "2010-11", values: ["Mark Devonshire", "112"] },
  { season: "2009-10", values: ["Danny Bush", "91"] },
];

function HonourTable({
  title,
  description,
  headings,
  rows,
}: {
  title: string;
  description: string;
  headings: string[];
  rows: HonourRow[];
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/10">
      <div className="border-b border-white/10 bg-white/5 px-5 py-5 sm:px-6">
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#142543] text-xs uppercase tracking-wider text-cyan-100">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-bold">Season</th>
              {headings.map((heading) => <th key={heading} className="min-w-48 px-4 py-3 font-bold">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.season} className={`border-t border-white/5 ${index % 2 === 0 ? "bg-white/[0.025]" : ""}`}>
                <th className="whitespace-nowrap px-4 py-3 font-bold text-cyan-300">{row.season}</th>
                {row.values.map((value, valueIndex) => (
                  <td key={`${row.season}-${valueIndex}`} className="px-4 py-3 font-medium text-slate-100">{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function HallOfFamePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#173654,_#0f172a_58%)] px-3 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="overflow-hidden rounded-3xl border border-amber-200/20 bg-[linear-gradient(135deg,rgba(20,37,67,.98),rgba(8,71,72,.96))] p-6 shadow-2xl shadow-black/25 sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-amber-300">Gravesend and District Indoor Games League</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">Hall of Fame</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">
                Celebrating the league champions, competition winners and outstanding breaks recorded across more than 70 years of local cue sports.
              </p>
            </div>
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border border-amber-200/30 bg-amber-300/10 text-5xl shadow-inner" aria-hidden="true">🏆</div>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#latest-honours" className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-200">Latest honours</a>
            <a href="#archive" className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15">Browse winners</a>
            <Link href="/league-hub" className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-100 hover:bg-cyan-400/15">Current league hub</Link>
          </div>
        </header>

        <section id="latest-honours" className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 shadow-xl shadow-black/10 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">Latest completed season</p>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-3xl font-black text-white">2025-26 honours</h2>
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">League archive</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Premier Division", "Bexley A"],
              ["Division 1", "Traders B"],
              ["Gary Webb Scratch Singles", "Amrik Cheema"],
              ["Lee Ford Handicap Singles", "Steve Bull"],
              ["Jack Harvey Over 50s", "Amrik Cheema"],
              ["Fred Osbourne Over 60s", "Raj Puri"],
              ["Cross Cup Doubles", "A Cheema and G Viscogliosi"],
              ["Hodge Cup Three Player Team", "Legion A"],
            ].map(([label, winner]) => (
              <article key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-2 text-lg font-black text-white">{winner}</p>
              </article>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-200">Highest break 2025-26</p>
            <p className="mt-1 text-2xl font-black text-white">Amrik Cheema <span className="text-amber-300">100</span></p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Archive begins</p>
            <p className="mt-2 text-3xl font-black text-white">1935-36</p>
            <p className="mt-1 text-sm text-slate-300">Earliest league championship record in the supplied archive.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Highest recorded break</p>
            <p className="mt-2 text-3xl font-black text-white">133</p>
            <p className="mt-1 text-sm text-slate-300">Stuart Wood in the 2019-20 season.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Historic competitions</p>
            <p className="mt-2 text-3xl font-black text-white">9</p>
            <p className="mt-1 text-sm text-slate-300">League, singles, doubles, team and billiards honours represented.</p>
          </article>
        </section>

        <div id="archive" className="space-y-5 scroll-mt-5">
          <HonourTable title="League champions" description="Recent Premier Division and Division 1 champions." headings={["Premier Division", "Division 1"]} rows={leagueChampions} />
          <HonourTable title="Individual champions" description="Scratch, handicap and age-group singles honours." headings={["Gary Webb Scratch Singles", "Lee Ford Handicap Singles", "Jack Harvey Over 50s", "Fred Osbourne Over 60s"]} rows={individualHonours} />
          <HonourTable title="Doubles and team champions" description="Cross Cup, Hodge Cup and Mick White competition winners." headings={["Cross Cup Doubles", "Hodge Cup Three Player Team", "Mick White Division 1 Team"]} rows={teamHonours} />
          <HonourTable title="Season highest breaks" description="The highest league break recorded for each available season." headings={["Player", "Break"]} rows={highestBreaks} />
        </div>

        <section className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-2xl font-black text-white">Complete historical archive</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">The original archive contains the complete historic record, including earlier winners of the Hamilton Cup, Albery Cup and all other competitions. Blank entries and seasons where no competition was held are retained exactly as supplied.</p>
          </div>
          <a href="/documents/hall-of-fame.pdf" target="_blank" rel="noreferrer" className="mt-4 inline-flex shrink-0 rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-200 sm:mt-0">Open full archive PDF</a>
        </section>

        <p className="px-4 text-center text-xs leading-5 text-slate-400">Historical spellings and club names reflect the supplied league archive. Please send any corrections to the League Secretary.</p>
        <footer className="px-3 py-5 text-center text-xs text-slate-400">Rack &amp; Frame League Manager © 2026 Martin Chamberlain. All rights reserved.</footer>
      </div>
    </main>
  );
}

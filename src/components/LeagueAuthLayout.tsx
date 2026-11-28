import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import NavigationIcon from "@/components/NavigationIcon";

export default function LeagueAuthLayout({ children, title, intro }: {
  children: ReactNode;
  title: string;
  intro?: string;
}) {
  return (
    <main className="min-h-dvh bg-[#eef2f4] px-3 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-8 lg:grid lg:place-items-center">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_85px_-45px_#102f3b] lg:grid-cols-[0.88fr_1.12fr]">
        <div className="bg-[#08182b] px-5 pb-4 pt-5 text-white lg:flex lg:flex-col lg:justify-between lg:bg-[linear-gradient(155deg,#071629_12%,#112d42_53%,#075652_100%)] lg:p-10">
          <Link href="/league-hub" className="inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-teal-300">
            <Image src="/icons/rack-frame-icon-192-v2.png" alt="" width={48} height={48} className="rounded-xl" />
            <span>
              <span className="block text-lg font-bold leading-tight">Rack &amp; Frame</span>
              <span className="block text-xs font-medium text-teal-200">League Manager</span>
            </span>
          </Link>
          <div className="hidden lg:block">
            <p className="max-w-xs text-3xl font-bold leading-tight tracking-tight">Fixtures, results and league tables</p>
            <div className="mt-6 space-y-2">
              <Link href="/league-hub" className="flex items-center gap-3 rounded-xl border border-white/20 p-3 text-sm font-semibold hover:bg-white/10">
                <NavigationIcon name="chart" /> Browse the public league hub
              </Link>
              <Link href="/display/live-matches" className="flex items-center gap-3 rounded-xl border border-white/20 p-3 text-sm font-semibold hover:bg-white/10">
                <NavigationIcon name="play" /> Follow live matches
              </Link>
            </div>
          </div>
        </div>
        <section className="px-5 py-6 sm:px-9 sm:py-8 lg:px-12 lg:py-11">
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          {intro ? <p className="mt-2 text-sm leading-6 text-slate-600">{intro}</p> : null}
          {children}
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm font-semibold text-teal-800 lg:hidden">
            <Link href="/league-hub" className="hover:underline">Public league hub</Link>
            <Link href="/display/live-matches" className="hover:underline">Live matches</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

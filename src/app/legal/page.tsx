"use client";

import Link from "next/link";
import PageNav from "@/components/PageNav";

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-slate-50 to-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Legal</p>
              <h1 className="text-2xl font-bold text-slate-900">Legal & Credits</h1>
            </div>
            <PageNav />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">
            Use the links below to review policy pages for this deployment.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/privacy" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
              Privacy Policy
            </Link>
            <Link href="/terms" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
              Terms & Conditions
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Credits</p>
          <p className="mt-2 text-sm text-slate-700">
            Product concept, league workflow design, and delivery leadership by <span className="font-semibold">Martin Chamberlain</span>.
          </p>
        </section>
      </div>
    </main>
  );
}

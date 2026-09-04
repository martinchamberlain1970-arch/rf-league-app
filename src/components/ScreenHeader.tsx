"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PageNav from "@/components/PageNav";

type ScreenHeaderProps = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  warnOnNavigate?: boolean;
  warnMessage?: string;
  actions?: ReactNode;
};

export default function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  warnOnNavigate = false,
  warnMessage,
  actions,
}: ScreenHeaderProps) {
  const pathname = usePathname();
  const relatedLinks = pathname.startsWith("/events") || pathname.startsWith("/competitions") || pathname === "/signups"
    ? [
        { href: "/events", label: "Match centre" },
        { href: "/signups", label: "Competition entries" },
        { href: "/high-breaks", label: "High breaks" },
      ]
    : pathname === "/notifications" || pathname === "/documents" || pathname === "/help" || pathname === "/announcements"
      ? [
          { href: "/notifications", label: "Notifications" },
          { href: "/documents", label: "Documents" },
          { href: "/help", label: "Help" },
        ]
      : [
          { href: "/league", label: "League manager" },
          { href: "/captain-results", label: "Line-ups & results" },
          { href: "/results", label: "Approvals" },
          { href: "/players", label: "Players & teams" },
        ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
      <div className="h-1 bg-gradient-to-r from-cyan-400 via-teal-600 to-[#0f1a31]" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0f1a31] to-teal-800 text-xs font-black tracking-tight text-cyan-300 shadow-sm">R&amp;F</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Link href="/" className="hover:text-teal-700">Home</Link>
                <span aria-hidden="true">/</span>
                {eyebrow ? <span className="uppercase tracking-wide text-teal-700">{eyebrow}</span> : <span>Workspace</span>}
              </div>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
              {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
            <PageNav warnOnNavigate={warnOnNavigate} warnMessage={warnMessage} />
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto border-t border-slate-100 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Related</span>
          {relatedLinks.filter((item) => item.href !== pathname).map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

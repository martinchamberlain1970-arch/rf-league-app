"use client";

import type { ReactNode } from "react";
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
  return (
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-slate-50 to-amber-50 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{eyebrow}</p> : null}
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <PageNav warnOnNavigate={warnOnNavigate} warnMessage={warnMessage} />
        </div>
      </div>
      {subtitle ? <p className="mt-2 text-sm text-slate-600">{subtitle}</p> : null}
    </section>
  );
}

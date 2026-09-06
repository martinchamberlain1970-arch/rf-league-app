"use client";

export type LeagueAreaTone = "teal" | "cyan" | "indigo" | "amber" | "fuchsia";

export type LeagueAreaTask = {
  href: string;
  label: string;
  description: string;
  badge?: string;
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  tone: LeagueAreaTone;
  tasks: LeagueAreaTask[];
  aside?: React.ReactNode;
};

const toneStyles: Record<LeagueAreaTone, { accent: string; button: string; badge: string }> = {
  teal: {
    accent: "text-teal-300",
    button: "border-teal-200 hover:border-teal-400 hover:bg-teal-50 focus-visible:ring-teal-500",
    badge: "bg-teal-100 text-teal-800",
  },
  cyan: {
    accent: "text-cyan-300",
    button: "border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50 focus-visible:ring-cyan-500",
    badge: "bg-cyan-100 text-cyan-800",
  },
  indigo: {
    accent: "text-indigo-300",
    button: "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 focus-visible:ring-indigo-500",
    badge: "bg-indigo-100 text-indigo-800",
  },
  amber: {
    accent: "text-amber-300",
    button: "border-amber-200 hover:border-amber-400 hover:bg-amber-50 focus-visible:ring-amber-500",
    badge: "bg-amber-100 text-amber-900",
  },
  fuchsia: {
    accent: "text-fuchsia-300",
    button: "border-fuchsia-200 hover:border-fuchsia-400 hover:bg-fuchsia-50 focus-visible:ring-fuchsia-500",
    badge: "bg-fuchsia-100 text-fuchsia-800",
  },
};

export default function LeagueAreaWorkbench({ eyebrow, title, description, tone, tasks, aside }: Props) {
  const styles = toneStyles[tone];

  return (
    <div className="mb-4 overflow-visible rounded-2xl border border-slate-800 bg-white shadow-sm">
      <div className="overflow-hidden rounded-t-2xl bg-gradient-to-r from-[#081426] via-[#0a2534] to-[#064e4a] px-4 py-5 text-white sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${styles.accent}`}>{eyebrow}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-200">{description}</p>
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      </div>
      <nav aria-label={`${title} tasks`} className="sticky top-2 z-20 grid gap-2 rounded-b-2xl border-t border-slate-100 bg-white/95 p-3 shadow-sm backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
        {tasks.map((task, index) => (
          <a
            key={`${task.href}:${task.label}`}
            href={task.href}
            className={`group rounded-xl border bg-white px-3 py-2.5 outline-none transition focus-visible:ring-2 ${styles.button}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wide text-slate-900">
                <span className="mr-1.5 text-slate-400">{index + 1}.</span>{task.label}
              </span>
              {task.badge ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles.badge}`}>{task.badge}</span> : null}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-600">{task.description}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

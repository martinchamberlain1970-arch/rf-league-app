import Link from "next/link";
import NavigationIcon, { iconForNavigation } from "@/components/NavigationIcon";

export type DashboardAction = {
  href: string;
  title: string;
  detail?: string | null;
  count?: number | null;
};

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", timeZone: "Europe/London",
});

export function oldestWaiting(dates: readonly (string | null | undefined)[]) {
  const oldest = dates.filter((date): date is string => Boolean(date)).toSorted()[0];
  return oldest ? `Oldest waiting since ${shortDate.format(new Date(oldest))}` : null;
}

export default function DashboardActions({ title, actions }: { title: string; actions: DashboardAction[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={title}>
      <h2 className="text-xl font-bold tracking-tight text-slate-950">{title}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {actions.map(({ href, title, detail, count }) => (
          <Link key={href} href={href} className="group flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-teal-400 hover:bg-teal-50/60 focus-visible:outline-2 focus-visible:outline-teal-700">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-800"><NavigationIcon name={iconForNavigation(href)} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-950">{title}</span>
              {detail ? <span className="mt-0.5 block text-xs text-slate-600">{detail}</span> : null}
            </span>
            {count !== undefined ? (
              <span className={count ? "rounded-md bg-teal-900 px-2 py-1 text-xs font-bold text-white" : "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"}>{count ?? "—"}</span>
            ) : null}
            <NavigationIcon name="chevron" className="h-4 w-4 text-slate-500" />
          </Link>
        ))}
      </div>
    </section>
  );
}

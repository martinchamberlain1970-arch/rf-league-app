"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import useAdminStatus from "@/components/useAdminStatus";
import { appRoleLabel } from "@/lib/app-roles";

type NavItem = {
  href: string;
  title: string;
  description: string;
  mark: string;
  ownerOnly?: boolean;
  leagueOfficerOnly?: boolean;
  administratorOnly?: boolean;
};

type NavGroup = {
  title: string;
  description: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    title: "League night",
    description: "The things captains and players use around a fixture.",
    items: [
      { href: "/captain-results", title: "Line-ups & results", description: "Enter line-ups, frame scores and the final result.", mark: "LR" },
      { href: "/reschedule-fixture", title: "Fixture date requests", description: "Request an agreed early date or exceptional postponement.", mark: "FD" },
      { href: "/live-matches", title: "Live matches", description: "Follow league scorecards currently in progress.", mark: "LM" },
      { href: "/league", title: "Fixtures & tables", description: "Find fixtures, standings and player tables.", mark: "FT" },
    ],
  },
  {
    title: "League administration",
    description: "Set up and run the league season.",
    items: [
      { href: "/league-hub", title: "League control centre", description: "Open the guided league-management workspace.", mark: "LC", leagueOfficerOnly: true },
      { href: "/results", title: "Results queue", description: "Review results and fixture-date requests.", mark: "RQ", leagueOfficerOnly: true },
      { href: "/entry-packs", title: "Team registrations", description: "Review and approve current-season team registrations.", mark: "TR", leagueOfficerOnly: true },
      { href: "/players", title: "Players & teams", description: "Find player records, team membership and handicaps.", mark: "PT", leagueOfficerOnly: true },
      { href: "/handicaps", title: "Handicaps", description: "Review published handicaps and playing starts.", mark: "HC" },
      { href: "/rating-audit", title: "Elo review", description: "Audit Elo movement and handicap alignment.", mark: "ER", leagueOfficerOnly: true },
      { href: "/league-invoices", title: "Club invoices", description: "Preview combined league and competition fees.", mark: "CI", leagueOfficerOnly: true },
    ],
  },
  {
    title: "Competitions",
    description: "Entries, draws and additional events.",
    items: [
      { href: "/signups", title: "Competition entries", description: "Enter open competitions and track entry status.", mark: "CE" },
      { href: "/events", title: "Match centre", description: "View fixtures, reports and competition activity.", mark: "MC" },
      { href: "/events/new", title: "Create competition", description: "Create a standalone knockout or league event.", mark: "CC", administratorOnly: true },
      { href: "/high-breaks", title: "High breaks", description: "View the published league high-break table.", mark: "HB" },
    ],
  },
  {
    title: "People, guidance & communications",
    description: "Approvals, notices and reference material.",
    items: [
      { href: "/signup-requests", title: "Access requests", description: "Review account and profile requests.", mark: "AR", leagueOfficerOnly: true },
      { href: "/notifications", title: "Notifications", description: "Read approvals, reminders and system messages.", mark: "NT" },
      { href: "/documents", title: "League documents", description: "Rules, AGM minutes and meeting documents.", mark: "LD" },
      { href: "/league-officer-guide", title: "Officer guides", description: "Responsibilities and operational workflows.", mark: "OG", leagueOfficerOnly: true },
      { href: "/help", title: "Help & user guides", description: "Instructions for using Rack & Frame.", mark: "HG" },
      { href: "/announcements", title: "Announcements", description: "Create and manage league notices.", mark: "AN", leagueOfficerOnly: true },
    ],
  },
  {
    title: "System owner",
    description: "Protected platform, security and data controls.",
    items: [
      { href: "/audit", title: "Audit log", description: "Review the system-owner action trail.", mark: "AL", ownerOnly: true },
      { href: "/usage", title: "Usage analytics", description: "See which areas of the platform are being used.", mark: "UA", ownerOnly: true },
      { href: "/backup", title: "Data management", description: "Backups, restore points and controlled reset.", mark: "DM", ownerOnly: true },
      { href: "/legal", title: "Legal & credits", description: "Privacy, terms, copyright and support details.", mark: "LG" },
    ],
  },
];

type AppNavigationMenuProps = {
  open: boolean;
  onClose: () => void;
  onSignOut: () => void | Promise<void>;
};

export default function AppNavigationMenu({ open, onClose, onSignOut }: AppNavigationMenuProps) {
  const pathname = usePathname();
  const admin = useAdminStatus();
  const [query, setQuery] = useState("");

  const visibleGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.ownerOnly && !admin.isSuper) return false;
          if (item.leagueOfficerOnly && !admin.canManageLeague) return false;
          if (item.administratorOnly && !admin.isAdmin) return false;
          if (!term) return true;
          return `${item.title} ${item.description} ${group.title}`.toLowerCase().includes(term);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [admin.canManageLeague, admin.isAdmin, admin.isSuper, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex bg-slate-950/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Rack & Frame navigation">
      <button type="button" className="min-w-0 flex-1 cursor-default" aria-label="Close navigation" onClick={onClose} />
      <aside className="flex h-full w-full max-w-[540px] flex-col border-l border-white/20 bg-[#f7f9fc] shadow-2xl">
        <div className="bg-gradient-to-br from-[#0b1730] via-[#102746] to-[#073f43] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Rack & Frame</p>
              <h2 className="mt-1 text-2xl font-semibold">App menu</h2>
              <p className="mt-1 text-sm text-slate-300">{appRoleLabel(admin.role)} workspace</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-white/10 text-xl hover:bg-white/20" aria-label="Close navigation">
              ×
            </button>
          </div>
          <label className="mt-5 flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 shadow-inner focus-within:border-cyan-300">
            <span aria-hidden="true" className="text-slate-300">⌕</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a screen or task"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <Link href="/" onClick={onClose} className={`mb-4 flex items-center gap-3 rounded-xl border px-3 py-3 transition ${pathname === "/" ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#0f1a31] text-sm font-bold text-cyan-300">HM</span>
            <span>
              <span className="block text-sm font-semibold text-slate-950">Home dashboard</span>
              <span className="block text-xs text-slate-500">Return to priorities and current work.</span>
            </span>
          </Link>

          <div className="space-y-5">
            {visibleGroups.map((group) => (
              <section key={group.title}>
                <div className="mb-2 px-1">
                  <h3 className="text-sm font-bold text-slate-900">{group.title}</h3>
                  <p className="text-xs text-slate-500">{group.description}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const selected = pathname === item.href || (item.href !== "/" && pathname?.startsWith(`${item.href}/`));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`group flex min-h-24 items-start gap-3 rounded-xl border p-3 transition ${selected ? "border-cyan-400 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"}`}
                      >
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-black ${selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"}`}>{item.mark}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-950">{item.title}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-slate-500">{item.description}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {visibleGroups.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600">No screens match “{query}”.</div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">{appRoleLabel(admin.role)}</p>
            <p className="text-[11px] text-slate-500">Rack &amp; Frame account</p>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
          >
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}

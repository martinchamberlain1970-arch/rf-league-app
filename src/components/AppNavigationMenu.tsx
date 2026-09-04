"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const [selectedGroupTitle, setSelectedGroupTitle] = useState(groups[0].title);

  const visibleGroups = useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.ownerOnly && !admin.isSuper) return false;
          if (item.leagueOfficerOnly && !admin.canManageLeague) return false;
          if (item.administratorOnly && !admin.isAdmin) return false;
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [admin.canManageLeague, admin.isAdmin, admin.isSuper]);

  useEffect(() => {
    if (!open || visibleGroups.length === 0) return;
    const routeGroup = visibleGroups.find((group) =>
      group.items.some((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`))
    );
    if (routeGroup) {
      setSelectedGroupTitle(routeGroup.title);
      return;
    }
    if (!visibleGroups.some((group) => group.title === selectedGroupTitle)) {
      setSelectedGroupTitle(visibleGroups[0].title);
    }
  }, [open, pathname, selectedGroupTitle, visibleGroups]);

  const activeGroup = visibleGroups.find((group) => group.title === selectedGroupTitle) ?? visibleGroups[0];
  const searchTerm = query.trim().toLowerCase();
  const visibleItems = searchTerm
    ? visibleGroups.flatMap((group) => group.items
        .filter((item) => `${item.title} ${item.description} ${group.title}`.toLowerCase().includes(searchTerm))
        .map((item) => ({ ...item, groupTitle: group.title })))
    : (activeGroup?.items ?? []).map((item) => ({ ...item, groupTitle: activeGroup.title }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/55 p-0 backdrop-blur-md sm:p-4 lg:p-7" role="dialog" aria-modal="true" aria-label="Rack & Frame navigation">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Close navigation" onClick={onClose} />
      <aside className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col overflow-hidden bg-[#f7f9fc] shadow-2xl sm:min-h-0 sm:rounded-3xl sm:border sm:border-white/25 lg:h-[calc(100vh-3.5rem)]">
        <div className="shrink-0 bg-gradient-to-br from-[#0b1730] via-[#102746] to-[#073f43] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-white sm:px-7 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Rack & Frame</p>
              <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">Where would you like to go?</h2>
              <p className="mt-1 text-sm text-slate-300">Choose a task from your {appRoleLabel(admin.role).toLowerCase()} workspace.</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-white/10 text-xl hover:bg-white/20" aria-label="Close navigation">
              ×
            </button>
          </div>
          <label className="mt-5 flex max-w-2xl items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 shadow-inner focus-within:border-cyan-300 focus-within:bg-white/15">
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

        <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[260px_minmax(0,1fr)] md:overflow-hidden">
          <nav className="border-b border-slate-200 bg-white p-4 md:overflow-y-auto md:border-b-0 md:border-r md:p-5" aria-label="Main menu sections">
            <Link href="/" onClick={onClose} className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm font-bold transition ${pathname === "/" ? "bg-teal-50 text-teal-900" : "text-slate-800 hover:bg-slate-100"}`}>
              <span>Home dashboard</span>
              <span aria-hidden="true">⌂</span>
            </Link>
            <label className="mt-4 block md:hidden">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Menu section</span>
              <select
                value={activeGroup?.title ?? ""}
                onChange={(event) => {
                  setSelectedGroupTitle(event.target.value);
                  setQuery("");
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900"
              >
                {visibleGroups.map((group) => <option key={group.title} value={group.title}>{group.title}</option>)}
              </select>
            </label>
            <div className="mt-4 hidden space-y-1 md:block">
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Main sections</p>
              {visibleGroups.map((group) => {
                const selected = group.title === activeGroup?.title && !searchTerm;
                return (
                  <button
                    key={group.title}
                    type="button"
                    onClick={() => {
                      setSelectedGroupTitle(group.title);
                      setQuery("");
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${selected ? "bg-[#0f1a31] font-bold text-white shadow-sm" : "font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950"}`}
                  >
                    <span>{group.title}</span>
                    <span aria-hidden="true" className={selected ? "text-cyan-300" : "text-slate-400"}>›</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <section className="min-w-0 p-4 md:overflow-y-auto md:p-6 lg:p-7">
            <div className="border-b border-slate-200 pb-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">{searchTerm ? "Search results" : "Selected section"}</p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">{searchTerm ? `Results for “${query.trim()}”` : activeGroup?.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{searchTerm ? "Select a result below, or clear the search to return to the menu sections." : activeGroup?.description}</p>
            </div>

            <div className="divide-y divide-slate-200">
              {visibleItems.map((item) => {
                const selected = pathname === item.href || (item.href !== "/" && pathname?.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={`${item.groupTitle}-${item.href}`}
                    href={item.href}
                    onClick={onClose}
                    className={`group grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-1 py-4 transition sm:px-3 ${selected ? "bg-teal-50/80" : "hover:bg-white"}`}
                  >
                    <span className="min-w-0">
                      {searchTerm ? <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-teal-700">{item.groupTitle}</span> : null}
                      <span className="block text-sm font-bold text-slate-950 sm:text-base">{item.title}</span>
                      <span className="mt-1 block text-sm leading-5 text-slate-500">{item.description}</span>
                    </span>
                    <span className={`self-center text-2xl ${selected ? "text-teal-700" : "text-slate-300 group-hover:text-teal-600"}`} aria-hidden="true">›</span>
                  </Link>
                );
              })}
            </div>

            {visibleItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-600">No screens match “{query}”.</div>
            ) : null}
          </section>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-7">
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

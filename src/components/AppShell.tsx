"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShellContextProvider } from "@/components/AppShellContext";
import ConfirmModal from "@/components/ConfirmModal";
import useAdminStatus from "@/components/useAdminStatus";
import { appRoleLabel } from "@/lib/app-roles";
import { logAudit } from "@/lib/audit";
import { supabase } from "@/lib/supabase";

type NavigationItem = {
  href: string;
  label: string;
  captainOnly?: boolean;
  officerOnly?: boolean;
  administratorOnly?: boolean;
  ownerOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Match night",
    items: [
      { href: "/captain-results", label: "Line-ups & results", captainOnly: true },
      { href: "/player-additions", label: "Player additions", captainOnly: true },
      { href: "/reschedule-fixture", label: "Request a fixture date", captainOnly: true },
      { href: "/live-matches", label: "Live matches" },
      { href: "/events?view=league", label: "League match centre" },
    ],
  },
  {
    label: "League",
    items: [
      { href: "/league?view=fixtures", label: "Fixtures & results" },
      { href: "/league-hub?tab=table", label: "League tables" },
      { href: "/league-hub?tab=players", label: "Player standings" },
      { href: "/handicaps", label: "Published handicaps" },
      { href: "/high-breaks", label: "High breaks" },
      { href: "/hall-of-fame", label: "Hall of Fame" },
      { href: "/league-hub", label: "Public league hub" },
    ],
  },
  {
    label: "Competitions",
    items: [
      { href: "/signups", label: "Competition entries" },
      { href: "/events", label: "Competition match centre" },
      { href: "/events/new", label: "Create competition", administratorOnly: true },
    ],
  },
  {
    label: "League administration",
    items: [
      { href: "/league?view=guide", label: "League overview", officerOnly: true },
      { href: "/league?view=setup", label: "League setup", officerOnly: true },
      { href: "/league?view=teamManagement", label: "Teams, players & roles", officerOnly: true },
      { href: "/league?view=venues", label: "Venues", officerOnly: true },
      { href: "/league?view=knockouts", label: "Knockout competitions", officerOnly: true },
      { href: "/league?view=handicaps", label: "Manage handicaps", officerOnly: true },
      { href: "/results", label: "Results & approvals", officerOnly: true },
      { href: "/entry-packs", label: "Team registrations", officerOnly: true },
      { href: "/players", label: "Players & team rosters", officerOnly: true },
      { href: "/rating-audit", label: "Elo review", officerOnly: true },
      { href: "/league-invoices", label: "Club invoices", officerOnly: true },
      { href: "/premier-handicap-confirmations", label: "Premier handicap confirmations", officerOnly: true },
      { href: "/handicap-consultation-review", label: "Handicap consultation", officerOnly: true },
      { href: "/egm-voting", label: "EGM voting record", officerOnly: true },
    ],
  },
  {
    label: "People & guidance",
    items: [
      { href: "/signup-requests", label: "Access requests", officerOnly: true },
      { href: "/notifications", label: "Notifications" },
      { href: "/documents", label: "League documents" },
      { href: "/announcements", label: "Announcements", officerOnly: true },
      { href: "/captain-guide", label: "Captain guide" },
      { href: "/league-officer-guide", label: "Officer guides", officerOnly: true },
      { href: "/help", label: "Help & user guides" },
      { href: "/legal", label: "Legal & privacy" },
    ],
  },
  {
    label: "System owner",
    items: [
      { href: "/audit", label: "Audit log", ownerOnly: true },
      { href: "/usage", label: "Usage analytics", ownerOnly: true },
      { href: "/backup", label: "Data management", ownerOnly: true },
    ],
  },
];

const alwaysBarePrefixes = [
  "/auth",
  "/display",
  "/league-entry",
  "/entry-pack",
  "/competition-entry",
  "/league-invoice",
  "/handicap-consultation/",
  "/premier-handicaps/",
  "/egm-vote/",
  "/hall-of-fame",
  "/offline",
];

function isAlwaysBarePath(pathname: string) {
  return alwaysBarePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function hrefPath(href: string) {
  return href.split("?")[0];
}

function itemMatchesPath(pathname: string, currentSearch: string, href: string) {
  const target = hrefPath(href);
  const pathMatches = pathname === target || (target !== "/" && pathname.startsWith(`${target}/`));
  if (!pathMatches) return false;
  const expected = new URLSearchParams(href.split("?")[1] ?? "");
  const current = new URLSearchParams(currentSearch);
  const expectedEntries = Array.from(expected.entries());
  if (expectedEntries.length > 0) return expectedEntries.every(([key, value]) => current.get(key) === value);
  if ((target === "/events" || target === "/league") && current.get("view")) return false;
  if (target === "/league-hub" && current.get("tab")) return false;
  return true;
}

function pageDetails(pathname: string, currentSearch: string, groups: NavigationGroup[]) {
  if (pathname === "/") return { group: "Home", label: "Dashboard" };
  for (const group of groups) {
    const item = group.items.find((candidate) => itemMatchesPath(pathname, currentSearch, candidate.href));
    if (item) return { group: group.label, label: item.label };
  }
  return { group: "Rack & Frame", label: "League workspace" };
}

function NavigationContent({
  groups,
  pathname,
  currentSearch,
  roleLabel,
  teamNames,
  onNavigate,
  onSignOut,
}: {
  groups: NavigationGroup[];
  pathname: string;
  currentSearch: string;
  roleLabel: string;
  teamNames: string[];
  onNavigate: (href: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
  onSignOut: () => void;
}) {
  const activeGroupLabel = groups.find((group) => group.items.some((item) => itemMatchesPath(pathname, currentSearch, item.href)))?.label;
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => activeGroupLabel ? [activeGroupLabel] : [groups[0]?.label].filter(Boolean));

  useEffect(() => {
    if (!activeGroupLabel) return;
    setExpandedGroups((current) => current.includes(activeGroupLabel) ? current : [activeGroupLabel]);
  }, [activeGroupLabel]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b1730] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/" onClick={(event) => onNavigate("/", event)} className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-teal-500 text-xs font-black text-[#0b1730] shadow-lg shadow-cyan-950/30">R&amp;F</span>
          <span>
            <span className="block text-sm font-black tracking-wide">Rack &amp; Frame</span>
            <span className="block text-xs text-slate-400">League Manager</span>
          </span>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        <Link
          href="/"
          onClick={(event) => onNavigate("/", event)}
          aria-current={pathname === "/" ? "page" : undefined}
          className={`mb-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold ${pathname === "/" ? "bg-cyan-300 text-[#0b1730]" : "text-slate-200 hover:bg-white/10"}`}
        >
          <span aria-hidden="true">⌂</span>
          Dashboard
        </Link>

        <div className="space-y-1">
          {groups.map((group) => {
            const expanded = expandedGroups.includes(group.label);
            const containsActive = group.label === activeGroupLabel;
            return (
              <section key={group.label} className="rounded-xl">
                <h2>
                  <button
                    type="button"
                    onClick={() => setExpandedGroups((current) => current.includes(group.label)
                      ? current.filter((label) => label !== group.label)
                      : [...current, group.label])}
                    aria-expanded={expanded}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.13em] transition ${containsActive ? "text-cyan-200" : "text-slate-400 hover:bg-white/8 hover:text-slate-200"}`}
                  >
                    <span>{group.label}</span>
                    <span aria-hidden="true" className="text-base leading-none">{expanded ? "−" : "+"}</span>
                  </button>
                </h2>
                {expanded ? <div className="mb-2 space-y-0.5 border-l border-white/10 pl-2">
                  {group.items.map((item) => {
                    const active = itemMatchesPath(pathname, currentSearch, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(event) => onNavigate(item.href, event)}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/14 font-bold text-cyan-200 ring-1 ring-white/10" : "font-medium text-slate-300 hover:bg-white/8 hover:text-white"}`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div> : null}
              </section>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-bold text-white">{roleLabel}</p>
        {teamNames.length > 0 ? <p className="mt-0.5 truncate text-xs text-slate-400">{teamNames.join(", ")}</p> : <p className="mt-0.5 text-xs text-slate-400">Rack &amp; Frame account</p>}
        <button type="button" onClick={onSignOut} className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2 text-left text-xs font-bold text-slate-200 hover:border-rose-300/50 hover:bg-rose-400/10 hover:text-rose-100">
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const admin = useAdminStatus();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCaptain, setIsCaptain] = useState(false);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [guard, setGuard] = useState({ enabled: false, message: "You have unsaved changes. Leave this screen?" });
  const [pendingAction, setPendingAction] = useState<{ type: "href"; href: string } | { type: "back" } | null>(null);

  const enabled = !isAlwaysBarePath(pathname) && Boolean(admin.userId);
  const canManageLeague = admin.canManageLeague;
  const isAdministrator = admin.isAdmin;

  useEffect(() => {
    if (!enabled || canManageLeague || isAdministrator || !admin.userId) {
      setIsCaptain(false);
      setTeamNames([]);
      return;
    }
    let active = true;
    const loadRole = async () => {
      const client = supabase;
      if (!client) return;
      const userRes = await client.from("app_users").select("linked_player_id").eq("id", admin.userId).maybeSingle();
      const playerId = userRes.data?.linked_player_id as string | null | undefined;
      if (!playerId || !active) return;
      const seasonRes = await client.from("league_seasons").select("id").eq("is_active", true).eq("is_completed", false);
      const seasonIds = ((seasonRes.data ?? []) as Array<{ id: string }>).map((season) => season.id);
      if (!active) return;
      type Membership = { team_id: string; is_captain: boolean; is_vice_captain?: boolean | null };
      let memberships: Membership[] = [];
      let teamTable = "league_teams";
      if (seasonIds.length > 0) {
        const memberRes = await client
          .from("league_team_members")
          .select("team_id,is_captain,is_vice_captain")
          .eq("player_id", playerId)
          .in("season_id", seasonIds);
        if (!memberRes.error) memberships = (memberRes.data ?? []) as Membership[];
      }
      if (memberships.length === 0) {
        const registeredMemberRes = await client
          .from("league_registered_team_members")
          .select("team_id,is_captain,is_vice_captain")
          .eq("player_id", playerId);
        if (!registeredMemberRes.error) {
          memberships = (registeredMemberRes.data ?? []) as Membership[];
          teamTable = "league_registered_teams";
        }
      }
      const captainMemberships = memberships.filter((membership) => membership.is_captain || Boolean(membership.is_vice_captain));
      const teamIds = Array.from(new Set(captainMemberships.map((membership) => membership.team_id)));
      let names: string[] = [];
      if (teamIds.length > 0) {
        const teamsRes = await client.from(teamTable).select("id,name").in("id", teamIds);
        const nameById = new Map(((teamsRes.data ?? []) as Array<{ id: string; name: string }>).map((team) => [team.id, team.name]));
        names = teamIds.map((teamId) => nameById.get(teamId)).filter(Boolean) as string[];
      }
      if (active) {
        setIsCaptain(captainMemberships.length > 0);
        setTeamNames(names);
      }
    };
    void loadRole();
    return () => {
      active = false;
    };
  }, [admin.userId, canManageLeague, enabled, isAdministrator]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  const visibleGroups = useMemo(() => navigationGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => canManageLeague && item.href === "/reschedule-fixture"
          ? { ...item, href: "/results?tab=fixture_changes", label: "Fixture date approvals", captainOnly: false }
          : item)
        .filter((item) => {
          if (item.ownerOnly && !admin.isSuper) return false;
          if (item.officerOnly && !canManageLeague) return false;
          if (item.administratorOnly && !isAdministrator) return false;
          if (item.captainOnly && !isCaptain && !canManageLeague) return false;
          return true;
        }),
    }))
    .filter((group) => group.items.length > 0), [admin.isSuper, canManageLeague, isAdministrator, isCaptain]);

  const details = useMemo(() => pageDetails(pathname, currentSearch, visibleGroups), [currentSearch, pathname, visibleGroups]);
  const roleLabel = isCaptain && !canManageLeague ? "Captain / Vice-captain" : appRoleLabel(admin.role);

  const registerNavigationGuard = useCallback((guardEnabled: boolean, message: string) => {
    setGuard({ enabled: guardEnabled, message });
    return () => setGuard((current) => current.message === message ? { ...current, enabled: false } : current);
  }, []);

  const completeNavigation = useCallback((action: { type: "href"; href: string } | { type: "back" }) => {
    setMobileOpen(false);
    if (action.type === "back") router.back();
    else router.push(action.href);
  }, [router]);

  const requestNavigation = useCallback((href: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (guard.enabled) {
      event.preventDefault();
      setPendingAction({ type: "href", href });
      return;
    }
    setMobileOpen(false);
  }, [guard.enabled]);

  const requestBack = useCallback(() => {
    if (guard.enabled) setPendingAction({ type: "back" });
    else router.back();
  }, [guard.enabled, router]);

  const onSignOut = useCallback(async () => {
    await logAudit("auth_sign_out", { entityType: "auth", summary: "User signed out." });
    if (supabase) await supabase.auth.signOut();
    router.replace("/auth/sign-in");
  }, [router]);

  const contextValue = useMemo(() => ({
    enabled,
    openNavigation: () => setMobileOpen(true),
    registerNavigationGuard,
  }), [enabled, registerNavigationGuard]);

  if (!enabled) {
    return <AppShellContextProvider value={contextValue}>{children}</AppShellContextProvider>;
  }

  return (
    <AppShellContextProvider value={contextValue}>
      <div className="rf-app-shell min-h-screen bg-[var(--rf-canvas)]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-slate-800 lg:block">
          <NavigationContent groups={visibleGroups} pathname={pathname} currentSearch={currentSearch} roleLabel={roleLabel} teamNames={teamNames} onNavigate={requestNavigation} onSignOut={() => void onSignOut()} />
        </aside>

        <div className="min-h-screen lg:pl-72">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur sm:px-5">
            <button type="button" onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800 lg:hidden" aria-label="Open navigation">☰</button>
            <button type="button" onClick={requestBack} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50" aria-label="Go back">←</button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Home / {details.group}</p>
              <p className="truncate text-sm font-black text-slate-950 sm:text-base">{details.label}</p>
            </div>
            <Link href="/notifications" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-sm hover:border-teal-300 hover:bg-teal-50" aria-label="Notifications">🔔</Link>
            <div className="hidden text-right md:block">
              <p className="text-xs font-bold text-slate-900">{roleLabel}</p>
              {teamNames.length > 0 ? <p className="max-w-52 truncate text-[11px] text-slate-500">{teamNames.join(", ")}</p> : null}
            </div>
          </header>
          <div>{children}</div>
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-[80] bg-[#0b1730] lg:hidden" role="dialog" aria-modal="true" aria-label="Rack & Frame navigation">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-white/10 text-xl text-white" aria-label="Close navigation">×</button>
            <NavigationContent groups={visibleGroups} pathname={pathname} currentSearch={currentSearch} roleLabel={roleLabel} teamNames={teamNames} onNavigate={requestNavigation} onSignOut={() => void onSignOut()} />
          </div>
        ) : null}

        <ConfirmModal
          open={Boolean(pendingAction)}
          title="Unsaved changes"
          description={guard.message}
          confirmLabel="Leave screen"
          cancelLabel="Stay"
          onConfirm={() => {
            if (pendingAction) completeNavigation(pendingAction);
            setPendingAction(null);
          }}
          onCancel={() => setPendingAction(null)}
        />
      </div>
    </AppShellContextProvider>
  );
}

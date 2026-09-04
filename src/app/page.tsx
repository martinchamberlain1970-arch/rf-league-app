"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import PageNav from "@/components/PageNav";
import useAdminStatus from "@/components/useAdminStatus";
import { appRoleLabel } from "@/lib/app-roles";
import { supabase } from "@/lib/supabase";
import ConfirmModal from "@/components/ConfirmModal";
import useFeatureAccess from "@/components/useFeatureAccess";
import ImportantAnnouncementBanner from "@/components/ImportantAnnouncementBanner";

const links = [
  { href: "/players", title: "Players", desc: "View and manage player records." },
  { href: "/quick-match", title: "Quick Match", desc: "Optional module: create ad-hoc practice matches." },
  { href: "/events/new", title: "Create Competition", desc: "Optional module: create standalone knockout or league events." },
  { href: "/league", title: "League Manager", desc: "Set up teams, fixtures, and league table." },
  { href: "/live-matches", title: "Live Matches", desc: "Follow tonight's live league scorecards inside the app." },
  { href: "/handicaps", title: "Handicaps", desc: "See the snooker handicap list and how starts are worked out." },
  { href: "/high-breaks", title: "High Breaks", desc: "View the published league high-break table." },
  { href: "/captain-results", title: "Lineups & Results", desc: "Enter your pre-match lineup first, then submit your fixture result for approval." },
  { href: "/reschedule-fixture", title: "Reschedule Fixture", desc: "Request permission to play early or, exceptionally, later." },
  { href: "/events", title: "Match Centre", desc: "View your fixtures, reports, and competition activity." },
  { href: "/signups", title: "Competition Sign-ups", desc: "Enter open competitions and track entry status." },
  { href: "/documents", title: "Documents", desc: "Upload and read AGM minutes, rules, and captain meeting notes." },
  { href: "/backup", title: "Data Management", desc: "Backup, restore, and controlled data reset." },
  { href: "/audit", title: "Audit Log", desc: "System Owner action trail across the platform." },
  { href: "/rating-audit", title: "Elo Audit", desc: "League-officer review of Elo, handicap alignment, and rated-frame counts." },
  { href: "/signup-requests", title: "Signup Requests", desc: "Review new-account profile and location requests." },
  { href: "/entry-packs", title: "League Team Registrations", desc: "Share one public registration form, track team progress and import submitted rosters." },
  { href: "/league-invoices", title: "Club Invoices", desc: "Preview and generate combined club invoices for league teams and competition entries." },
  { href: "/league-officer-guide", title: "League Officer Guides", desc: "Secretary, Chairman and Treasurer responsibilities, approvals and finance workflows." },
  { href: "/usage", title: "Usage Analytics", desc: "System Owner page-usage summary." },
  { href: "/results", title: "Results Queue", desc: "Review and approve submitted results." },
  { href: "/notifications", title: "Notifications", desc: "Read and manage your inbox notifications." },
  { href: "/live", title: "Live Overview", desc: "In-progress overview of active events." },
  { href: "/stats", title: "Stats", desc: "Player and matchup stats." },
  { href: "/announcements", title: "Announcements", desc: "League-officer control for banner notices." },
  { href: "/help", title: "User Guide", desc: "How to use the app." },
  { href: "/legal", title: "Legal & Credits", desc: "Legal and support information." },
];

type PriorityTone = "rose" | "indigo" | "amber" | "emerald" | "sky" | "violet";
type PriorityCard = {
  href: string;
  title: string;
  value: number;
  tone: PriorityTone;
  detail: string;
  displayValue?: string | null;
  compactDisplay?: boolean;
};
type SiteAnnouncement = { id?: string; title?: string | null; body?: string | null; is_active?: boolean | null; updated_at?: string | null };

function isLineupWindowLive(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const start = new Date(`${fixtureDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return false;
  const hardStop = new Date(start);
  hardStop.setDate(hardStop.getDate() + 1);
  hardStop.setHours(1, 0, 0, 0);
  const now = new Date();
  return now >= start && now <= hardStop;
}

export default function HomePage() {
  const router = useRouter();
  const admin = useAdminStatus();
  const features = useFeatureAccess();
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userPlayerId, setUserPlayerId] = useState<string | null>(null);
  const [userMissingAvatar, setUserMissingAvatar] = useState(false);
  const [userMissingDob, setUserMissingDob] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [pendingClaim, setPendingClaim] = useState<{ id: string; name: string } | null>(null);
  const [claimStatusOpen, setClaimStatusOpen] = useState(false);
  const [pendingAdminRequest, setPendingAdminRequest] = useState<{ id: string; createdAt: string } | null>(null);
  const [openEventsCount, setOpenEventsCount] = useState<number | null>(null);
  const [resultsQueueCount, setResultsQueueCount] = useState<number | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number | null>(null);
  const [pendingRequestsHref, setPendingRequestsHref] = useState("/notifications");
  const [pendingResultSubmissionsCount, setPendingResultSubmissionsCount] = useState<number>(0);
  const [fixtureChangeActionCount, setFixtureChangeActionCount] = useState<number>(0);
  const [outstandingFixtureCount, setOutstandingFixtureCount] = useState<number>(0);
  const [tonightLineupCount, setTonightLineupCount] = useState<number>(0);
  const [tonightLineupLabel, setTonightLineupLabel] = useState<string | null>(null);
  const [tonightLineupHref, setTonightLineupHref] = useState("/captain-results");
  const [leagueRole, setLeagueRole] = useState<{ isCaptain: boolean; isViceCaptain: boolean; teamNames: string[] }>({
    isCaptain: false,
    isViceCaptain: false,
    teamNames: [],
  });
  const [pendingFeatureRequests, setPendingFeatureRequests] = useState<Set<string>>(new Set());
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [showCaptainGuidePrompt, setShowCaptainGuidePrompt] = useState(false);
  const [announcement, setAnnouncement] = useState<SiteAnnouncement | null>(null);
  const [dashboardQuery, setDashboardQuery] = useState("");
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    resolve?: (value: boolean) => void;
  }>({ open: false, title: "", description: "" });

  const isVisibleLink = (href: string) => {
    if (admin.loading) return true;
    if (admin.isSuper) {
      return [
        "/league",
        "/live-matches",
        "/handicaps",
        "/players",
        "/signup-requests",
        "/entry-packs",
        "/league-invoices",
        "/league-officer-guide",
        "/high-breaks",
        "/signups",
        "/documents",
        "/notifications",
        "/results",
        "/reschedule-fixture",
        "/audit",
        "/rating-audit",
        "/usage",
        "/backup",
        "/announcements",
        "/help",
        "/legal",
      ].includes(href);
    }
    if (!admin.isSuper && (href === "/audit" || href === "/usage")) return false;
    if ((href === "/rating-audit" || href === "/signup-requests") && !admin.canManageLeague) return false;
    if (href === "/entry-packs" && !admin.canManageLeague) return false;
    if (href === "/league-invoices" && !admin.canManageLeague) return false;
    if (href === "/league-officer-guide" && !admin.canManageLeague) return false;
    if (href === "/announcements" && !admin.canManageLeague) return false;
    if (admin.isAdmin) {
      // Admins still see these cards, but they can be disabled per-account.
      return true;
    }
    return ["/events", "/league", "/live-matches", "/handicaps", "/high-breaks", "/captain-results", "/reschedule-fixture", "/signups", "/documents", "/help", "/legal", "/notifications"].includes(href);
  };

  const visibleLinks = links.filter((item) => isVisibleLink(item.href));
  const quickMatchAllowed = admin.canManageLeague || (admin.isAdmin && features.quickMatchEnabled);
  const createCompetitionAllowed = admin.canManageLeague || (admin.isAdmin && features.competitionCreateEnabled);
  const isDisabledAdminFeature = (href: string) =>
    admin.isAdmin &&
    !admin.isSuper &&
    ((href === "/quick-match" && !quickMatchAllowed) || (href === "/events/new" && !createCompetitionAllowed));
  const hasPendingFeatureRequest = (href: string) =>
    (href === "/quick-match" && pendingFeatureRequests.has("quick_match")) ||
    (href === "/events/new" && pendingFeatureRequests.has("competition_create"));

  const primaryHrefs = admin.isSuper
      ? ["/entry-packs", "/league-invoices", "/signup-requests", "/players", "/notifications", "/league", "/results", "/reschedule-fixture", "/rating-audit", "/backup", "/signups", "/announcements", "/legal"]
    : admin.canManageLeague
      ? ["/league", "/entry-packs", "/league-invoices", "/results", "/league-officer-guide", "/reschedule-fixture", "/handicaps", "/rating-audit", "/players", "/signup-requests", "/signups", "/documents", "/announcements", "/notifications", "/live-matches", "/high-breaks", "/help", "/legal"]
    : admin.isAdmin
      ? ["/league", "/live-matches", "/handicaps", "/high-breaks", "/captain-results", "/reschedule-fixture", "/events", "/quick-match", "/events/new", "/signups", "/help", "/legal"]
      : ["/league", "/live-matches", "/handicaps", "/high-breaks", "/captain-results", "/reschedule-fixture", "/events", "/notifications", "/signups", "/help", "/legal"];
  const quickAccessHrefs = admin.isSuper
    ? ["/audit", "/rating-audit", "/usage"]
    : admin.isAdmin
      ? ["/results", "/notifications", "/live", "/stats"]
      : [];
  const primaryLinks = visibleLinks.filter((item) => primaryHrefs.includes(item.href));
  const quickAccessLinks = visibleLinks.filter((item) => quickAccessHrefs.includes(item.href));
  const moreLinks = visibleLinks.filter((item) => !primaryHrefs.includes(item.href) && !quickAccessHrefs.includes(item.href));
  const mainTabLinks = [...primaryLinks, ...moreLinks];
  const leagueRequestsTile =
    admin.canManageLeague && pendingRequestsCount !== null
      ? {
          href: pendingRequestsHref,
          title: "Pending League Requests",
          desc: `${pendingRequestsCount} request${pendingRequestsCount === 1 ? "" : "s"} awaiting review.`,
        }
      : null;
  const mainTabLinksWithGovernance = leagueRequestsTile ? [leagueRequestsTile, ...mainTabLinks] : mainTabLinks;
  const compactSuper = admin.isSuper;
  const cardBaseClass = `mx-4 rounded-2xl border border-slate-200 bg-white shadow-sm sm:mx-0 ${compactSuper ? "p-2.5" : "p-3 sm:p-4"}`;
  const subtleCardClass = `mx-4 rounded-2xl border border-slate-200 bg-white shadow-sm sm:mx-0 ${compactSuper ? "p-3" : "p-3 sm:p-4"}`;
  const primaryTileBadgeText = (href: string) => {
    if (href === "/results?tab=fixture_changes" && admin.canManageLeague) {
      return fixtureChangeActionCount > 0 ? `${fixtureChangeActionCount} to review` : "Open";
    }
    if (href === "/reschedule-fixture" && !admin.canManageLeague) {
      return outstandingFixtureCount > 0 ? `${outstandingFixtureCount} outstanding` : "Open";
    }
    return "Open";
  };
  const resolvedMainTabLinks = useMemo(
    () =>
      mainTabLinksWithGovernance.map((item) => {
        if (item.href !== "/reschedule-fixture") return item;
        if (admin.canManageLeague) {
          return {
            ...item,
            href: "/results?tab=fixture_changes",
            title: "Fixtures To Be Rescheduled",
            desc: `${fixtureChangeActionCount} fixture${fixtureChangeActionCount === 1 ? "" : "s"} awaiting review or agreed dates.`,
          };
        }
        return {
          ...item,
          title: "Fixture Date Requests",
          desc:
            outstandingFixtureCount > 0
              ? `${outstandingFixtureCount} fixture${outstandingFixtureCount === 1 ? "" : "s"} currently pending review or a new agreed date.`
              : "Request early play or track fixtures waiting for a new agreed date.",
        };
      }),
    [mainTabLinksWithGovernance, admin.canManageLeague, fixtureChangeActionCount, outstandingFixtureCount]
  );
  const groupedDashboardLinks = useMemo(() => {
    const term = dashboardQuery.trim().toLowerCase();
    const unique = new Map<string, (typeof resolvedMainTabLinks)[number]>();
    [...resolvedMainTabLinks, ...quickAccessLinks].forEach((item) => unique.set(`${item.href}|${item.title}`, item));
    const allItems = Array.from(unique.values()).filter((item) =>
      !term || `${item.title} ${item.desc}`.toLowerCase().includes(term)
    );
    const matches = (item: (typeof resolvedMainTabLinks)[number], prefixes: string[]) =>
      prefixes.some((prefix) => item.href === prefix || item.href.startsWith(`${prefix}?`) || item.href.startsWith(`${prefix}/`));
    const definitions = [
      {
        title: "Run the league",
        description: "Seasons, teams, fixtures, results, players, handicaps and finance.",
        prefixes: ["/league", "/entry-packs", "/results", "/players", "/handicaps", "/rating-audit"],
      },
      {
        title: "Competitions & match information",
        description: "Competition entries, live play, published records and documents.",
        prefixes: ["/signups", "/events", "/live-matches", "/high-breaks", "/documents", "/quick-match"],
      },
      {
        title: "People & communications",
        description: "Requests, notifications, announcements and role guidance.",
        prefixes: ["/signup-requests", "/notifications", "/announcements", "/league-officer-guide", "/help"],
      },
      {
        title: "System owner",
        description: "Protected audit, usage, data-management and legal controls.",
        prefixes: ["/audit", "/usage", "/backup", "/legal"],
      },
    ];
    const assigned = new Set<string>();
    const grouped = definitions.map((definition) => {
      const items = allItems.filter((item) => {
        const key = `${item.href}|${item.title}`;
        if (assigned.has(key) || !matches(item, definition.prefixes)) return false;
        assigned.add(key);
        return true;
      });
      return { ...definition, items };
    });
    const remaining = allItems.filter((item) => !assigned.has(`${item.href}|${item.title}`));
    if (remaining.length) {
      grouped.push({ title: "More tools", description: "Additional tools available to your account.", prefixes: [], items: remaining });
    }
    return grouped.filter((group) => group.items.length > 0);
  }, [dashboardQuery, quickAccessLinks, resolvedMainTabLinks]);
  const cardDescription = (href: string, fallback: string) => {
    if (href === "/league") {
      if (admin.canManageLeague) return "Set up leagues, teams, venues, fixtures, and approvals.";
      if (admin.isAdmin) return "View published fixtures/tables and review your team's submission progress.";
      return "View published fixtures, league table, and player table.";
    }
    if (href === "/captain-results") {
      if (admin.canManageLeague) return "Review what captains submit and confirm final results.";
      return "If you're captain or vice-captain, enter your lineup on match day and submit the result after the fixture.";
    }
    if (href === "/reschedule-fixture") {
      return "Request permission to play before the league date or, exceptionally, later.";
    }
    if (href === "/results?tab=fixture_changes") {
      return "Review fixture-date requests and set agreed dates for approved outstanding fixtures.";
    }
    if (href === "/players") {
      return admin.canManageLeague ? "Review player profiles, claims and requested updates." : "View your own player profile and status.";
    }
    if (href === "/entry-packs") {
      return "Share one no-login league-registration URL, then track, review and import each team’s players and captain roles.";
    }
    if (href === "/league-invoices") {
      return "Combine league team fees and approved competition entries into one previewable invoice per club.";
    }
    if (href === "/events/new") {
      return admin.canManageLeague
        ? "Create competitions and publish for player sign-up."
        : "Feature access can be enabled by the System Owner.";
    }
    if (href === "/quick-match") {
      return admin.canManageLeague
        ? "Create ad-hoc matches for practice and tracking."
        : "Feature access can be enabled by the System Owner.";
    }
    if (href === "/signups") {
      return admin.isSuper
        ? "Open/close cup entries and review entrants."
        : "Enter knockout cups and track approval status.";
    }
    if (href === "/high-breaks") {
      return "View recorded 30+ breaks and the published league high-break table.";
    }
    if (href === "/legal") {
      return "Privacy policy, terms, and app credits.";
    }
    return fallback;
  };
  const hasCaptainRole = leagueRole.isCaptain || leagueRole.isViceCaptain;
  const roleGuideLabel = hasCaptainRole
    ? leagueRole.isCaptain && leagueRole.isViceCaptain
      ? "Captain / Vice-captain"
      : leagueRole.isCaptain
        ? "Captain"
        : "Vice-captain"
    : "Player";
  const priorityCards = useMemo<PriorityCard[]>(() => {
    if (admin.canManageLeague) {
      return [
        {
          href: "/results",
          title: "Results Awaiting Review",
          value: resultsQueueCount ?? 0,
          tone: "rose",
          detail: "Approve captain submissions and locked result decisions.",
        },
        {
          href: "/results?tab=fixture_changes",
          title: "Fixture Date Requests",
          value: fixtureChangeActionCount,
          tone: "indigo",
          detail: "Review early-play and exceptional postponement requests.",
        },
        {
          href: pendingRequestsHref,
          title: "Pending League Requests",
          value: pendingRequestsCount ?? 0,
          tone: "amber",
          detail: "Team registrations, profile claims, location requests, and participant updates awaiting review.",
        },
      ];
    }
    if (hasCaptainRole) {
      return [
        {
          href: tonightLineupHref,
          title: "Tonight's Lineup",
          value: tonightLineupCount,
          tone: "emerald",
          displayValue: tonightLineupCount > 0 ? tonightLineupLabel ?? String(tonightLineupCount) : "Ready",
          compactDisplay: true,
          detail:
            tonightLineupCount > 0
              ? "A live fixture is waiting for lineup action from your side."
              : "Open your fixture to enter the pre-match lineup first, then submit the result later.",
        },
        {
          href: "/reschedule-fixture",
          title: "Fixture Date Requests",
          value: outstandingFixtureCount,
          tone: "indigo",
          displayValue: outstandingFixtureCount > 0 ? String(outstandingFixtureCount) : "None",
          detail:
            outstandingFixtureCount > 0
              ? "A fixture is waiting for review or a new agreed date."
              : "Request early play or track an approved outstanding fixture.",
        },
        {
          href: "/events",
          title: "Match Centre",
          value: openEventsCount ?? 0,
          tone: "sky",
          displayValue: (openEventsCount ?? 0) > 0 ? String(openEventsCount ?? 0) : "View",
          detail: "Check next fixtures, reports, and competition activity.",
        },
      ];
    }
    return [
      {
        href: "/league",
        title: "Published League",
        value: openEventsCount ?? 0,
        tone: "indigo",
        displayValue: "View",
        compactDisplay: true,
        detail: "View the latest league fixtures, table, and player standings.",
      },
      {
        href: "/notifications",
        title: "Notifications",
        value: pendingResultSubmissionsCount,
        tone: "violet",
        displayValue: pendingResultSubmissionsCount > 0 ? String(pendingResultSubmissionsCount) : "None",
        compactDisplay: true,
        detail: "Track profile, result, and competition updates in one place.",
      },
      {
        href: "/events",
        title: "Match Centre",
        value: openEventsCount ?? 0,
        tone: "sky",
        displayValue: "View",
        compactDisplay: true,
        detail: "See your upcoming fixtures and published competition activity.",
      },
    ];
  }, [
    admin.canManageLeague,
    fixtureChangeActionCount,
    hasCaptainRole,
    openEventsCount,
    outstandingFixtureCount,
    pendingRequestsCount,
    pendingRequestsHref,
    pendingResultSubmissionsCount,
    resultsQueueCount,
    tonightLineupCount,
    tonightLineupHref,
    tonightLineupLabel,
  ]);
  const priorityCardClass = (tone: PriorityTone) => {
    if (tone === "rose") return "border-rose-200 bg-gradient-to-br from-rose-50 to-white";
    if (tone === "indigo") return "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white";
    if (tone === "amber") return "border-amber-200 bg-gradient-to-br from-amber-50 to-white";
    if (tone === "emerald") return "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white";
    if (tone === "sky") return "border-sky-200 bg-gradient-to-br from-sky-50 to-white";
    return "border-violet-200 bg-gradient-to-br from-violet-50 to-white";
  };
  const priorityValueClass = (tone: PriorityTone) => {
    if (tone === "rose") return "text-rose-700";
    if (tone === "indigo") return "text-indigo-700";
    if (tone === "amber") return "text-amber-700";
    if (tone === "emerald") return "text-emerald-700";
    if (tone === "sky") return "text-sky-700";
    return "text-violet-700";
  };
  const accountStatusText = userPlayerId
    ? "Your player profile is linked and active."
    : pendingClaim
      ? "Your profile claim is pending review."
      : "No linked player profile yet. Complete profile check to continue.";
  const welcomeName = admin.isSuper
    ? "Martin"
    : userName?.trim().split(/\s+/)[0] || appRoleLabel(admin.role);

  const handleNavClick = async (e: React.MouseEvent, href: string) => {
    void e;
    void href;
  };

  const requestFeatureAccess = async (feature: "quick_match" | "competition_create") => {
    const client = supabase;
    if (!client) return;
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setProfileMessage("You must be signed in.");
      return;
    }
    const resp = await fetch("/api/admin/feature-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "submit", feature }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setProfileMessage(data?.error ?? "Failed to submit request.");
      return;
    }
    setPendingFeatureRequests((prev) => new Set([...prev, feature]));
    setProfileMessage(
      `${feature === "quick_match" ? "Quick Match" : "Create Competition"} access request submitted for System Owner approval.`
    );
  };

  const askConfirm = (title: string, description: string, confirmLabel = "Confirm", cancelLabel = "Cancel") =>
    new Promise<boolean>((resolve) => {
      setConfirmState({ open: true, title, description, confirmLabel, cancelLabel, resolve });
    });

  const closeConfirm = (result: boolean) => {
    const resolver = confirmState.resolve;
    setConfirmState({ open: false, title: "", description: "" });
    resolver?.(result);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const complete = params.get("complete");
    const event = params.get("event");
    const winner = params.get("winner");
    if (complete === "1" && event && winner) {
      setCompletionMessage(`${event} is now complete. Winner: ${winner}.`);
      params.delete("complete");
      params.delete("event");
      params.delete("winner");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
      return;
    }
    setCompletionMessage(null);
  }, []);

  useEffect(() => {
    const common = [
      "/quick-match",
      "/events",
      "/events/new",
      "/league",
      "/signups",
      "/players",
      "/results",
      "/signup-requests",
      "/notifications",
      "/stats",
      "/live",
      "/rules",
      "/help",
      "/handicaps",
      "/reschedule-fixture",
      "/legal",
    ];
    common.forEach((path) => router.prefetch(path));
  }, [router]);

  useEffect(() => {
    const run = async () => {
      const client = supabase;
      if (!client) return;
      const { data } = await client.auth.getUser();
      const userId = data.user?.id;
      setUserEmail(data.user?.email ?? null);
      if (!userId) return;
      if (admin.isSuper) {
        setUserName(null);
        setUserPlayerId(null);
        setPendingClaim(null);
        setPendingAdminRequest(null);
        return;
      }
      const linkRes = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
      const linkedPlayerId = linkRes.data?.linked_player_id ?? null;
      const { data: player } = linkedPlayerId
        ? await client
            .from("players")
            .select("id,display_name,full_name,location_id,avatar_url,date_of_birth")
            .eq("id", linkedPlayerId)
            .maybeSingle()
        : await client
            .from("players")
            .select("id,display_name,full_name,location_id,avatar_url,date_of_birth")
            .eq("claimed_by", userId)
            .maybeSingle();
      const name = player?.full_name?.trim() ? player.full_name : player?.display_name ?? null;
      setUserName(name);
      setUserPlayerId(player?.id ?? null);
      setUserMissingAvatar(Boolean(player?.id) && !player?.avatar_url);
      setUserMissingDob(Boolean(player?.id) && !player?.date_of_birth);
      const { data: pending } = await client
        .from("player_claim_requests")
        .select("id,requested_full_name,player_id,status")
        .eq("requester_user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      const pendingRow = pending?.[0];
      const pendingName = pendingRow?.requested_full_name ?? null;
      setPendingClaim(pendingRow && pendingName ? { id: pendingRow.id, name: pendingName } : null);
      const { data: pendingAdmin } = await client
        .from("admin_requests")
        .select("id,created_at,status")
        .eq("requester_user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      const adminRow = pendingAdmin?.[0] as { id: string; created_at: string } | undefined;
      setPendingAdminRequest(adminRow ? { id: adminRow.id, createdAt: adminRow.created_at } : null);

    };
    run();
  }, [admin.isSuper]);

  useEffect(() => {
    const run = async () => {
      const client = supabase;
      if (!client || admin.loading || admin.isSuper || !userPlayerId) {
        setLeagueRole({ isCaptain: false, isViceCaptain: false, teamNames: [] });
        return;
      }
      const membersRes = await client
        .from("league_registered_team_members")
        .select("team_id,is_captain,is_vice_captain")
        .eq("player_id", userPlayerId);
      if (membersRes.error || !membersRes.data) {
        setLeagueRole({ isCaptain: false, isViceCaptain: false, teamNames: [] });
        return;
      }
      const rows = membersRes.data as Array<{ team_id: string; is_captain: boolean; is_vice_captain?: boolean | null }>;
      const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
      let teamNames: string[] = [];
      if (teamIds.length > 0) {
        const teamsRes = await client.from("league_registered_teams").select("id,name").in("id", teamIds);
        if (!teamsRes.error && teamsRes.data) {
          const byId = new Map((teamsRes.data as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
          teamNames = teamIds.map((id) => byId.get(id)).filter(Boolean) as string[];
        }
      }
      setLeagueRole({
        isCaptain: rows.some((r) => r.is_captain),
        isViceCaptain: rows.some((r) => Boolean(r.is_vice_captain)),
        teamNames,
      });
    };
    run();
  }, [admin.loading, admin.isSuper, userPlayerId]);

  useEffect(() => {
    const run = async () => {
      const client = supabase;
      if (!client || admin.loading || admin.isSuper || !userPlayerId) {
        setTonightLineupCount(0);
        setTonightLineupLabel(null);
        setTonightLineupHref("/captain-results");
        return;
      }
      const membersRes = await client
        .from("league_team_members")
        .select("team_id,is_captain,is_vice_captain")
        .eq("player_id", userPlayerId);
      if (membersRes.error || !membersRes.data) {
        setTonightLineupCount(0);
        setTonightLineupLabel(null);
        setTonightLineupHref("/captain-results");
        return;
      }
      const captainTeamIds = new Set(
        (membersRes.data as Array<{ team_id: string; is_captain: boolean; is_vice_captain?: boolean | null }>)
          .filter((row) => row.is_captain || Boolean(row.is_vice_captain))
          .map((row) => row.team_id)
      );
      if (captainTeamIds.size === 0) {
        setTonightLineupCount(0);
        setTonightLineupLabel(null);
        setTonightLineupHref("/captain-results");
        return;
      }
      const teamsRes = await client.from("league_teams").select("id,name");
      const teamNameById = new Map(
        ((teamsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
      );
      const fixturesRes = await client
        .from("league_fixtures")
        .select("id,home_team_id,away_team_id,fixture_date,status,pre_match_paper_record,home_lineup_submitted_at,away_lineup_submitted_at");
      if (fixturesRes.error || !fixturesRes.data) {
        setTonightLineupCount(0);
        setTonightLineupLabel(null);
        setTonightLineupHref("/captain-results");
        return;
      }
      const actionableFixtures = (fixturesRes.data as Array<{
        id: string;
        home_team_id: string;
        away_team_id: string;
        fixture_date: string | null;
        status?: string | null;
        pre_match_paper_record?: boolean | null;
        home_lineup_submitted_at?: string | null;
        away_lineup_submitted_at?: string | null;
      }>).filter((fixture) => {
        if (fixture.pre_match_paper_record) return false;
        if (!isLineupWindowLive(fixture.fixture_date)) return false;
        if (fixture.status === "complete") return false;
        const isHomeCaptain = captainTeamIds.has(fixture.home_team_id);
        const isAwayCaptain = captainTeamIds.has(fixture.away_team_id);
        if (isHomeCaptain && !fixture.home_lineup_submitted_at && !fixture.away_lineup_submitted_at) return true;
        if (isAwayCaptain && Boolean(fixture.home_lineup_submitted_at) && !fixture.away_lineup_submitted_at) return true;
        return false;
      });
      setTonightLineupCount(actionableFixtures.length);
      if (actionableFixtures.length === 1) {
        const fixture = actionableFixtures[0];
        const myTeamId = captainTeamIds.has(fixture.home_team_id) ? fixture.home_team_id : fixture.away_team_id;
        const opponentId = myTeamId === fixture.home_team_id ? fixture.away_team_id : fixture.home_team_id;
        setTonightLineupLabel(teamNameById.get(opponentId) ? `vs. ${teamNameById.get(opponentId)}` : "Opponent due");
        setTonightLineupHref(`/captain-results?fixtureId=${fixture.id}`);
      } else if (actionableFixtures.length > 1) {
        setTonightLineupLabel(`${actionableFixtures.length} due`);
        setTonightLineupHref("/captain-results");
      } else {
        setTonightLineupLabel(null);
        setTonightLineupHref("/captain-results");
      }
    };
    void run();
  }, [admin.loading, admin.isSuper, userPlayerId]);

  useEffect(() => {
    const run = async () => {
      if (admin.loading || admin.isSuper || !admin.isAdmin) return;
      const client = supabase;
      if (!client) return;
      const { data: sessionRes } = await client.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) return;
      const resp = await fetch("/api/admin/feature-request", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const data = await resp.json().catch(() => ({}));
      const requested = new Set<string>();
      const rows = (data?.requests ?? []) as Array<{ feature?: string }>;
      rows.forEach((r) => {
        if (r.feature === "quick_match" || r.feature === "competition_create") requested.add(r.feature);
      });
      setPendingFeatureRequests(requested);
    };
    run();
  }, [admin.loading, admin.isAdmin, admin.isSuper]);

  useEffect(() => {
    const run = async () => {
      const client = supabase;
      if (!client) return;
      const countPendingResults = async (submittedByUserId?: string) => {
        let q1 = client.from("result_submissions").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (submittedByUserId) q1 = q1.eq("submitted_by_user_id", submittedByUserId);
        const legacy = await q1;
        if (!legacy.error) return legacy.count ?? 0;
        if (!legacy.error.message.toLowerCase().includes("result_submissions")) return 0;
        let q2 = client.from("league_result_submissions").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (submittedByUserId) q2 = q2.eq("submitted_by_user_id", submittedByUserId);
        const league = await q2;
        return league.count ?? 0;
      };
      const { count: openCount } = await client
        .from("competitions")
        .select("id", { count: "exact", head: true })
        .eq("is_archived", false)
        .eq("is_completed", false);
      setOpenEventsCount(openCount ?? 0);

      if (admin.isAdmin || admin.isSuper) {
        const resultsCount = await countPendingResults();
        setResultsQueueCount(resultsCount ?? 0);
      } else {
        setResultsQueueCount(null);
      }

      if (admin.canManageLeague) {
        const tables = ["player_claim_requests", "player_update_requests", "location_requests"];
        if (admin.isSuper) tables.push("admin_requests", "profile_merge_requests", "player_deletion_requests");
        const counts = await Promise.all(
          tables.map((table) => client.from(table).select("id", { count: "exact", head: true }).eq("status", "pending"))
        );
        const entryPackResult = await client.from("league_entry_packs").select("id,season_id").eq("status", "submitted").order("updated_at", { ascending: false });
        const otherRequestCount = counts.reduce((sum, result) => sum + (result.count ?? 0), 0);
        const entryPacks = (entryPackResult.data ?? []) as Array<{ id: string; season_id: string }>;
        const totalRequestCount = otherRequestCount + entryPacks.length;
        setPendingRequestsCount(totalRequestCount);
        setPendingRequestsHref(
          totalRequestCount === 1 && entryPacks.length === 1
            ? `/entry-packs?seasonId=${encodeURIComponent(entryPacks[0].season_id)}&packId=${encodeURIComponent(entryPacks[0].id)}`
            : "/notifications"
        );
        setPendingResultSubmissionsCount(0);
        return;
      }

      if (admin.isAdmin) {
        const tables = ["player_claim_requests", "player_update_requests"];
        const counts = await Promise.all(tables.map((table) => client.from(table).select("id", { count: "exact", head: true }).eq("status", "pending")));
        setPendingRequestsCount(counts.reduce((sum, result) => sum + (result.count ?? 0), 0));
        setPendingResultSubmissionsCount(0);
        return;
      }

      const userId = admin.userId;
      if (!userId) {
        setPendingRequestsCount(0);
        setPendingResultSubmissionsCount(0);
        return;
      }
      const [
        { count: adminReqCount },
        { count: profileUpdateReqCount },
        { count: profileDeletionReqCount },
        { count: profileMergeReqCount },
        { count: resultSubmissionsReqCount },
        { count: competitionEntryReqCount },
      ] = await Promise.all([
        client.from("admin_requests").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).eq("status", "pending"),
        client.from("player_update_requests").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).eq("status", "pending"),
        client.from("player_deletion_requests").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).eq("status", "pending"),
        client.from("profile_merge_requests").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).eq("status", "pending"),
        Promise.resolve({ count: await countPendingResults(userId) }),
        client.from("competition_entries").select("id", { count: "exact", head: true }).eq("requester_user_id", userId).eq("status", "pending"),
      ]);
      const pendingResultCount = resultSubmissionsReqCount ?? 0;
      setPendingRequestsCount(
        (pendingClaim ? 1 : 0) +
          (adminReqCount ?? 0) +
          (profileUpdateReqCount ?? 0) +
          (profileDeletionReqCount ?? 0) +
          (profileMergeReqCount ?? 0) +
          (competitionEntryReqCount ?? 0) +
          pendingResultCount
      );
      setPendingResultSubmissionsCount(pendingResultCount);
    };
    run();
  }, [admin.isAdmin, admin.isSuper, admin.userId, pendingClaim]);

  useEffect(() => {
    const run = async () => {
      const client = supabase;
      if (!client || admin.loading) return;
      const { data: sessionRes } = await client.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) {
        setFixtureChangeActionCount(0);
        setOutstandingFixtureCount(0);
        return;
      }
      const scope = admin.canManageLeague ? "admin" : "mine";
      const resp = await fetch(`/api/league/fixture-change-requests?scope=${scope}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        setFixtureChangeActionCount(0);
        setOutstandingFixtureCount(0);
        return;
      }
      const data = (await resp.json().catch(() => ({}))) as {
        rows?: Array<{ status?: string }>;
      };
      const rows = data.rows ?? [];
      if (admin.canManageLeague) {
        setFixtureChangeActionCount(
          rows.filter((row) => row.status === "pending" || row.status === "approved_outstanding").length
        );
        setOutstandingFixtureCount(0);
        return;
      }
      setOutstandingFixtureCount(
        rows.filter((row) => row.status === "pending" || row.status === "approved_outstanding").length
      );
      setFixtureChangeActionCount(0);
    };
    void run();
  }, [admin.loading, admin.canManageLeague, admin.userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (admin.loading || admin.isSuper) return;
    if (!admin.userId || !userPlayerId) return;
    const sessionKey = `profile_photo_prompt_seen_${admin.userId}_${userPlayerId}`;
    if (userMissingAvatar || userMissingDob) {
      const seenThisSession = window.sessionStorage.getItem(sessionKey);
      if (!seenThisSession) {
        setShowProfilePrompt(true);
        window.sessionStorage.setItem(sessionKey, "1");
      }
      return;
    }
    setShowProfilePrompt(false);
  }, [admin.loading, admin.isSuper, admin.userId, userPlayerId, userMissingAvatar, userMissingDob]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (admin.loading || admin.isSuper || !hasCaptainRole || !admin.userId) return;
    const storageKey = `captain_guide_prompt_dismissed_${admin.userId}`;
    setShowCaptainGuidePrompt(window.localStorage.getItem(storageKey) !== "1");
  }, [admin.loading, admin.isSuper, admin.userId, hasCaptainRole]);

  useEffect(() => {
    let active = true;
    const loadAnnouncement = async () => {
      try {
        const res = await fetch("/api/public/announcements", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as { announcement?: SiteAnnouncement | null };
        if (!active) return;
        setAnnouncement(payload.announcement ?? null);
      } catch {
        if (!active) return;
        setAnnouncement(null);
      }
    };
    void loadAnnouncement();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (admin.loading || admin.isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("claimStatus") !== "1") return;
    if (pendingClaim) {
      setClaimStatusOpen(true);
    }
    params.delete("claimStatus");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [admin.loading, admin.isAdmin, pendingClaim]);

  const submitClaimRequest = async () => {
    setProfileMessage(null);
    const client = supabase;
    if (!client) {
      setProfileMessage("Supabase is not configured.");
      return;
    }
    const first = firstName.trim();
    const second = secondName.trim();
    if (!first || !second) {
      setProfileMessage("Enter your first and second name to continue.");
      return;
    }
    const { data: userRes } = await client.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) {
      setProfileMessage("You must be signed in to submit a profile check.");
      return;
    }
    const fullName = `${first} ${second}`;
    const patternA = `%${first}%${second}%`;
    const patternB = `%${second}%${first}%`;
    const { data: candidates } = await client
      .from("players")
      .select("id,full_name,claimed_by")
      .eq("is_archived", false)
      .or(`full_name.ilike.${patternA},full_name.ilike.${patternB}`)
      .limit(1);
    const candidate = candidates?.[0];
    if (candidate && !candidate.claimed_by) {
      const ok = await askConfirm(
        "Possible profile match",
        `We found a possible match: "${candidate.full_name ?? fullName}". Is this you?`,
        "Yes, that's me",
        "No"
      );
      if (!ok) {
        setProfileMessage("Profile claim cancelled. If this is not you, ask an administrator to create your profile.");
        return;
      }
      const { error } = await client.from("player_claim_requests").insert({
        player_id: candidate.id,
        requester_user_id: userId,
        requested_full_name: candidate.full_name ?? fullName,
        status: "pending",
      });
      if (error) {
        setProfileMessage(`Claim request failed: ${error.message}`);
        return;
      }
      setPendingClaim({ id: candidate.id, name: candidate.full_name ?? fullName });
      setProfileMessage("Claim request sent for administrator approval.");
      setProfileModalOpen(false);
      return;
    }

    const { data: created, error: createError } = await client
      .from("players")
      .insert({
        display_name: first,
        first_name: first,
        nickname: null,
        full_name: fullName,
        is_archived: false,
        claimed_by: null,
      })
      .select("id")
      .single();
    if (createError || !created?.id) {
      setProfileMessage(createError?.message ?? "Unable to create your profile for review.");
      return;
    }
    const { error: claimError } = await client.from("player_claim_requests").insert({
      player_id: created.id,
      requester_user_id: userId,
      requested_full_name: fullName,
      status: "pending",
    });
    if (claimError) {
      setProfileMessage(`Profile created, but claim request failed: ${claimError.message}`);
      return;
    }
    setPendingClaim({ id: created.id, name: fullName });
    setProfileMessage("Profile created and sent for administrator approval.");
    setProfileModalOpen(false);
  };

  const cancelPendingClaim = async () => {
    const client = supabase;
    if (!client || !pendingClaim) return;
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setProfileMessage("You must be signed in to cancel this claim.");
      return;
    }
    const response = await fetch("/api/player-claim-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requestId: pendingClaim.id, action: "cancel" }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setProfileMessage(`Failed to cancel claim: ${result?.error ?? "Unknown error"}`);
      return;
    }
    setPendingClaim(null);
    setProfileMessage("Claim request cancelled.");
    setClaimStatusOpen(false);
  };

  return (
    <main className="min-h-screen bg-[#f3f5f7] pb-6 sm:px-4 sm:pt-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:rounded-2xl sm:border">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#08172b] p-1.5 shadow-sm">
                  <img src="/rf-logo.png" alt="Rack & Frame League" className="h-full w-full object-contain" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black tracking-[0.16em] text-slate-950">RACK &amp; FRAME</span>
                  <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-700">League Manager</span>
                </span>
              </Link>
              <PageNav />
            </div>
          </header>

          <section className="relative overflow-hidden bg-gradient-to-br from-[#08172b] via-[#0b353c] to-[#087b78] px-5 py-7 text-white shadow-lg sm:rounded-3xl sm:px-8 sm:py-9">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -bottom-28 right-20 h-64 w-64 rounded-full border border-white/10" />
            <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-200">Welcome back</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Hi, {welcomeName}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                  {admin.canManageLeague
                    ? "Here’s what needs your attention across the league today."
                    : hasCaptainRole
                      ? "Your fixtures, lineup actions and league updates are ready below."
                      : "Your league fixtures, results and player information are ready below."}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                    {appRoleLabel(admin.role)}
                  </span>
                  {leagueRole.teamNames.map((teamName) => (
                    <span key={teamName} className="rounded-full border border-cyan-200/30 bg-cyan-100/10 px-3 py-1 text-xs font-semibold text-cyan-50">
                      {teamName}
                    </span>
                  ))}
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm md:min-w-64">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Your account</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {admin.isSuper ? "System Owner · Martin Chamberlain" : userName || appRoleLabel(admin.role)}
                </p>
                {userEmail ? <p className="mt-1 truncate text-xs text-slate-300">{userEmail}</p> : null}
                {!admin.isSuper && userPlayerId ? (
                  <Link href={`/players/${userPlayerId}`} className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-50">
                    View my profile
                  </Link>
                ) : null}
                {!admin.isAdmin && !userName ? (
                  <button type="button" onClick={() => setProfileModalOpen(true)} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-50">
                    Complete profile check
                  </button>
                ) : null}
              </div>
            </div>
            {!admin.isAdmin && !userName && pendingClaim ? (
              <div className="relative mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/30 bg-amber-100/10 px-4 py-3 text-sm text-amber-50">
                <span>Claim pending approval for {pendingClaim.name}.</span>
                <button type="button" onClick={() => setClaimStatusOpen(true)} className="font-semibold underline underline-offset-4">View status</button>
              </div>
            ) : null}
            {!admin.isAdmin && pendingResultSubmissionsCount > 0 ? (
              <div className="relative mt-4 rounded-xl border border-amber-200/30 bg-amber-100/10 px-4 py-3 text-sm text-amber-50">
                Result submission pending approval ({pendingResultSubmissionsCount}).
                <Link href="/notifications" className="ml-2 font-semibold underline underline-offset-4">View status</Link>
              </div>
            ) : null}
            {profileMessage ? <p className="relative mt-3 text-sm text-cyan-50">{profileMessage}</p> : null}
          </section>

          {completionMessage ? (
            <section className="mx-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow-sm sm:mx-0">
              {completionMessage}
            </section>
          ) : null}
          <div className="mx-4 sm:mx-0">
            <ImportantAnnouncementBanner announcement={announcement} />
          </div>
          {!admin.isSuper ? (
            <section className={subtleCardClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Welcome & User Guide</p>
                {hasCaptainRole ? (
                  <Link href={tonightLineupHref} className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">
                    {roleGuideLabel}
                  </Link>
                ) : (
                  <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {roleGuideLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">{accountStatusText}</p>
              {leagueRole.teamNames.length > 0 ? (
                <p className="mt-1 text-xs text-slate-600">Linked team: {leagueRole.teamNames.join(", ")}</p>
              ) : null}
              {hasCaptainRole && showCaptainGuidePrompt ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">Read this before your first fixture</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        Check the captain guide for when to enter your lineup, the home-team submission rule, and the midnight result deadline.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined" && admin.userId) {
                          window.localStorage.setItem(`captain_guide_prompt_dismissed_${admin.userId}`, "1");
                        }
                        setShowCaptainGuidePrompt(false);
                      }}
                      className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                    >
                      Don&apos;t show again
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/captain-guide" className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">
                      Open guide
                    </Link>
                    <Link href={tonightLineupHref} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Enter tonight&apos;s lineup
                    </Link>
                  </div>
                </div>
              ) : null}
              {hasCaptainRole ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/captain-guide" className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">
                    Open captain guide
                  </Link>
                  <Link href={tonightLineupHref} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Open captain results
                  </Link>
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">1. View</p>
                  <p className="mt-1 text-sm text-slate-800">
                    Open <span className="font-semibold">League Manager</span> to view published fixtures, league table, and player table.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">2. Submit</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {hasCaptainRole
                      ? "Use Captain Results for pre-match lineups. Home teams should then submit the result by midnight on the following day."
                      : "If assigned as captain/vice-captain, Captain Results is used for result submission."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">3. Track</p>
                  <p className="mt-1 text-sm text-slate-800">
                    Check <span className="font-semibold">Notifications</span> for lineup prompts, fixture reminders, and result approval updates.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className={`${subtleCardClass} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-teal-700">Your workspace</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Needs your attention</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Start with these live actions. Everything else remains available from Menu or the management catalogue below.
                </p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {admin.canManageLeague ? `${appRoleLabel(admin.role)} view` : hasCaptainRole ? "Captain workflow view" : "Player view"}
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {priorityCards.map((card) => (
                <Link
                  key={`${card.href}|${card.title}`}
                  href={card.href}
                  className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${priorityCardClass(card.tone)}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.title}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p
                      className={`leading-tight ${priorityValueClass(card.tone)} ${
                        card.compactDisplay
                          ? "max-w-[12rem] text-xl font-black sm:text-2xl"
                          : "text-4xl font-black leading-none"
                      }`}
                    >
                      {card.displayValue ?? (card.value > 0 ? String(card.value) : "Clear")}
                    </p>
                    <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                      Open
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-900">{card.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <details className={`${cardBaseClass} overflow-hidden p-0`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 marker:hidden sm:px-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-teal-700">Management catalogue</p>
                <h2 className="mt-1 text-base font-bold text-slate-950">All Rack &amp; Frame areas</h2>
                <p className="mt-1 text-xs text-slate-500">Open this only when the task you need is not shown above.</p>
              </div>
              <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">Browse tools</span>
            </summary>
            <div className="border-b border-slate-200 bg-gradient-to-r from-[#0f1a31] via-[#132847] to-[#0b4246] p-4 text-white sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">All areas</p>
                  <h2 className="mt-1 text-xl font-semibold">Find the work you need</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-300">
                    Screens are grouped by purpose, so league operations are kept separate from competitions, communications and protected system controls.
                  </p>
                </div>
                <label className="flex w-full items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 shadow-inner focus-within:border-cyan-300 md:max-w-sm">
                  <span aria-hidden="true" className="text-slate-300">⌕</span>
                  <input
                    value={dashboardQuery}
                    onChange={(event) => setDashboardQuery(event.target.value)}
                    placeholder="Find a screen or task"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-5 bg-[#f7f9fc] p-4 sm:p-5">
              {groupedDashboardLinks.map((group) => (
                <section key={group.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <h3 className="text-base font-bold text-slate-950">{group.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{group.description}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((item) => (
                      isDisabledAdminFeature(item.href) ? (
                        <div key={`${item.href}|${item.title}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 opacity-90">
                          <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{cardDescription(item.href, item.desc)}</p>
                          <div className="mt-3">
                            {hasPendingFeatureRequest(item.href) ? (
                              <span className="inline-flex rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Requested</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => requestFeatureAccess(item.href === "/quick-match" ? "quick_match" : "competition_create")}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                              >
                                Request access
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <Link
                          key={`${item.href}|${item.title}`}
                          href={item.href}
                          onClick={(event) => handleNavClick(event, item.href)}
                          className="group flex min-h-28 flex-col rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="text-sm font-semibold text-slate-950">{item.title}</h4>
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm text-slate-500 transition group-hover:bg-teal-700 group-hover:text-white">→</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{cardDescription(item.href, item.desc)}</p>
                          <span className={`mt-auto pt-3 text-xs font-semibold ${item.href.includes("results") && primaryTileBadgeText(item.href) !== "Open" ? "text-rose-700" : "text-teal-700"}`}>
                            {primaryTileBadgeText(item.href)}
                          </span>
                        </Link>
                      )
                    ))}
                  </div>
                </section>
              ))}
              {groupedDashboardLinks.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                  <p className="font-semibold text-slate-900">No screens match “{dashboardQuery}”.</p>
                  <button type="button" onClick={() => setDashboardQuery("")} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Clear search</button>
                </div>
              ) : null}
            </div>
          </details>

          {profileModalOpen && !admin.isAdmin ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
                <h2 className="text-lg font-semibold text-slate-900">Profile check</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Enter your first and second name. We’ll check for an unclaimed profile and send a claim request for approval.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                    placeholder="Second name"
                    value={secondName}
                    onChange={(e) => setSecondName(e.target.value)}
                  />
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => setProfileModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-teal-700 px-3 py-2 text-sm font-medium text-white"
                    onClick={submitClaimRequest}
                  >
                    Submit for approval
                  </button>
                </div>
                {profileMessage ? <p className="mt-3 text-sm text-amber-800">{profileMessage}</p> : null}
              </div>
            </div>
          ) : null}

          {claimStatusOpen && pendingClaim && !admin.isAdmin ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
                <h2 className="text-lg font-semibold text-slate-900">Claim status</h2>
                <p className="mt-1 text-sm text-slate-600">Awaiting administrator approval for:</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{pendingClaim.name}</p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => setClaimStatusOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white"
                    onClick={cancelPendingClaim}
                  >
                    Cancel request
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="mx-4 rounded-2xl border border-slate-200 bg-white/80 p-3 text-center text-xs text-slate-600 shadow-sm sm:mx-0">
            Rack &amp; Frame League Manager &copy; {new Date().getFullYear()} <span className="font-semibold text-slate-800">Martin Chamberlain</span>. All rights reserved.
          </section>
        </RequireAuth>
      </div>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
      <ConfirmModal
        open={showProfilePrompt}
        title={userMissingAvatar && userMissingDob ? "Complete your player profile" : userMissingDob ? "Add your date of birth" : "Add a profile photo"}
        description={
          userMissingAvatar && userMissingDob
            ? "Your player profile is missing both a photo and date of birth. Open your profile now to upload a photo and add your DOB."
            : userMissingDob
              ? "Your player profile is missing a date of birth. Open your profile now to add it."
              : "Your player profile does not have a photo yet. Open your profile now to upload one."
        }
        confirmLabel="Review now"
        cancelLabel="Later"
        onConfirm={() => {
          if (typeof window !== "undefined" && admin.userId && userPlayerId) {
            const sessionKey = `profile_photo_prompt_seen_${admin.userId}_${userPlayerId}`;
            window.sessionStorage.setItem(sessionKey, "1");
          }
          setShowProfilePrompt(false);
          if (userPlayerId) router.push(`/players/${userPlayerId}?prompt=photo`);
        }}
        onCancel={() => {
          if (typeof window !== "undefined" && admin.userId && userPlayerId) {
            const sessionKey = `profile_photo_prompt_seen_${admin.userId}_${userPlayerId}`;
            window.sessionStorage.setItem(sessionKey, "1");
          }
          setShowProfilePrompt(false);
        }}
      />
    </main>
  );
}

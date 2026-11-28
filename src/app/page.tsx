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
import DashboardActions, { oldestWaiting, type DashboardAction } from "@/components/DashboardActions";
import { groupTeamCompetitionEntries } from "@/lib/public-competition-entry";
import { fetchAllSupabasePages } from "@/lib/supabase-pagination";
import type { HandicapReviewSummary } from "@/lib/handicap-review-summary";
import ImportantAnnouncementBanner from "@/components/ImportantAnnouncementBanner";

const links = [
  { href: "/players", title: "Players", desc: "View and manage player records." },
  { href: "/quick-match", title: "Quick Match", desc: "Optional module: create ad-hoc practice matches." },
  { href: "/events/new", title: "Create Competition", desc: "Optional module: create standalone knockout or league events." },
  { href: "/league", title: "League Manager", desc: "Set up teams, fixtures, and league table." },
  { href: "/live-matches", title: "Live Matches", desc: "Follow tonight's live league scorecards inside the app." },
  { href: "/display/handicaps", title: "Handicaps", desc: "See the snooker handicap list and how starts are worked out." },
  { href: "/display/high-breaks", title: "High Breaks", desc: "View the published league high-break table." },
  { href: "/hall-of-fame", title: "Hall of Fame", desc: "Explore historic league champions, competition winners and season high breaks." },
  { href: "/captain-results", title: "Lineups & Results", desc: "Enter your pre-match lineup first, then submit your fixture result for approval." },
  { href: "/reschedule-fixture", title: "Reschedule Fixture", desc: "Request permission to play early or, exceptionally, later." },
  { href: "/events?view=league", title: "Match Centre", desc: "View your live league fixtures, results, and match reports." },
  { href: "/signups", title: "Competition Entries", desc: "Find the captains’ entry form and track entry status." },
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
  { href: "/announcements", title: "Announcements", desc: "League-officer control for banner notices." },
  { href: "/help", title: "User Guide", desc: "How to use the app." },
  { href: "/legal", title: "Legal & Credits", desc: "Legal and support information." },
];

type DashboardFixture = {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  fixture_date: string;
  status: string;
  pre_match_paper_record: boolean | null;
  home_lineup_submitted_at: string | null;
  away_lineup_submitted_at: string | null;
};
type QueueItem = { count: number; oldest: string | null };
const ukFixtureDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const todayUK = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

type SiteAnnouncement = { id?: string; title?: string | null; body?: string | null; is_active?: boolean | null; updated_at?: string | null };

function isMatchNight(date: string) {
  return date === todayUK();
}

export default function HomePage() {
  const router = useRouter();
  const admin = useAdminStatus();
  const features = useFeatureAccess();
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
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
  const [officerQueue, setOfficerQueue] = useState<Record<string, QueueItem>>({});
  const [fixtureRequests, setFixtureRequests] = useState<QueueItem | null>(null);
  const [teamFixture, setTeamFixture] = useState<{ id: string; detail: string; resume: boolean; canOpen: boolean } | null>(null);
  const [playerHandicap, setPlayerHandicap] = useState<{ href: string; value: string; review: string | null } | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number | null>(null);
  const [pendingRequestsHref, setPendingRequestsHref] = useState("/notifications");
  const [pendingResultSubmissionsCount, setPendingResultSubmissionsCount] = useState<number>(0);
  const [fixtureChangeActionCount, setFixtureChangeActionCount] = useState<number>(0);
  const [outstandingFixtureCount, setOutstandingFixtureCount] = useState<number>(0);
  const [leagueRole, setLeagueRole] = useState<{ isCaptain: boolean; isViceCaptain: boolean; isMatchScorer: boolean; teamNames: string[] }>({
    isCaptain: false,
    isViceCaptain: false,
    isMatchScorer: false,
    teamNames: [],
  });
  const [pendingFeatureRequests, setPendingFeatureRequests] = useState<Set<string>>(new Set());
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
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
    const route = href.split("?")[0];
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
        "/hall-of-fame",
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
      ].includes(route);
    }
    if (!admin.isSuper && (route === "/audit" || route === "/usage")) return false;
    if ((route === "/rating-audit" || route === "/signup-requests") && !admin.canManageLeague) return false;
    if (route === "/entry-packs" && !admin.canManageLeague) return false;
    if (route === "/league-invoices" && !admin.canManageLeague) return false;
    if (route === "/league-officer-guide" && !admin.canManageLeague) return false;
    if (route === "/announcements" && !admin.canManageLeague) return false;
    if (admin.isAdmin) {
      // Admins still see these cards, but they can be disabled per-account.
      return true;
    }
    return ["/events", "/league", "/live-matches", "/handicaps", "/high-breaks", "/hall-of-fame", "/captain-results", "/reschedule-fixture", "/signups", "/documents", "/help", "/legal", "/notifications"].includes(route);
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
      ? ["/league", "/entry-packs", "/league-invoices", "/results", "/league-officer-guide", "/reschedule-fixture", "/handicaps", "/rating-audit", "/players", "/signup-requests", "/signups", "/documents", "/announcements", "/notifications", "/live-matches", "/high-breaks", "/hall-of-fame", "/help", "/legal"]
    : admin.isAdmin
      ? ["/league", "/live-matches", "/handicaps", "/high-breaks", "/hall-of-fame", "/captain-results", "/reschedule-fixture", "/events", "/quick-match", "/events/new", "/signups", "/help", "/legal"]
      : ["/league", "/live-matches", "/handicaps", "/high-breaks", "/hall-of-fame", "/captain-results", "/reschedule-fixture", "/events", "/notifications", "/signups", "/help", "/legal"];
  const quickAccessHrefs = admin.isSuper
    ? ["/audit", "/rating-audit", "/usage"]
    : admin.isAdmin
      ? ["/results", "/notifications"]
      : [];
  const primaryLinks = visibleLinks.filter((item) => primaryHrefs.includes(item.href.split("?")[0]));
  const quickAccessLinks = visibleLinks.filter((item) => quickAccessHrefs.includes(item.href.split("?")[0]));
  const moreLinks = visibleLinks.filter((item) => !primaryHrefs.includes(item.href.split("?")[0]) && !quickAccessHrefs.includes(item.href.split("?")[0]));
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
        prefixes: ["/signups", "/events", "/live-matches", "/high-breaks", "/hall-of-fame", "/documents", "/quick-match"],
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
  const hasScoreEntryRole = hasCaptainRole || leagueRole.isMatchScorer;
  const roleGuideLabel = hasCaptainRole
    ? leagueRole.isCaptain && leagueRole.isViceCaptain
      ? "Captain / Vice-captain"
      : leagueRole.isCaptain
        ? "Captain"
        : "Vice-captain"
    : leagueRole.isMatchScorer ? "Match-night scorer" : "Player";
  const queueAction = (href: string, title: string, queue?: QueueItem | null): DashboardAction => ({
    href, title, count: queue?.count ?? null, detail: queue?.oldest ?? (queue?.count === 0 ? "Up to date" : null),
  });
  const officerActions = [
    queueAction("/results?tab=fixture_changes", "Fixture date requests", fixtureRequests),
    queueAction("/results", "League results to review", officerQueue.league),
    queueAction("/results?tab=competition", "Competition results to review", officerQueue.competition),
    queueAction("/outstanding-scorecards", "Outstanding scorecards", officerQueue.scorecards),
    queueAction("/signups#team-forms", "Competition forms to review", officerQueue.forms),
    queueAction(pendingRequestsHref, "Registrations and other requests", pendingRequestsCount === null ? null : { count: pendingRequestsCount, oldest: null }),
  ];
  const personalActions: DashboardAction[] = [
    { href: "/display/league-table", title: "League tables" },
    { href: "/competition-entry/overview", title: "Competition entries and draw formats" },
    ...(hasCaptainRole ? [{ href: "/reschedule-fixture", title: "Fixture date requests", count: outstandingFixtureCount }] : []),
    { href: "/notifications", title: "Notifications" },
    ...(hasCaptainRole ? [{ href: "/captain-guide", title: "Captain and vice-captain guide" }] : []),
  ];
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
        setLeagueRole({ isCaptain: false, isViceCaptain: false, isMatchScorer: false, teamNames: [] });
        return;
      }
      type RoleMembership = { team_id: string; is_captain: boolean; is_vice_captain?: boolean | null; is_match_scorer?: boolean | null };
      let rows: RoleMembership[] = [];
      let teamTable = "league_teams";

      const seasonsRes = await client
        .from("league_seasons")
        .select("id")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      const liveSeasonIds = ((seasonsRes.data ?? []) as Array<{ id: string }>).map((season) => season.id);
      if (!seasonsRes.error && liveSeasonIds.length > 0) {
        let liveMembersRes = await client
          .from("league_team_members")
          .select("team_id,is_captain,is_vice_captain,is_match_scorer")
          .eq("player_id", userPlayerId)
          .in("season_id", liveSeasonIds);
        if (liveMembersRes.error && liveMembersRes.error.message.toLowerCase().includes("is_match_scorer")) {
          const fallback = await client.from("league_team_members").select("team_id,is_captain,is_vice_captain").eq("player_id", userPlayerId).in("season_id", liveSeasonIds);
          liveMembersRes = { ...fallback, data: (fallback.data ?? []).map((row) => ({ ...row, is_match_scorer: false })) } as unknown as typeof liveMembersRes;
        }
        if (!liveMembersRes.error) rows = (liveMembersRes.data ?? []) as RoleMembership[];
      }

      // Before a season is live, retain the registered-team template as a fallback.
      if (rows.length === 0) {
        const registeredMembersRes = await client
          .from("league_registered_team_members")
          .select("team_id,is_captain,is_vice_captain")
          .eq("player_id", userPlayerId);
        if (registeredMembersRes.error || !registeredMembersRes.data) {
          setLeagueRole({ isCaptain: false, isViceCaptain: false, isMatchScorer: false, teamNames: [] });
          return;
        }
        rows = registeredMembersRes.data as RoleMembership[];
        teamTable = "league_registered_teams";
      }

      const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
      let teamNames: string[] = [];
      if (teamIds.length > 0) {
        const teamsRes = await client.from(teamTable).select("id,name").in("id", teamIds);
        if (!teamsRes.error && teamsRes.data) {
          const byId = new Map((teamsRes.data as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
          teamNames = teamIds.map((id) => byId.get(id)).filter(Boolean) as string[];
        }
      }
      setLeagueRole({
        isCaptain: rows.some((r) => r.is_captain),
        isViceCaptain: rows.some((r) => Boolean(r.is_vice_captain)),
        isMatchScorer: rows.some((r) => Boolean(r.is_match_scorer)),
        teamNames,
      });
    };
    run();
  }, [admin.loading, admin.isSuper, userPlayerId]);

  useEffect(() => {
    const client = supabase;
    if (!client || admin.loading || admin.canManageLeague || !userPlayerId) return;
    let active = true;
    const run = async () => {
      const seasons = await client.from("league_seasons").select("id,name").eq("is_active", true).eq("is_published", true);
      if (!active || seasons.error || !seasons.data.length) return;
      const roster = await client.from("league_team_members").select("team_id,season_id,is_captain,is_vice_captain,is_match_scorer")
        .eq("player_id", userPlayerId).in("season_id", seasons.data.map(({ id }) => id));
      if (!active || roster.error || !roster.data.length) return;
      const myTeams = [...new Set(roster.data.map(({ team_id }) => team_id))];
      const season = seasons.data.find(({ id, name }) => /premier league/i.test(name) && roster.data.some((row) => row.season_id === id));
      if (season) {
        const href = `/display/handicaps?seasonId=${season.id}`;
        void client.from("players").select("snooker_handicap").eq("id", userPlayerId).maybeSingle().then(({ data }) => {
          if (!active || typeof data?.snooker_handicap !== "number") return;
          const value = data.snooker_handicap;
          setPlayerHandicap({ href, value: value > 0 ? `+${value}` : String(value), review: null });
          void fetch(`/api/public/weekly-handicap-review?seasonId=${season.id}`).then(async (response) => {
            if (!response.ok || !active) return;
            const { reviewSummary } = await response.json() as { reviewSummary?: HandicapReviewSummary & { unavailable?: boolean } };
            if (!active || reviewSummary?.unavailable || !reviewSummary?.nextReview) return;
            const { date, week } = reviewSummary.nextReview;
            const review = date ? `Next review after Week ${week} · ${ukFixtureDate.format(new Date(date))}` : `Next review after Week ${week}`;
            setPlayerHandicap({ href, value: value > 0 ? `+${value}` : String(value), review });
          }).catch(() => {});
        });
      } else if (seasons.data.some(({ id, name }) => /division\s*1/i.test(name) && roster.data.some((row) => row.season_id === id))) {
        setPlayerHandicap({ href: "/display/handicaps", value: "Off scratch", review: "Division 1 league fixtures" });
      }

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      const today = todayUK();
      const fixtures = await client.from("league_fixtures")
        .select("id,season_id,home_team_id,away_team_id,fixture_date,status,pre_match_paper_record,home_lineup_submitted_at,away_lineup_submitted_at")
        .in("season_id", seasons.data.map(({ id }) => id))
        .or(`home_team_id.in.(${myTeams.join(",")}),away_team_id.in.(${myTeams.join(",")})`)
        .in("status", ["pending", "in_progress"]).gte("fixture_date", yesterday).order("fixture_date").order("id").limit(12);
      if (!active || fixtures.error || !fixtures.data.length) return;
      const rows = fixtures.data as DashboardFixture[];
      const scorerTeams = new Set(roster.data.filter((row) => row.is_captain || row.is_vice_captain || row.is_match_scorer).map((row) => row.team_id));
      const scorable = rows.filter((row) => row.fixture_date <= today && (scorerTeams.has(row.home_team_id) || scorerTeams.has(row.away_team_id)));
      const submissions = scorable.length ? await client.from("league_result_submissions").select("fixture_id")
        .in("fixture_id", scorable.map(({ id }) => id)).in("status", ["pending", "approved"]) : null;
      if (!active) return;
      const submitted = new Set((submissions?.data ?? []).map(({ fixture_id }) => fixture_id));
      const resumable = submissions && !submissions.error ? scorable.find((row) =>
        scorerTeams.has(row.home_team_id) && !submitted.has(row.id) &&
        (row.pre_match_paper_record || (row.home_lineup_submitted_at && row.away_lineup_submitted_at))) : null;
      const fixture = resumable ?? rows.find((row) => row.fixture_date >= today);
      if (!fixture) return;
      const teams = await client.from("league_teams").select("id,name").in("id", [fixture.home_team_id, fixture.away_team_id]);
      if (!active) return;
      const names = new Map((teams.data ?? []).map(({ id, name }) => [id, name]));
      const detail = `${names.get(fixture.home_team_id) ?? "Home team"} vs ${names.get(fixture.away_team_id) ?? "Away team"} · ${ukFixtureDate.format(new Date(fixture.fixture_date))}`;
      const canOpen = Boolean(resumable) || (isMatchNight(fixture.fixture_date) &&
        (scorerTeams.has(fixture.home_team_id) || scorerTeams.has(fixture.away_team_id)));
      setTeamFixture({ id: fixture.id, detail, resume: Boolean(resumable), canOpen });

    };
    void run();
    return () => { active = false; };
  }, [admin.loading, admin.canManageLeague, userPlayerId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !admin.canManageLeague) return;
    let active = true;
    const load = async () => {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token || !active) return;
      const outstanding = fetch("/api/league/outstanding-scorecards", { headers: { Authorization: `Bearer ${token}` } })
        .then(async (response) => response.ok ? (await response.json()).fixtures as { date: string | null }[] : null)
        .catch(() => null);
      const [league, competition, entries, scorecards] = await Promise.all([
        client.from("league_result_submissions").select("created_at", { count: "exact" }).eq("status", "pending").order("created_at").limit(1),
        client.from("competition_result_submissions").select("created_at", { count: "exact" }).eq("status", "pending").order("created_at").limit(1),
        fetchAllSupabasePages<{ id: string; requester_user_id: string | null; note: string | null; created_at: string }>((from, to) => client
          .from("competition_entries").select("id,requester_user_id,note,created_at").eq("status", "pending").order("id").range(from, to)),
        outstanding,
      ]);
      if (!active) return;
      const forms = entries.error ? null : groupTeamCompetitionEntries(entries.data ?? []).forms;
      setOfficerQueue({
        ...(!league.error && { league: { count: league.count ?? 0, oldest: oldestWaiting(league.data.map(({ created_at }) => created_at)) } }),
        ...(!competition.error && { competition: { count: competition.count ?? 0, oldest: oldestWaiting(competition.data.map(({ created_at }) => created_at)) } }),
        ...(forms && { forms: { count: forms.length, oldest: oldestWaiting(forms.flatMap(({ entries }) => entries.map(({ created_at }) => created_at))) } }),
        ...(scorecards && { scorecards: { count: scorecards.length, oldest: oldestWaiting(scorecards.map(({ date }) => date)) } }),
      });
    };
    void load();
    return () => { active = false; };
  }, [admin.canManageLeague, admin.userId]);

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
        let q2 = client.from("league_result_submissions").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (submittedByUserId) q2 = q2.eq("submitted_by_user_id", submittedByUserId);
        const league = await q2;
        return league.count ?? 0;
      };
      if (admin.canManageLeague) {
        const tables = ["player_claim_requests", "player_update_requests", "location_requests", "league_player_addition_requests"];
        if (admin.isSuper) tables.push("admin_requests", "profile_merge_requests", "player_deletion_requests");
        const counts = await Promise.all(
          tables.map((table) => client.from(table).select("id", { count: "exact", head: true }).eq("status", "pending"))
        );
        const entryPackResult = await client.from("league_entry_packs").select("id,season_id").eq("status", "submitted").order("updated_at", { ascending: false });
        const otherRequestCount = counts.reduce((sum, result) => sum + (result.count ?? 0), 0);
        const entryPacks = (entryPackResult.data ?? []) as Array<{ id: string; season_id: string }>;
        const playerAdditionCount = counts[3]?.count ?? 0;
        const totalRequestCount = otherRequestCount + entryPacks.length;
        setPendingRequestsCount(totalRequestCount);
        setPendingRequestsHref(
          totalRequestCount === 1 && entryPacks.length === 1
            ? `/entry-packs?seasonId=${encodeURIComponent(entryPacks[0].season_id)}&packId=${encodeURIComponent(entryPacks[0].id)}`
            : totalRequestCount === 1 && playerAdditionCount === 1
              ? "/player-additions"
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
  }, [admin.canManageLeague, admin.isAdmin, admin.isSuper, admin.userId, pendingClaim]);

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
        rows?: Array<{ status?: string; created_at?: string }>;
      };
      const rows = data.rows ?? [];
      if (admin.canManageLeague) {
        const pending = rows.filter((row) => row.status === "pending" || row.status === "approved_outstanding");
        setFixtureChangeActionCount(pending.length);
        setFixtureRequests({ count: pending.length, oldest: oldestWaiting(pending.map(({ created_at }) => created_at)) });
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
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-cyan-100">{admin.canManageLeague ? appRoleLabel(admin.role) : roleGuideLabel}</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Hi, {welcomeName}</h1>
                {leagueRole.teamNames.length ? <p className="mt-2 text-sm text-cyan-100">{leagueRole.teamNames.join(" · ")}</p> : null}
              </div>
              {userPlayerId ? (
                <Link href={`/players/${userPlayerId}`} className="rounded-xl border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">My player profile</Link>
              ) : !admin.isAdmin && !userName ? (
                <button type="button" onClick={() => setProfileModalOpen(true)} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900">Link my player profile</button>
              ) : null}
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
          <div className="mx-4 space-y-4 sm:mx-0">
            {admin.loading ? null : admin.canManageLeague ? (
              <DashboardActions title="Needs your attention" actions={officerActions} />
            ) : (
              <>
                <DashboardActions title={hasScoreEntryRole ? "My team" : "My league"} actions={[
                  {
                    href: hasScoreEntryRole && teamFixture?.canOpen ? `/captain-results?fixtureId=${teamFixture.id}` : "/events?view=league",
                    title: teamFixture?.resume && hasScoreEntryRole ? "Resume scorecard" : hasScoreEntryRole && teamFixture?.canOpen ? "Open match-night scorecard" : "Next league fixture",
                    detail: teamFixture?.detail ?? "View fixtures and results",
                  },
                  ...(playerHandicap ? [{ title: playerHandicap.value === "Off scratch" ? "League handicap · Off scratch" : `Published handicap · ${playerHandicap.value}`, href: playerHandicap.href, detail: playerHandicap.review }] : []),
                  ...(userPlayerId && !playerHandicap ? [{ title: "Handicaps and reviews", href: "/display/handicaps" }] : []),
                  ...(hasScoreEntryRole ? [{ title: "All line-ups and results", href: "/captain-results" }] : []),
                ]} />
                <DashboardActions title="League shortcuts" actions={personalActions} />
              </>
            )}
          </div>
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import PageNav from "@/components/PageNav";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import ConfirmModal from "@/components/ConfirmModal";
import useFeatureAccess from "@/components/useFeatureAccess";

const links = [
  { href: "/players", title: "Players", desc: "View and manage player records." },
  { href: "/quick-match", title: "Quick Match", desc: "Optional module: create ad-hoc practice matches." },
  { href: "/events/new", title: "Create Competition", desc: "Optional module: create standalone knockout or league events." },
  { href: "/league", title: "League Manager", desc: "Set up teams, fixtures, and league table." },
  { href: "/handicaps", title: "Handicaps", desc: "See the snooker handicap list and how starts are worked out." },
  { href: "/captain-results", title: "Captain Results", desc: "Submit your fixture result for approval." },
  { href: "/events", title: "Events", desc: "View open and completed events." },
  { href: "/signups", title: "Competition Sign-ups", desc: "Enter open competitions and track entry status." },
  { href: "/backup", title: "Data Management", desc: "Backup, restore, and controlled data reset." },
  { href: "/audit", title: "Audit Log", desc: "Super User action trail across the system." },
  { href: "/signup-requests", title: "Signup Requests", desc: "Review new-account profile and location requests." },
  { href: "/usage", title: "Usage Analytics", desc: "Super User page-usage summary." },
  { href: "/results", title: "Results Queue", desc: "Review and approve submitted results." },
  { href: "/notifications", title: "Notifications", desc: "Read and manage your inbox notifications." },
  { href: "/live", title: "Live Overview", desc: "In-progress overview of active events." },
  { href: "/stats", title: "Stats", desc: "Player and matchup stats." },
  { href: "/help", title: "User Guide", desc: "How to use the app." },
  { href: "/legal", title: "Legal & Credits", desc: "Legal and support information." },
];

export default function HomePage() {
  const router = useRouter();
  const admin = useAdminStatus();
  const features = useFeatureAccess();
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userPlayerId, setUserPlayerId] = useState<string | null>(null);
  const [userMissingAvatar, setUserMissingAvatar] = useState(false);
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
  const [pendingResultSubmissionsCount, setPendingResultSubmissionsCount] = useState<number>(0);
  const [leagueRole, setLeagueRole] = useState<{ isCaptain: boolean; isViceCaptain: boolean; teamNames: string[] }>({
    isCaptain: false,
    isViceCaptain: false,
    teamNames: [],
  });
  const [pendingFeatureRequests, setPendingFeatureRequests] = useState<Set<string>>(new Set());
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
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
        "/handicaps",
        "/players",
        "/signup-requests",
        "/signups",
        "/notifications",
        "/results",
        "/audit",
        "/usage",
        "/backup",
        "/help",
        "/legal",
      ].includes(href);
    }
    if (!admin.isSuper && (href === "/audit" || href === "/usage" || href === "/signup-requests")) return false;
    if (admin.isAdmin) {
      // Admins still see these cards, but they can be disabled per-account.
      return true;
    }
    return ["/events", "/league", "/handicaps", "/captain-results", "/signups", "/help", "/legal", "/notifications"].includes(href);
  };

  const visibleLinks = links.filter((item) => isVisibleLink(item.href));
  const quickMatchAllowed = admin.isSuper || (admin.isAdmin && features.quickMatchEnabled);
  const createCompetitionAllowed = admin.isSuper || (admin.isAdmin && features.competitionCreateEnabled);
  const isDisabledAdminFeature = (href: string) =>
    admin.isAdmin &&
    !admin.isSuper &&
    ((href === "/quick-match" && !quickMatchAllowed) || (href === "/events/new" && !createCompetitionAllowed));
  const hasPendingFeatureRequest = (href: string) =>
    (href === "/quick-match" && pendingFeatureRequests.has("quick_match")) ||
    (href === "/events/new" && pendingFeatureRequests.has("competition_create"));

  const primaryHrefs = admin.isSuper
    ? ["/signup-requests", "/players", "/notifications", "/league", "/results", "/backup", "/signups", "/legal"]
    : admin.isAdmin
      ? ["/league", "/handicaps", "/captain-results", "/events", "/quick-match", "/events/new", "/signups", "/help", "/legal"]
      : ["/league", "/handicaps", "/captain-results", "/events", "/notifications", "/signups", "/help", "/legal"];
  const quickAccessHrefs = admin.isSuper
    ? ["/audit", "/usage"]
    : admin.isAdmin
      ? ["/results", "/notifications", "/live", "/stats"]
      : [];
  const primaryLinks = visibleLinks.filter((item) => primaryHrefs.includes(item.href));
  const quickAccessLinks = visibleLinks.filter((item) => quickAccessHrefs.includes(item.href));
  const moreLinks = visibleLinks.filter((item) => !primaryHrefs.includes(item.href) && !quickAccessHrefs.includes(item.href));
  const mainTabLinks = [...primaryLinks, ...moreLinks];
  const superGovernanceTile =
    admin.isSuper && pendingRequestsCount !== null
      ? {
          href: "/players?tab=requests",
          title: "Pending Governance Requests",
          desc: `${pendingRequestsCount} request${pendingRequestsCount === 1 ? "" : "s"} awaiting review.`,
        }
      : null;
  const mainTabLinksWithGovernance = superGovernanceTile ? [superGovernanceTile, ...mainTabLinks] : mainTabLinks;
  const compactSuper = admin.isSuper;
  const cardBaseClass = `rounded-2xl border border-slate-200 bg-white shadow-sm ${compactSuper ? "p-2.5" : "p-3 sm:p-4"}`;
  const subtleCardClass = `rounded-2xl border border-slate-200 bg-white shadow-sm ${compactSuper ? "p-3" : "p-3 sm:p-4"}`;
  const pillBaseClass = "rounded-full border px-3 py-1 text-sm transition";
  const pillSecondaryClass = `${pillBaseClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
  const pillPrimaryClass = `${pillBaseClass} border-teal-700 bg-teal-700 text-white hover:bg-teal-800`;
  const pillWarningClass = `${pillBaseClass} border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`;
  const actionLinkClass = "mt-2 inline-flex items-center rounded-full border border-teal-700 bg-teal-700 px-3 py-1 text-sm font-medium text-white transition hover:bg-teal-800";

  const quickAccessChipClass = (href: string) => {
    if (admin.isSuper) {
      if (href === "/signup-requests" || href === "/notifications") return pillPrimaryClass;
      return pillSecondaryClass;
    }
    if (href === "/notifications" || href === "/results") return pillPrimaryClass;
    return pillSecondaryClass;
  };
  const primaryTileClass = (href: string) => {
    const base = `rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${compactSuper ? "p-2.5 min-h-[112px]" : "p-4 min-h-[160px]"}`;
    if (href === "/league") return `${base} border-indigo-200 bg-gradient-to-br from-indigo-50 to-white`;
    if (href === "/captain-results") return `${base} border-emerald-200 bg-gradient-to-br from-emerald-50 to-white`;
    if (href === "/quick-match") return `${base} border-teal-200 bg-gradient-to-br from-teal-50 to-white`;
    if (href === "/events/new") return `${base} border-amber-200 bg-gradient-to-br from-amber-50 to-white`;
    if (href === "/events") return `${base} border-sky-200 bg-gradient-to-br from-sky-50 to-white`;
    if (href === "/notifications") return `${base} border-violet-200 bg-gradient-to-br from-violet-50 to-white`;
    return `${base} border-slate-200 bg-gradient-to-br from-slate-50 to-white`;
  };
  const primaryTileBadgeClass = (href: string) => {
    if (href === "/league") return "border-indigo-300 bg-indigo-100 text-indigo-900";
    if (href === "/captain-results") return "border-emerald-300 bg-emerald-100 text-emerald-900";
    if (href === "/quick-match") return "border-teal-300 bg-teal-100 text-teal-900";
    if (href === "/events/new") return "border-amber-300 bg-amber-100 text-amber-900";
    if (href === "/events") return "border-sky-300 bg-sky-100 text-sky-900";
    if (href === "/notifications") return "border-violet-300 bg-violet-100 text-violet-900";
    return "border-slate-300 bg-slate-100 text-slate-800";
  };
  const cardDescription = (href: string, fallback: string) => {
    if (href === "/league") {
      if (admin.isSuper) return "Set up leagues, teams, venues, fixtures, and approvals.";
      if (admin.isAdmin) return "View published fixtures/tables and review your team's submission progress.";
      return "View published fixtures, league table, and player table.";
    }
    if (href === "/captain-results") {
      if (admin.isSuper) return "Review what captains submit and confirm final results.";
      return "If you're captain/vice-captain, submit your team result for approval.";
    }
    if (href === "/players") {
      return admin.isSuper ? "Full player governance, linking, and approvals." : "View your own player profile and status.";
    }
    if (href === "/events/new") {
      return admin.isSuper
        ? "Create competitions and publish for player sign-up."
        : "Feature access can be enabled by Super User.";
    }
    if (href === "/quick-match") {
      return admin.isSuper
        ? "Create ad-hoc matches for practice and tracking."
        : "Feature access can be enabled by Super User.";
    }
    if (href === "/signups") {
      return admin.isSuper
        ? "Open/close cup entries and review entrants."
        : "Enter knockout cups and track approval status.";
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
  const accountStatusText = userPlayerId
    ? "Your player profile is linked and active."
    : pendingClaim
      ? "Your profile claim is pending review."
      : "No linked player profile yet. Complete profile check to continue.";

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
      `${feature === "quick_match" ? "Quick Match" : "Create Competition"} access request submitted for Super User approval.`
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
            .select("id,display_name,full_name,location_id,avatar_url")
            .eq("id", linkedPlayerId)
            .maybeSingle()
        : await client
            .from("players")
            .select("id,display_name,full_name,location_id,avatar_url")
            .eq("claimed_by", userId)
            .maybeSingle();
      const name = player?.full_name?.trim() ? player.full_name : player?.display_name ?? null;
      setUserName(name);
      setUserPlayerId(player?.id ?? null);
      setUserMissingAvatar(Boolean(player?.id) && !player?.avatar_url);
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

      if (admin.isSuper) {
        const tables = [
          "player_claim_requests",
          "player_update_requests",
          "admin_requests",
          "location_requests",
          "profile_merge_requests",
          "player_deletion_requests",
        ];
        const counts = await Promise.all(
          tables.map((table) => client.from(table).select("id", { count: "exact", head: true }).eq("status", "pending"))
        );
        setPendingRequestsCount(counts.reduce((sum, result) => sum + (result.count ?? 0), 0));
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
    if (typeof window === "undefined") return;
    if (admin.loading || admin.isSuper) return;
    if (!admin.userId || !userPlayerId) return;
    if (userMissingAvatar) {
      setShowProfilePrompt(true);
      return;
    }
    setShowProfilePrompt(false);
  }, [admin.loading, admin.isSuper, admin.userId, userPlayerId, userMissingAvatar]);

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
    const { error } = await client
      .from("player_claim_requests")
      .update({ status: "rejected" })
      .eq("id", pendingClaim.id)
      .eq("status", "pending");
    if (error) {
      setProfileMessage(`Failed to cancel claim: ${error.message}`);
      return;
    }
    setPendingClaim(null);
    setProfileMessage("Claim request cancelled.");
    setClaimStatusOpen(false);
  };

  return (
    <main className={`min-h-screen bg-slate-100 ${compactSuper ? "p-3 sm:p-4" : "p-4 sm:p-6"}`}>
      <div className={`mx-auto max-w-5xl ${compactSuper ? "space-y-3" : "space-y-3 sm:space-y-4"}`}>
        <RequireAuth>
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-slate-50 to-amber-50 p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Dashboard</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  {admin.isSuper
                    ? "Rack & Frame - Super User Control Centre"
                    : "Rack & Frame - League Management Platform"}
                </h1>
              </div>
              <PageNav />
            </div>
          </section>
          {completionMessage ? (
            <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
              {completionMessage}
            </section>
          ) : null}
          <section className={subtleCardClass}>
            <p className="text-sm text-slate-600">{admin.isSuper ? "Account" : "User Profile"}</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-slate-900">
                {admin.isSuper
                  ? `Super User Account${userName ? ` · ${userName}` : " · Martin Chamberlain"}`
                  : admin.isAdmin
                    ? "Administrator account"
                    : userName
                      ? `Logged in as ${userName}`
                      : "No player profile linked"}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  admin.isSuper
                    ? "bg-amber-100 text-amber-800"
                    : admin.isAdmin
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {admin.isSuper ? "Super User" : admin.isAdmin ? "Administrator" : "User"}
              </span>
            </div>
            {userEmail ? <p className="text-sm text-slate-600">Logged in: {userEmail}</p> : null}
            {admin.isSuper ? (
              <p className="mt-2 text-xs text-slate-700">
                Focus: league setup, venue/team governance, fixture publication, result approvals, knockout competition control, handicaps, and audit oversight.
              </p>
            ) : null}
            {!admin.isSuper && userPlayerId ? (
              <Link href={`/players/${userPlayerId}`} className={actionLinkClass}>
                View my profile
              </Link>
            ) : null}
            {!admin.isAdmin && !userName ? (
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                className={actionLinkClass}
              >
                Complete the profile check to link your player profile.
              </button>
            ) : null}
            {!admin.isAdmin && !userName && pendingClaim ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-sm text-amber-700">Claim pending approval for {pendingClaim.name}.</p>
                <button
                  type="button"
                  onClick={() => setClaimStatusOpen(true)}
                  className="text-sm text-teal-700 underline underline-offset-4"
                >
                  View claim status
                </button>
              </div>
            ) : null}
            {!admin.isAdmin && pendingResultSubmissionsCount > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Result submission pending approval ({pendingResultSubmissionsCount}).
                <Link href="/notifications" className="ml-2 underline underline-offset-2">
                  View status
                </Link>
              </div>
            ) : null}
            {profileMessage ? <p className="mt-2 text-sm text-slate-700">{profileMessage}</p> : null}
          </section>

          {!admin.isSuper ? (
            <section className={subtleCardClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Welcome & User Guide</p>
                <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {roleGuideLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{accountStatusText}</p>
              {leagueRole.teamNames.length > 0 ? (
                <p className="mt-1 text-xs text-slate-600">Linked team: {leagueRole.teamNames.join(", ")}</p>
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
                      ? "Use Captain Results to submit your fixture result on match day."
                      : "If assigned as captain/vice-captain, Captain Results is used for result submission."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">3. Track</p>
                  <p className="mt-1 text-sm text-slate-800">
                    Check <span className="font-semibold">Notifications</span> for profile claim and result approval updates.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <div className={cardBaseClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Main Tabs</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Central controls for league operations, competitions, governance, reporting, and platform administration.
                  </p>
                </div>
                {quickAccessLinks.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {quickAccessLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => handleNavClick(e, item.href)}
                        className={quickAccessChipClass(item.href)}
                      >
                        {item.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <div
                className={
                  admin.isSuper
                    ? "mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
                    : "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                }
              >
                {mainTabLinksWithGovernance.map((item) => (
                  isDisabledAdminFeature(item.href) ? (
                    <div
                      key={`${item.href}|${item.title}`}
                      className={`${primaryTileClass(item.href)} opacity-90`}
                    >
                      <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">{cardDescription(item.href, item.desc)}</p>
                      <div className="mt-3">
                        {hasPendingFeatureRequest(item.href) ? (
                          <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            Requested
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => requestFeatureAccess(item.href === "/quick-match" ? "quick_match" : "competition_create")}
                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                          >
                            Request Access
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Link
                      key={`${item.href}|${item.title}`}
                      href={item.href}
                      onClick={(e) => handleNavClick(e, item.href)}
                      className={primaryTileClass(item.href)}
                    >
                      <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">{cardDescription(item.href, item.desc)}</p>
                      <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${primaryTileBadgeClass(item.href)}`}>
                        Open
                      </span>
                    </Link>
                  )
                ))}
              </div>
            </div>
          </section>

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

          <section className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-center text-xs text-slate-600 shadow-sm">
            Product concept and delivery leadership: <span className="font-semibold text-slate-800">Martin Chamberlain</span>
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
        title="Add a profile photo"
        description="Your player profile does not have a photo yet. Open your profile now to upload one."
        confirmLabel="Review now"
        cancelLabel="Later"
        onConfirm={() => {
          setShowProfilePrompt(false);
          if (userPlayerId) router.push(`/players/${userPlayerId}?prompt=photo`);
        }}
        onCancel={() => {
          setShowProfilePrompt(false);
        }}
      />
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";

type NotificationItem = {
  key: string;
  title: string;
  detail: string;
  created_at: string;
  href: string;
  status: string;
};
type NotificationReadRow = {
  notification_key: string;
};

type OpenCompetitionRow = {
  id: string;
  name: string;
  created_at: string;
  signup_deadline: string | null;
};
type LeaguePublicationRow = {
  id: string;
  created_at: string;
  season_id: string;
  location_id: string;
  note: string | null;
};
type LeagueSeasonRow = { id: string; name: string };
type LeagueSubmissionRow = { id: string; fixture_id: string; status: string; created_at: string };
type FixtureChangeRequestRow = { id: string; fixture_id: string; status: string; created_at: string; request_type: "play_early" | "play_late"; proposed_fixture_date: string };
type LeagueFixtureRow = { id: string; home_team_id: string; away_team_id: string; fixture_date: string | null };
type FixtureLineupNotifyRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  fixture_date: string | null;
  status: string;
  home_lineup_submitted_at: string | null;
  away_lineup_submitted_at: string | null;
  pre_match_paper_record: boolean | null;
};
type LeagueTeamNameRow = { id: string; name: string };
type CompetitionEntryNotifyRow = {
  id: string;
  competition_id: string;
  requester_user_id: string;
  player_id: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  created_at: string;
};
type AppUserEmailRow = { id: string; email: string | null };
type PlayerNameRow = { id: string; full_name: string | null; display_name: string | null };
type LeagueReportRow = {
  id: string;
  report_type: "match" | "weekly";
  season_id: string;
  week_no: number | null;
  fixture_id: string | null;
  target_team_id: string;
  title: string;
  body: string;
  created_at: string;
};
type CompetitionMatchNotifyRow = {
  id: string;
  competition_id: string | null;
  status: "pending" | "in_progress" | "complete" | "bye";
  created_at: string;
  round_no: number | null;
  match_no: number | null;
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
};
type CompetitionRoundDeadlineRow = {
  id: string;
  competition_id: string;
  round_no: number;
  deadline_at: string;
};

function isMissingTableError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("could not find the table") || m.includes("does not exist");
}

const sectionCardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const sectionCardTintClass = "bg-gradient-to-br from-cyan-50 via-white to-emerald-50";

async function softQuery<T>(query: any) {
  const res = await query;
  if (res.error && isMissingTableError(res.error.message)) {
    return { data: [] as T[], error: null };
  }
  return { data: (res.data ?? []) as T[], error: res.error };
}

export default function NotificationsPage() {
  const admin = useAdminStatus();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [serverRead, setServerRead] = useState<Set<string>>(new Set());

  const dismissedKey = useMemo(
    () => (admin.userId ? `notifications_dismissed_${admin.userId}` : "notifications_dismissed"),
    [admin.userId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(dismissedKey);
    setDismissed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
  }, [dismissedKey]);
  useEffect(() => {
    const loadRead = async () => {
      const client = supabase;
      if (!client || !admin.userId) return;
      const res = await softQuery<NotificationReadRow>(
        client.from("notification_reads").select("notification_key").eq("user_id", admin.userId)
      );
      if (res.error) {
        if (!isMissingTableError(res.error.message)) {
          setMessage(`Failed to load notifications: ${res.error.message}`);
        }
        return;
      }
      setServerRead(new Set((res.data ?? []).map((r) => r.notification_key)));
    };
    loadRead();
  }, [admin.userId]);

  const saveDismissed = (next: Set<string>) => {
    setDismissed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(dismissedKey, JSON.stringify(Array.from(next)));
    }
  };
  const markRead = async (keys: string[]) => {
    const client = supabase;
    if (!client || !admin.userId || keys.length === 0) return;
    const rows = Array.from(new Set(keys)).map((k) => ({ user_id: admin.userId, notification_key: k }));
    const res = await client.from("notification_reads").upsert(rows, { onConflict: "user_id,notification_key" });
    if (res.error) {
      if (!isMissingTableError(res.error.message)) {
        setMessage(`Failed to save notification read state: ${res.error.message}`);
      }
      return;
    }
    setServerRead((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  };

  const loadLeagueFixtureLabels = async (rows: LeagueSubmissionRow[]) => {
    const client = supabase;
    const labels = new Map<string, string>();
    if (!client || rows.length === 0) return labels;

    const fixtureIds = Array.from(new Set(rows.map((r) => r.fixture_id).filter(Boolean)));
    if (!fixtureIds.length) return labels;

    const fixturesRes = await client
      .from("league_fixtures")
      .select("id,home_team_id,away_team_id,fixture_date")
      .in("id", fixtureIds);
    const fixtures = (fixturesRes.data ?? []) as LeagueFixtureRow[];
    if (!fixtures.length) return labels;

    const teamIds = Array.from(new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]).filter(Boolean)));
    const teamsRes = teamIds.length
      ? await client.from("league_teams").select("id,name").in("id", teamIds)
      : { data: [] as LeagueTeamNameRow[] };
    const teamById = new Map(((teamsRes.data ?? []) as LeagueTeamNameRow[]).map((t) => [t.id, t.name]));

    for (const f of fixtures) {
      const left = teamById.get(f.home_team_id) ?? "Home";
      const right = teamById.get(f.away_team_id) ?? "Away";
      const dateLabel = f.fixture_date ? ` · ${new Date(`${f.fixture_date}T12:00:00`).toLocaleDateString()}` : "";
      labels.set(f.id, `${left} vs ${right}${dateLabel}`);
    }
    return labels;
  };

  useEffect(() => {
    const load = async () => {
      const client = supabase;
      if (!client || admin.loading || !admin.userId) return;

      const out: NotificationItem[] = [];
      let userLocationId: string | null = null;
      let linkedPlayerId: string | null = null;
      let captainTeamIds = new Set<string>();
      if (admin.userId && !admin.isSuper) {
        const appUserRes = await client.from("app_users").select("linked_player_id").eq("id", admin.userId).maybeSingle();
        linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
        if (linkedPlayerId) {
          const playerRes = await client.from("players").select("location_id").eq("id", linkedPlayerId).maybeSingle();
          userLocationId = (playerRes.data?.location_id as string | null) ?? null;
          const captainRowsRes = await softQuery<{ team_id: string; is_captain: boolean; is_vice_captain: boolean }>(
            client
              .from("league_team_members")
              .select("team_id,is_captain,is_vice_captain")
              .eq("player_id", linkedPlayerId)
          );
          if (!captainRowsRes.error) {
            captainTeamIds = new Set(
              (captainRowsRes.data ?? [])
                .filter((r) => r.is_captain || r.is_vice_captain)
                .map((r) => r.team_id)
                .filter(Boolean)
            );
          }
        }
      }
      const openCompsRes = await client
        .from("competitions")
        .select("id,name,created_at,signup_deadline")
        .eq("signup_open", true)
        .eq("is_archived", false)
        .eq("is_completed", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!openCompsRes.error) {
        (openCompsRes.data ?? []).forEach((c: OpenCompetitionRow) => {
          out.push({
            key: `open_competition:${c.id}`,
            title: "Open competition available",
            detail: c.signup_deadline
              ? `${c.name} · Sign-up closes ${new Date(c.signup_deadline).toLocaleString()}`
              : `${c.name} · Sign-up is open`,
            created_at: c.created_at,
            href: "/signups",
            status: "open",
          });
        });
      }
      const roundDeadlineRes = await softQuery<CompetitionRoundDeadlineRow>(
        client
          .from("competition_round_deadlines")
          .select("id,competition_id,round_no,deadline_at")
          .order("deadline_at", { ascending: true })
          .limit(300)
      );
      if (!roundDeadlineRes.error) {
        const deadlineRows = roundDeadlineRes.data ?? [];
        let relevantCompetitionIds = new Set<string>();
        if (admin.isSuper) {
          relevantCompetitionIds = new Set(deadlineRows.map((r) => r.competition_id));
        } else {
          const [myByUserRes, myByPlayerRes] = await Promise.all([
            softQuery<{ competition_id: string }>(
              client
                .from("competition_entries")
                .select("competition_id")
                .eq("requester_user_id", admin.userId)
                .in("status", ["pending", "approved"])
                .limit(500)
            ),
            linkedPlayerId
              ? softQuery<{ competition_id: string }>(
                  client
                    .from("competition_entries")
                    .select("competition_id")
                    .eq("player_id", linkedPlayerId)
                    .in("status", ["pending", "approved"])
                    .limit(500)
                )
              : Promise.resolve({ data: [] as { competition_id: string }[], error: null }),
          ]);
          relevantCompetitionIds = new Set(
            [...(myByUserRes.data ?? []), ...(myByPlayerRes.data ?? [])]
              .map((r) => r.competition_id)
              .filter(Boolean)
          );
        }
        const relevantDeadlines = deadlineRows.filter((r) => relevantCompetitionIds.has(r.competition_id));
        const compIds = Array.from(new Set(relevantDeadlines.map((r) => r.competition_id)));
        const compNameRes = compIds.length
          ? await softQuery<{ id: string; name: string }>(client.from("competitions").select("id,name").in("id", compIds))
          : { data: [] as { id: string; name: string }[], error: null };
        const compNameById = new Map((compNameRes.data ?? []).map((c) => [c.id, c.name]));
        for (const r of relevantDeadlines) {
          const diffDays = (Date.parse(r.deadline_at) - Date.now()) / (1000 * 60 * 60 * 24);
          let stage: "14d" | "7d" | "overdue" | null = null;
          let title = "";
          let status = "pending";
          if (diffDays < 0) {
            stage = "overdue";
            title = "Competition round deadline overdue";
            status = "rejected";
          } else if (diffDays <= 7) {
            stage = "7d";
            title = "Competition round deadline in 7 days";
            status = "pending";
          } else if (diffDays <= 14) {
            stage = "14d";
            title = "Competition round deadline in 14 days";
            status = "open";
          }
          if (!stage) continue;
          out.push({
            key: `comp_round_deadline:${stage}:${r.competition_id}:${r.round_no}`,
            title,
            detail: `${compNameById.get(r.competition_id) ?? "Competition"} · Round ${r.round_no} · Due ${new Date(r.deadline_at).toLocaleString()}`,
            created_at: r.deadline_at,
            href: "/league",
            status,
          });
        }
      }
      const publicationQuery = client
        .from("league_fixture_publications")
        .select("id,created_at,season_id,location_id,note")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!admin.isSuper && userLocationId) publicationQuery.eq("location_id", userLocationId);
      const publicationRes = await publicationQuery;
      if (!publicationRes.error) {
        const publicationRows = (publicationRes.data ?? []) as LeaguePublicationRow[];
        const seasonIds = Array.from(new Set(publicationRows.map((r) => r.season_id)));
        const seasonRes = seasonIds.length
          ? await client.from("league_seasons").select("id,name").in("id", seasonIds)
          : { data: [] as LeagueSeasonRow[] };
        const seasonById = new Map(((seasonRes.data ?? []) as LeagueSeasonRow[]).map((s) => [s.id, s.name]));
        publicationRows.forEach((r) => {
          out.push({
            key: `league_publication:${r.id}`,
            title: "League fixtures published",
            detail: `${seasonById.get(r.season_id) ?? "League season"} · ${r.note ?? "Fixtures are now available."}`,
            created_at: r.created_at,
            href: "/league",
            status: "published",
          });
        });
      }
      if (admin.isAdmin) {
        const leagueSubmissionRes = await client
          .from("league_result_submissions")
          .select("id,fixture_id,status,created_at")
          .eq("submitted_by_user_id", admin.userId)
          .in("status", ["pending", "approved", "rejected"]);
        if (!leagueSubmissionRes.error) {
          (leagueSubmissionRes.data ?? []).forEach((r: LeagueSubmissionRow) => {
            const statusLabel = r.status === "pending" ? "Pending approval" : r.status === "approved" ? "Approved" : "Rejected";
            out.push({
              key: `league_submission:${r.id}`,
              title: "League result submission update",
              detail: `${statusLabel} · Fixture ${r.fixture_id.slice(0, 8)}`,
              created_at: r.created_at,
              href: "/captain-results",
              status: r.status,
            });
          });
        }
      }
      if (admin.isSuper) {
        const [leaguePendingRes, fixtureChangePendingRes, claimRes, updateRes, adminReqRes, locationReqRes, competitionPendingRes] = await Promise.all([
          softQuery<LeagueSubmissionRow>(client.from("league_result_submissions").select("id,fixture_id,status,created_at").eq("status", "pending").order("created_at", { ascending: false })),
          softQuery<FixtureChangeRequestRow>(client.from("league_fixture_change_requests").select("id,fixture_id,status,created_at,request_type,proposed_fixture_date").eq("status", "pending").order("created_at", { ascending: false })),
          softQuery<{ id: string; created_at: string; status: string }>(client.from("player_claim_requests").select("id,created_at,status").eq("status", "pending").order("created_at", { ascending: false })),
          softQuery<{ id: string; player_id: string; requested_avatar_url?: string | null; created_at: string; status: string }>(
            client
              .from("player_update_requests")
              .select("id,player_id,requested_avatar_url,created_at,status")
              .eq("status", "pending")
              .order("created_at", { ascending: false })
          ),
          softQuery<{ id: string; created_at: string; status: string }>(client.from("admin_requests").select("id,created_at,status").eq("status", "pending").order("created_at", { ascending: false })),
          softQuery<{ id: string; requester_full_name: string; requested_location_name: string; created_at: string; status: string }>(client.from("location_requests").select("id,requester_full_name,requested_location_name,created_at,status").eq("status", "pending").order("created_at", { ascending: false })),
          softQuery<CompetitionEntryNotifyRow>(client.from("competition_entries").select("id,competition_id,requester_user_id,player_id,status,created_at").eq("status", "pending").order("created_at", { ascending: false })),
        ]);

        if (leaguePendingRes.error || fixtureChangePendingRes.error || claimRes.error || updateRes.error || adminReqRes.error || locationReqRes.error || competitionPendingRes.error) {
          const firstError =
            leaguePendingRes.error?.message ??
            fixtureChangePendingRes.error?.message ??
            claimRes.error?.message ??
            updateRes.error?.message ??
            adminReqRes.error?.message ??
            locationReqRes.error?.message ??
            competitionPendingRes.error?.message ??
            "Unknown error";
          setMessage(`Failed to load notifications: ${firstError}`);
          return;
        }

        const pendingRows = (leaguePendingRes.data ?? []) as LeagueSubmissionRow[];
        const labels = await loadLeagueFixtureLabels(pendingRows);
        pendingRows.forEach((r) => {
          out.push({
            key: `league_pending:${r.id}`,
            title: "League result submission pending approval",
            detail: labels.get(r.fixture_id) ?? `Fixture ${r.fixture_id.slice(0, 8)}`,
            created_at: r.created_at,
            href: "/results",
            status: r.status,
          });
        });
        const fixtureChangeRows = (fixtureChangePendingRes.data ?? []) as FixtureChangeRequestRow[];
        const fixtureChangeLabels = await loadLeagueFixtureLabels(fixtureChangeRows.map((r) => ({ id: r.id, fixture_id: r.fixture_id, status: r.status, created_at: r.created_at })));
        fixtureChangeRows.forEach((r) => {
          const typeLabel = r.request_type === "play_early" ? "Play before league date" : "Exceptional postponement request";
          out.push({
            key: `fixture_change_pending:${r.id}`,
            title: "Fixture date request pending approval",
            detail: `${fixtureChangeLabels.get(r.fixture_id) ?? `Fixture ${r.fixture_id.slice(0, 8)}`} · ${typeLabel} · ${new Date(`${r.proposed_fixture_date}T12:00:00`).toLocaleDateString()}`,
            created_at: r.created_at,
            href: "/results",
            status: r.status,
          });
        });
        (claimRes.data ?? []).forEach((r: { id: string; created_at: string; status: string }) => {
          out.push({
            key: `claim:${r.id}`,
            title: "Player claim request pending",
            detail: "Review on Signup Requests",
            created_at: r.created_at,
            href: "/signup-requests",
            status: r.status,
          });
        });
        (updateRes.data ?? []).forEach((r: { id: string; player_id: string; requested_avatar_url?: string | null; created_at: string; status: string }) => {
          out.push({
            key: `update:${r.id}`,
            title: r.requested_avatar_url ? "Profile photo approval pending" : "Profile update request pending",
            detail: r.requested_avatar_url ? `Player ${r.player_id} · photo submitted for approval` : `Player ${r.player_id}`,
            created_at: r.created_at,
            href: "/players?tab=claims",
            status: r.status,
          });
        });
        (adminReqRes.data ?? []).forEach((r: { id: string; created_at: string; status: string }) => {
          out.push({
            key: `admin:${r.id}`,
            title: "Admin access request pending",
            detail: "Review in Role Management",
            created_at: r.created_at,
            href: "/players",
            status: r.status,
          });
        });
        (locationReqRes.data ?? []).forEach((r: { id: string; requester_full_name: string; requested_location_name: string; created_at: string; status: string }) => {
          out.push({
            key: `location:${r.id}`,
            title: "Location request pending",
            detail: `${r.requester_full_name} requested "${r.requested_location_name}"`,
            created_at: r.created_at,
            href: "/signup-requests",
            status: r.status,
          });
        });
        const pendingCompetitionEntries = (competitionPendingRes.data ?? []) as CompetitionEntryNotifyRow[];
        const pendingCompetitionIds = Array.from(new Set(pendingCompetitionEntries.map((r) => r.competition_id).filter(Boolean)));
        const pendingCompetitionPlayerIds = Array.from(new Set(pendingCompetitionEntries.map((r) => r.player_id).filter(Boolean))) as string[];
        const pendingCompetitionRequesterIds = Array.from(new Set(pendingCompetitionEntries.map((r) => r.requester_user_id).filter(Boolean)));
        const competitionNamesRes = pendingCompetitionIds.length
          ? await client.from("competitions").select("id,name").in("id", pendingCompetitionIds)
          : { data: [] as Array<{ id: string; name: string }> };
        const playerNamesRes = pendingCompetitionPlayerIds.length
          ? await client.from("players").select("id,full_name,display_name").in("id", pendingCompetitionPlayerIds)
          : { data: [] as PlayerNameRow[] };
        const requesterEmailsRes = pendingCompetitionRequesterIds.length
          ? await client.from("app_users").select("id,email").in("id", pendingCompetitionRequesterIds)
          : { data: [] as AppUserEmailRow[] };
        const competitionNameById = new Map(((competitionNamesRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
        const playerNameById = new Map(
          ((playerNamesRes.data ?? []) as PlayerNameRow[]).map((p) => [p.id, p.full_name?.trim() || p.display_name || "Unknown player"])
        );
        const requesterEmailById = new Map(((requesterEmailsRes.data ?? []) as AppUserEmailRow[]).map((u) => [u.id, u.email || "Unknown user"]));
        pendingCompetitionEntries.forEach((r) => {
          const entrantLabel = r.player_id
            ? playerNameById.get(r.player_id) ?? "Unknown player"
            : requesterEmailById.get(r.requester_user_id) ?? "Unknown user";
          out.push({
            key: `competition_entry_pending:${r.id}`,
            title: "Competition entry pending approval",
            detail: `${competitionNameById.get(r.competition_id) ?? "Competition"} · ${entrantLabel}`,
            created_at: r.created_at,
            href: "/league",
            status: r.status,
          });
        });
      } else if (admin.isAdmin) {
        const [leaguePendingRes, fixtureChangePendingRes] = await Promise.all([
          softQuery<LeagueSubmissionRow>(
            client
              .from("league_result_submissions")
              .select("id,fixture_id,status,created_at")
              .eq("status", "pending")
              .order("created_at", { ascending: false })
          ),
          softQuery<FixtureChangeRequestRow>(
            client
              .from("league_fixture_change_requests")
              .select("id,fixture_id,status,created_at,request_type,proposed_fixture_date")
              .eq("status", "pending")
              .order("created_at", { ascending: false })
          ),
        ]);
        if (leaguePendingRes.error || fixtureChangePendingRes.error) {
          setMessage(`Failed to load notifications: ${leaguePendingRes.error?.message ?? fixtureChangePendingRes.error?.message}`);
          return;
        }
        const pendingRows = (leaguePendingRes.data ?? []) as LeagueSubmissionRow[];
        const labels = await loadLeagueFixtureLabels(pendingRows);
        pendingRows.forEach((r) => {
          out.push({
            key: `league_pending:${r.id}`,
            title: "League result submission pending approval",
            detail: labels.get(r.fixture_id) ?? `Fixture ${r.fixture_id.slice(0, 8)}`,
            created_at: r.created_at,
            href: "/results",
            status: r.status,
          });
        });
        const fixtureChangeRows = (fixtureChangePendingRes.data ?? []) as FixtureChangeRequestRow[];
        const fixtureChangeLabels = await loadLeagueFixtureLabels(fixtureChangeRows.map((r) => ({ id: r.id, fixture_id: r.fixture_id, status: r.status, created_at: r.created_at })));
        fixtureChangeRows.forEach((r) => {
          const typeLabel = r.request_type === "play_early" ? "Play before league date" : "Exceptional postponement request";
          out.push({
            key: `fixture_change_pending:${r.id}`,
            title: "Fixture date request pending approval",
            detail: `${fixtureChangeLabels.get(r.fixture_id) ?? `Fixture ${r.fixture_id.slice(0, 8)}`} · ${typeLabel} · ${new Date(`${r.proposed_fixture_date}T12:00:00`).toLocaleDateString()}`,
            created_at: r.created_at,
            href: "/results",
            status: r.status,
          });
        });
      } else {
        const [leagueResultRes, claimRes, updateRes, adminReqRes, competitionEntryRes] = await Promise.all([
          softQuery<LeagueSubmissionRow>(
            client
              .from("league_result_submissions")
              .select("id,fixture_id,status,created_at")
              .eq("submitted_by_user_id", admin.userId)
              .in("status", ["pending", "approved", "rejected"])
              .order("created_at", { ascending: false })
          ),
          softQuery<{ id: string; created_at: string; status: string }>(
            client
              .from("player_claim_requests")
              .select("id,created_at,status")
              .eq("requester_user_id", admin.userId)
              .in("status", ["pending", "approved", "rejected"])
              .order("created_at", { ascending: false })
          ),
          softQuery<{ id: string; player_id: string; requested_avatar_url?: string | null; created_at: string; status: string }>(
            client
              .from("player_update_requests")
              .select("id,player_id,requested_avatar_url,created_at,status")
              .eq("requester_user_id", admin.userId)
              .in("status", ["pending", "approved", "rejected"])
              .order("created_at", { ascending: false })
          ),
          softQuery<{ id: string; created_at: string; status: string }>(
            client
              .from("admin_requests")
              .select("id,created_at,status")
              .eq("requester_user_id", admin.userId)
              .in("status", ["pending", "approved", "rejected"])
              .order("created_at", { ascending: false })
          ),
          softQuery<CompetitionEntryNotifyRow>(
            client
              .from("competition_entries")
              .select("id,competition_id,requester_user_id,player_id,status,created_at")
              .eq("requester_user_id", admin.userId)
              .in("status", ["pending", "approved", "rejected"])
              .order("created_at", { ascending: false })
          ),
        ]);

        if (leagueResultRes.error || claimRes.error || updateRes.error || adminReqRes.error || competitionEntryRes.error) {
          const firstError =
            leagueResultRes.error?.message ??
            claimRes.error?.message ??
            updateRes.error?.message ??
            adminReqRes.error?.message ??
            competitionEntryRes.error?.message ??
            "Unknown error";
          setMessage(`Failed to load notifications: ${firstError}`);
          return;
        }

        const resultRows = (leagueResultRes.data ?? []) as LeagueSubmissionRow[];
        const labels = await loadLeagueFixtureLabels(resultRows);
        resultRows.forEach((r) => {
          out.push({
            key: `league_submission:${r.id}`,
            title: `League result submission ${r.status}`,
            detail: labels.get(r.fixture_id) ?? `Fixture ${r.fixture_id.slice(0, 8)}`,
            created_at: r.created_at,
            href: "/captain-results",
            status: r.status,
          });
        });
        (claimRes.data ?? []).forEach((r: { id: string; created_at: string; status: string }) => {
          out.push({
            key: `claim:${r.id}`,
            title: `Profile claim ${r.status}`,
            detail: r.status === "pending" ? "Open claim status" : "Open dashboard",
            created_at: r.created_at,
            href: r.status === "pending" ? "/?claimStatus=1" : "/",
            status: r.status,
          });
        });
        (updateRes.data ?? []).forEach((r: { id: string; player_id: string; requested_avatar_url?: string | null; created_at: string; status: string }) => {
          out.push({
            key: `update:${r.id}`,
            title: r.requested_avatar_url ? `Profile photo ${r.status}` : `Profile update ${r.status}`,
            detail: r.requested_avatar_url ? "Photo submission status" : `Player ${r.player_id}`,
            created_at: r.created_at,
            href: "/players",
            status: r.status,
          });
        });
        (adminReqRes.data ?? []).forEach((r: { id: string; created_at: string; status: string }) => {
          out.push({
            key: `admin:${r.id}`,
            title: `Admin access request ${r.status}`,
            detail: "Open your profile",
            created_at: r.created_at,
            href: "/",
            status: r.status,
          });
        });
        const userCompetitionEntries = (competitionEntryRes.data ?? []) as CompetitionEntryNotifyRow[];
        const competitionIds = Array.from(new Set(userCompetitionEntries.map((r) => r.competition_id).filter(Boolean)));
        const competitionNamesRes = competitionIds.length
          ? await client.from("competitions").select("id,name").in("id", competitionIds)
          : { data: [] as Array<{ id: string; name: string }> };
        const competitionNameById = new Map(((competitionNamesRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
        userCompetitionEntries.forEach((r) => {
          const statusLabel = r.status === "pending" ? "Pending review" : r.status === "approved" ? "Approved" : "Rejected";
          out.push({
            key: `competition_entry:${r.id}`,
            title: "Competition entry update",
            detail: `${statusLabel} · ${competitionNameById.get(r.competition_id) ?? "Competition"}`,
            created_at: r.created_at,
            href: "/signups",
            status: r.status,
          });
        });

        if (captainTeamIds.size > 0) {
          let lineupRows: FixtureLineupNotifyRow[] = [];
          const lineupRes = await client
            .from("league_fixtures")
            .select("id,home_team_id,away_team_id,fixture_date,status,home_lineup_submitted_at,away_lineup_submitted_at,pre_match_paper_record")
            .in("away_team_id", Array.from(captainTeamIds))
            .in("status", ["pending", "in_progress"])
            .not("home_lineup_submitted_at", "is", null)
            .is("away_lineup_submitted_at", null)
            .eq("pre_match_paper_record", false)
            .order("fixture_date", { ascending: true });
          if (!lineupRes.error) {
            lineupRows = (lineupRes.data ?? []) as FixtureLineupNotifyRow[];
          } else if (!lineupRes.error.message.toLowerCase().includes("pre_match_")) {
            setMessage(`Failed to load notifications: ${lineupRes.error.message}`);
            return;
          }
          if (lineupRows.length > 0) {
            const labels = await loadLeagueFixtureLabels(
              lineupRows.map((row) => ({
                id: row.id,
                fixture_id: row.id,
                status: row.status,
                created_at: row.home_lineup_submitted_at ?? row.fixture_date ?? new Date().toISOString(),
              }))
            );
            lineupRows.forEach((row) => {
              out.push({
                key: `away_lineup_due:${row.id}:${row.home_lineup_submitted_at ?? ""}`,
                title: "Away lineup required",
                detail: `${labels.get(row.id) ?? `Fixture ${row.id.slice(0, 8)}`} · Home team has submitted its lineup`,
                created_at: row.home_lineup_submitted_at ?? row.fixture_date ?? new Date().toISOString(),
                href: `/captain-results?fixtureId=${row.id}`,
                status: "pending",
              });
            });
          }
        }

        if (linkedPlayerId) {
          const matchRes = await softQuery<CompetitionMatchNotifyRow>(
            client
              .from("matches")
              .select(
                "id,competition_id,status,created_at,round_no,match_no,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id"
              )
              .eq("is_archived", false)
              .not("competition_id", "is", null)
              .or(
                [
                  `player1_id.eq.${linkedPlayerId}`,
                  `player2_id.eq.${linkedPlayerId}`,
                  `team1_player1_id.eq.${linkedPlayerId}`,
                  `team1_player2_id.eq.${linkedPlayerId}`,
                  `team2_player1_id.eq.${linkedPlayerId}`,
                  `team2_player2_id.eq.${linkedPlayerId}`,
                ].join(",")
              )
              .order("created_at", { ascending: false })
              .limit(100)
          );
          if (matchRes.error) {
            setMessage(`Failed to load notifications: ${matchRes.error.message}`);
            return;
          }
          const matchRows = (matchRes.data ?? []) as CompetitionMatchNotifyRow[];
          const compIds = Array.from(new Set(matchRows.map((m) => m.competition_id).filter(Boolean))) as string[];
          const allPlayerIds = Array.from(
            new Set(
              matchRows.flatMap((m) =>
                [
                  m.player1_id,
                  m.player2_id,
                  m.team1_player1_id,
                  m.team1_player2_id,
                  m.team2_player1_id,
                  m.team2_player2_id,
                ].filter(Boolean)
              )
            )
          ) as string[];
          const [compRes, playersRes] = await Promise.all([
            compIds.length ? client.from("competitions").select("id,name").in("id", compIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
            allPlayerIds.length ? client.from("players").select("id,full_name,display_name").in("id", allPlayerIds) : Promise.resolve({ data: [] as PlayerNameRow[] }),
          ]);
          const compName = new Map(((compRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
          const playerName = new Map(
            ((playersRes.data ?? []) as PlayerNameRow[]).map((p) => [p.id, p.full_name?.trim() || p.display_name || "Unknown"])
          );
          for (const m of matchRows) {
            const names = [
              m.player1_id,
              m.player2_id,
              m.team1_player1_id,
              m.team1_player2_id,
              m.team2_player1_id,
              m.team2_player2_id,
            ]
              .filter(Boolean)
              .map((id) => id as string);
            const opponents = names.filter((id) => id !== linkedPlayerId).map((id) => playerName.get(id) ?? "Opponent");
            const oppLabel = opponents.length ? opponents.join(" / ") : "Opponent TBC";
            const roundLabel = m.round_no ? `Round ${m.round_no}` : "Round";
            const matchLabel = m.match_no ? `Match ${m.match_no}` : "Match";
            out.push({
              key: `competition_match:${m.id}:${m.status}`,
              title:
                m.status === "complete"
                  ? "Competition match completed"
                  : m.status === "in_progress"
                    ? "Competition match in progress"
                    : "Competition draw assignment",
              detail: `${compName.get(m.competition_id ?? "") ?? "Competition"} · ${roundLabel} · ${matchLabel} · vs ${oppLabel}`,
              created_at: m.created_at,
              href: `/matches/${m.id}`,
              status: m.status,
            });
          }
        }
      }
      if (!admin.isSuper && captainTeamIds.size > 0) {
        const reportRes = await softQuery<LeagueReportRow>(
          client
            .from("league_reports")
            .select("id,report_type,season_id,week_no,fixture_id,target_team_id,title,body,created_at")
            .in("target_team_id", Array.from(captainTeamIds))
            .order("created_at", { ascending: false })
            .limit(200)
        );
        if (reportRes.error) {
          setMessage(`Failed to load notifications: ${reportRes.error.message}`);
          return;
        }
        (reportRes.data ?? []).forEach((r) => {
          out.push({
            key: `league_report:${r.id}`,
            title: r.title,
            detail:
              r.report_type === "weekly"
                ? `Week ${r.week_no ?? "?"} round-up available`
                : "Match report available",
            created_at: r.created_at,
            href: "/events",
            status: "report",
          });
        });
      }

      out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const unique: NotificationItem[] = [];
      const seen = new Set<string>();
      for (const item of out) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        unique.push(item);
      }
      setItems(unique);
    };
    load();
  }, [admin.loading, admin.isAdmin, admin.isSuper, admin.userId]);

  const visible = useMemo(
    () => items.filter((n) => !dismissed.has(n.key) && !serverRead.has(n.key)),
    [items, dismissed, serverRead]
  );

  const statusClass = (status: string) => {
    if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-800";
    if (status === "approved" || status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-800";
    if (status === "report") return "border-indigo-200 bg-indigo-50 text-indigo-800";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Notifications" eyebrow="Inbox" subtitle="Read and manage your notifications." />
          <section className={`${sectionCardClass} ${sectionCardTintClass}`}>
            <p className="text-sm text-slate-700">
              {admin.isSuper
                ? "Scope: System and operational notifications."
                : admin.isAdmin
                  ? "Scope: Operational notifications."
                  : "Scope: Your account notifications."}
            </p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-600">Notifications stay here until you delete them.</p>
              <button
                type="button"
                onClick={() => {
                  const keys = items.map((n) => n.key);
                  saveDismissed(new Set(keys));
                  void markRead(keys);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
              >
                Delete all
              </button>
            </div>
            <MessageModal message={message} onClose={() => setMessage(null)} />
            <div className="space-y-2">
              {visible.length === 0 ? <p className="text-sm text-slate-600">No notifications.</p> : null}
              {visible.map((n) => (
                <div key={n.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white via-white to-cyan-50 px-3 py-2">
                  <Link href={n.href} className="min-w-[220px] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{n.title}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${statusClass(n.status)}`}>
                        {n.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{n.detail}</p>
                    <p className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString()}</p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(dismissed);
                      next.add(n.key);
                      saveDismissed(next);
                      void markRead([n.key]);
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        </RequireAuth>
      </div>
    </main>
  );
}

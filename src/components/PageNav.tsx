"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import ConfirmModal from "@/components/ConfirmModal";
import AppNavigationMenu from "@/components/AppNavigationMenu";
import { logAudit } from "@/lib/audit";

type PageNavProps = {
  warnOnNavigate?: boolean;
  warnMessage?: string;
};

export default function PageNav({ warnOnNavigate = false, warnMessage = "You have unsaved changes. Leave this screen?" }: PageNavProps) {
  const router = useRouter();
  const admin = useAdminStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingNav, setPendingNav] = useState<"back" | "home" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const storageKey = useMemo(() => (admin.userId ? `notifications_last_read_${admin.userId}` : "notifications_last_read"), [admin.userId]);
  const dismissedKey = useMemo(
    () => (admin.userId ? `notifications_dismissed_${admin.userId}` : "notifications_dismissed"),
    [admin.userId]
  );
  const performNavigation = (target: "back" | "home") => {
    if (target === "back") router.back();
    else router.push("/");
  };

  const requestNavigation = (target: "back" | "home") => {
    if (!warnOnNavigate) {
      performNavigation(target);
      return;
    }
    setPendingNav(target);
  };

  const onSignOut = async () => {
    if (typeof window !== "undefined" && admin.userId) {
      const prefix = `profile_photo_prompt_seen_${admin.userId}_`;
      for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = window.sessionStorage.key(i);
        if (key?.startsWith(prefix)) {
          window.sessionStorage.removeItem(key);
        }
      }
    }
    const client = supabase;
    await logAudit("auth_sign_out", { entityType: "auth", summary: "User signed out." });
    if (client) await client.auth.signOut();
    router.replace("/auth/sign-in");
  };

  const onNotifications = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    }
    router.push("/notifications");
  };

  const showBack = true;

  useEffect(() => {
    const load = async () => {
      const client = supabase;
      if (!client || admin.loading) return;
      if (!admin.userId) return;
      const lastRead = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
      const applyCreatedFilter = (query: any) => (lastRead ? query.gt("created_at", lastRead) : query);
      const applyResultFilter = (query: any) => (lastRead ? query.gt("submitted_at", lastRead) : query);
      const applyLeagueResultFilter = (query: any) => (lastRead ? query.gt("created_at", lastRead) : query);
      const loadResultRows = async (statuses: string[], onlyUserId?: string) => {
        let q = client.from("result_submissions").select("id,submitted_by_user_id,status,submitted_at");
        if (statuses.length === 1) q = q.eq("status", statuses[0]);
        else q = q.in("status", statuses);
        if (onlyUserId) q = q.eq("submitted_by_user_id", onlyUserId);
        const legacy = await applyResultFilter(q);
        if (!legacy.error) return (legacy.data ?? []) as Array<{ id: string }>;
        if (!legacy.error.message.toLowerCase().includes("result_submissions")) return [] as Array<{ id: string }>;

        let lq = client.from("league_result_submissions").select("id,submitted_by_user_id,status,created_at");
        if (statuses.length === 1) lq = lq.eq("status", statuses[0]);
        else lq = lq.in("status", statuses);
        if (onlyUserId) lq = lq.eq("submitted_by_user_id", onlyUserId);
        const league = await applyLeagueResultFilter(lq);
        return ((league.data ?? []) as Array<{ id: string }>);
      };
      if (admin.isSuper) {
        const dismissed = typeof window !== "undefined" ? new Set<string>(JSON.parse(window.localStorage.getItem(dismissedKey) ?? "[]")) : new Set<string>();
        const resultRows = await loadResultRows(["pending"]);
        const { data: claimRows } = await applyCreatedFilter(
          client.from("player_claim_requests").select("id").eq("status", "pending")
        );
        const { data: sessionRes } = await client.auth.getSession();
        const token = sessionRes.session?.access_token;
        let updateRows: Array<{ id: string }> = [];
        if (token) {
          const resp = await fetch("/api/player-update-requests?mode=approvals", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok) {
            updateRows = (data?.requests ?? []) as Array<{ id: string }>;
          }
        }
        const { data: adminReqRows } = await applyCreatedFilter(
          client.from("admin_requests").select("id").eq("status", "pending")
        );
        const { data: locationReqRows } = await applyCreatedFilter(
          client.from("location_requests").select("id").eq("status", "pending")
        );
        const { data: entryPackRows } = await applyCreatedFilter(
          client.from("league_entry_packs").select("id,created_at").eq("status", "submitted")
        );
        const ids = [
          ...(resultRows ?? []).map((r: { id: string }) => `result:${r.id}`),
          ...(claimRows ?? []).map((r: { id: string }) => `claim:${r.id}`),
          ...updateRows.map((r: { id: string }) => `update:${r.id}`),
          ...(adminReqRows ?? []).map((r: { id: string }) => `admin:${r.id}`),
          ...(locationReqRows ?? []).map((r: { id: string }) => `location:${r.id}`),
          ...(entryPackRows ?? []).map((r: { id: string }) => `entry-pack:${r.id}`),
        ];
        setPendingCount(ids.filter((id) => !dismissed.has(id)).length);
      } else if (admin.isAdmin) {
        const dismissed = typeof window !== "undefined" ? new Set<string>(JSON.parse(window.localStorage.getItem(dismissedKey) ?? "[]")) : new Set<string>();
        const resultRows = await loadResultRows(["pending"]);
        const { data: sessionRes } = await client.auth.getSession();
        const token = sessionRes.session?.access_token;
        let updateRows: Array<{ id: string }> = [];
        if (token) {
          const resp = await fetch("/api/player-update-requests?mode=approvals", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok) {
            updateRows = (data?.requests ?? []) as Array<{ id: string }>;
          }
        }
        const { data: claimRows } = admin.canManageLeague
          ? await applyCreatedFilter(client.from("player_claim_requests").select("id").eq("status", "pending"))
          : { data: [] as Array<{ id: string }> };
        const { data: locationRows } = admin.canManageLeague
          ? await applyCreatedFilter(client.from("location_requests").select("id").eq("status", "pending"))
          : { data: [] as Array<{ id: string }> };
        const { data: entryPackRows } = admin.canManageLeague
          ? await applyCreatedFilter(client.from("league_entry_packs").select("id,created_at").eq("status", "submitted"))
          : { data: [] as Array<{ id: string }> };
        const ids = [
          ...(resultRows ?? []).map((r: { id: string }) => `result:${r.id}`),
          ...updateRows.map((r: { id: string }) => `update:${r.id}`),
          ...(claimRows ?? []).map((r: { id: string }) => `claim:${r.id}`),
          ...(locationRows ?? []).map((r: { id: string }) => `location:${r.id}`),
          ...(entryPackRows ?? []).map((r: { id: string }) => `entry-pack:${r.id}`),
        ];
        setPendingCount(ids.filter((id) => !dismissed.has(id)).length);
      } else {
        const dismissed = typeof window !== "undefined" ? new Set<string>(JSON.parse(window.localStorage.getItem(dismissedKey) ?? "[]")) : new Set<string>();
        const resultRows = await loadResultRows(["pending", "approved", "rejected"], admin.userId);
        const { data: claimRows } = await applyCreatedFilter(
          client
            .from("player_claim_requests")
            .select("id")
            .in("status", ["pending", "approved", "rejected"])
            .eq("requester_user_id", admin.userId)
        );
        const { data: updateRows } = await applyCreatedFilter(
          client
            .from("player_update_requests")
            .select("id")
            .in("status", ["pending", "approved", "rejected"])
            .eq("requester_user_id", admin.userId)
        );
        const { data: adminReqRows } = await applyCreatedFilter(
          client
            .from("admin_requests")
            .select("id")
            .in("status", ["pending", "approved", "rejected"])
            .eq("requester_user_id", admin.userId)
        );
        const ids = [
          ...(resultRows ?? []).map((r: { id: string }) => `result:${r.id}`),
          ...(claimRows ?? []).map((r: { id: string }) => `claim:${r.id}`),
          ...(updateRows ?? []).map((r: { id: string }) => `update:${r.id}`),
          ...(adminReqRows ?? []).map((r: { id: string }) => `admin:${r.id}`),
        ];
        setPendingCount(ids.filter((id) => !dismissed.has(id)).length);
      }
    };
    load();
  }, [admin.loading, admin.isAdmin, admin.isSuper, admin.canManageLeague, admin.userId, storageKey, dismissedKey]);

  return (
    <div className="flex w-auto items-center justify-end gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 hover:border-teal-300 hover:bg-teal-50"
        aria-label="Open app menu"
      >
        <span aria-hidden="true" className="text-base leading-none">☰</span>
        <span className="hidden sm:inline">Menu</span>
      </button>
      <button
        type="button"
        onClick={onNotifications}
        className="relative grid h-10 w-10 place-items-center whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 hover:border-teal-300 hover:bg-teal-50"
        aria-label="Notifications"
      >
        🔔
        {pendingCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            {pendingCount}
          </span>
        ) : null}
      </button>
      {showBack ? (
        <button type="button" aria-label="Go back" onClick={() => requestNavigation("back")} className="hidden h-10 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 hover:border-teal-300 hover:bg-teal-50 sm:inline-flex">
          <span aria-hidden="true">←</span><span className="hidden lg:inline">Back</span>
        </button>
      ) : null}
      <button type="button" aria-label="Go home" onClick={() => requestNavigation("home")} className="hidden h-10 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 hover:border-teal-300 hover:bg-teal-50 sm:inline-flex">
        <span aria-hidden="true">⌂</span><span className="hidden lg:inline">Home</span>
      </button>
      <button type="button" aria-label="Sign out" onClick={onSignOut} className="hidden h-10 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 sm:inline-flex">
        <span aria-hidden="true">↪</span><span className="hidden lg:inline">Sign out</span>
      </button>
      <ConfirmModal
        open={Boolean(pendingNav)}
        title="Unsaved changes"
        description={warnMessage}
        confirmLabel="Leave screen"
        cancelLabel="Stay"
        onConfirm={() => {
          if (pendingNav) performNavigation(pendingNav);
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
      <AppNavigationMenu open={menuOpen} onClose={() => setMenuOpen(false)} onSignOut={onSignOut} />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { canManageLeagueRole, isAdministratorRole, isSuperRole, normalizeAppRole, type AppRole } from "@/lib/app-roles";

type AdminState = { loading: boolean; isAdmin: boolean; userId: string | null; email: string | null; isSuper: boolean; canManageLeague: boolean; role: AppRole };

export default function useAdminStatus(): AdminState {
  const [state, setState] = useState<AdminState>({ loading: true, isAdmin: false, userId: null, email: null, isSuper: false, canManageLeague: false, role: "user" });
  useEffect(() => {
    const client = supabase;
    if (!client) {
      setState({ loading: false, isAdmin: false, userId: null, email: null, isSuper: false, canManageLeague: false, role: "user" });
      return;
    }
    const ownerEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? process.env.NEXT_PUBLIC_OWNER_EMAIL?.trim().toLowerCase() ?? "";
    let active = true;
    const run = async () => {
      let data: { user: { id?: string; email?: string; user_metadata?: { role?: string | null } } | null };
      try {
        const res = await client.auth.getUser();
        data = res.data as { user: { id?: string; email?: string; user_metadata?: { role?: string | null } } | null };
      } catch (error) {
        console.warn("Auth user check failed", error);
        if (active) {
          setState({ loading: false, isAdmin: false, userId: null, email: null, isSuper: false, canManageLeague: false, role: "user" });
        }
        return;
      }
      if (!active) return;
      const email = data.user?.email?.toLowerCase() ?? "";
      const isOwner = Boolean(ownerEmail && email && email === ownerEmail);
      const metadataRole = data.user?.user_metadata?.role ?? null;
      let appRole: string | null = null;
      if (data.user?.id) {
        const { data: appUser } = await client.from("app_users").select("role").eq("id", data.user.id).maybeSingle();
        appRole = (appUser?.role as string | null) ?? null;
      }
      const role: AppRole = isOwner ? "owner" : normalizeAppRole(appRole ?? metadataRole);
      setState({
        loading: false,
        isAdmin: isAdministratorRole(role),
        userId: data.user?.id ?? null,
        email: data.user?.email ?? null,
        isSuper: isSuperRole(role),
        canManageLeague: canManageLeagueRole(role),
        role,
      });
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  return state;
}

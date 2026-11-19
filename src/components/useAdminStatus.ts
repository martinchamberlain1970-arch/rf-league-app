"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createAdminStatusController, emptyAdminState, type AdminState } from "@/lib/admin-status-controller";

export default function useAdminStatus(): AdminState {
  const [state, setState] = useState<AdminState>({ ...emptyAdminState, loading: true });
  useEffect(() => {
    const client = supabase;
    if (!client) { setState({ ...emptyAdminState }); return; }
    const ownerEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? process.env.NEXT_PUBLIC_OWNER_EMAIL?.trim().toLowerCase() ?? "";
    const controller = createAdminStatusController(async (id) => {
      const { data, error } = await client.from('app_users').select('role').eq('id', id).maybeSingle();
      if (error) throw error;
      return data?.role ?? null;
    }, ownerEmail, setState);
    let active = true;
    let authRevision = 0;
    let checking = false;
    let lastRecovery = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retried = false;
    const retryOnce = () => {
      if (!active || retried) return;
      retried = true;
      retry = setTimeout(() => { void refresh(); }, 1500);
    };
    const refresh = async (force = false) => {
      if (checking) return;
      checking = true;
      const revision = authRevision;
      try {
        // Session is for UI identity only; server APIs still enforce permissions.
        const { data, error } = await client.auth.getSession();
        if (active && revision === authRevision && !error) controller.accept(data.session?.user ?? null, force);
        if (error) retryOnce();
      } catch {
        // A transient connection/lock failure is not a sign-out event.
        retryOnce();
      } finally { checking = false; }
    };
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      authRevision++;
      if (active) controller.accept(session?.user ?? null, event === 'USER_UPDATED');
    });
    void refresh();
    const recover = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastRecovery < 30_000) return;
      lastRecovery = Date.now();
      void refresh(true);
    };
    window.addEventListener('online', recover);
    window.addEventListener('pageshow', recover);
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      active = false;
      clearTimeout(retry);
      controller.dispose();
      listener.subscription.unsubscribe();
      window.removeEventListener('online', recover);
      window.removeEventListener('pageshow', recover);
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, []);
  return state;
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type FeatureAccessState = {
  loading: boolean;
  quickMatchEnabled: boolean;
  competitionCreateEnabled: boolean;
};

export default function useFeatureAccess(): FeatureAccessState {
  const [state, setState] = useState<FeatureAccessState>({
    loading: true,
    quickMatchEnabled: false,
    competitionCreateEnabled: false,
  });

  useEffect(() => {
    let active = true;
    const run = async () => {
      const client = supabase;
      if (!client) {
        if (active) setState({ loading: false, quickMatchEnabled: false, competitionCreateEnabled: false });
        return;
      }

      const authRes = await client.auth.getUser();
      const userId = authRes.data.user?.id;
      if (!userId) {
        if (active) setState({ loading: false, quickMatchEnabled: false, competitionCreateEnabled: false });
        return;
      }

      const withCols = await client
        .from("app_users")
        .select("quick_match_enabled,competition_create_enabled")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;

      if (!withCols.error && withCols.data) {
        setState({
          loading: false,
          quickMatchEnabled: Boolean((withCols.data as { quick_match_enabled?: boolean | null }).quick_match_enabled),
          competitionCreateEnabled: Boolean(
            (withCols.data as { competition_create_enabled?: boolean | null }).competition_create_enabled
          ),
        });
        return;
      }

      setState({ loading: false, quickMatchEnabled: false, competitionCreateEnabled: false });
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  return state;
}


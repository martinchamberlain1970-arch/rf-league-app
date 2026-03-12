"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import { supabase } from "@/lib/supabase";

type Claim = { id: string; status: "pending" | "approved" | "rejected"; requested_full_name: string | null; created_at: string };
type Player = { id: string; full_name: string | null; display_name: string; date_of_birth?: string | null };

function calculateAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function WelcomePageInner() {
  const search = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [linkedPlayer, setLinkedPlayer] = useState<Player | null>(null);
  const [pendingClaim, setPendingClaim] = useState<Claim | null>(null);
  const [dobInput, setDobInput] = useState("");
  const [savingDob, setSavingDob] = useState(false);
  const promptDob = search.get("prompt") === "dob";
  const playerAge = useMemo(() => calculateAge(linkedPlayer?.date_of_birth), [linkedPlayer?.date_of_birth]);

  useEffect(() => {
    const run = async () => {
      const client = supabase;
      if (!client) {
        setMessage("Supabase is not configured.");
        setLoading(false);
        return;
      }
      const userRes = await client.auth.getUser();
      const user = userRes.data.user;
      if (!user) {
        setLoading(false);
        return;
      }
      setEmail(user.email ?? null);
      const appUserRes = await client
        .from("app_users")
        .select("linked_player_id")
        .eq("id", user.id)
        .maybeSingle();
      const linkedPlayerId = appUserRes.data?.linked_player_id ?? null;
      if (linkedPlayerId) {
        const playerRes = await client
          .from("players")
          .select("id,full_name,display_name,date_of_birth")
          .eq("id", linkedPlayerId)
          .maybeSingle();
        if (!playerRes.error && playerRes.data) {
          setLinkedPlayer(playerRes.data as Player);
          setDobInput((playerRes.data as Player).date_of_birth ?? "");
        }
      } else {
        const claimRes = await client
          .from("player_claim_requests")
          .select("id,status,requested_full_name,created_at")
          .eq("requester_user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);
        if (!claimRes.error && (claimRes.data ?? []).length > 0) {
          setPendingClaim(claimRes.data![0] as Claim);
        }
      }
      setLoading(false);
    };
    void run();
  }, []);

  const saveDob = async () => {
    const client = supabase;
    if (!client || !linkedPlayer) return;
    if (!dobInput.trim()) {
      setMessage("Enter your date of birth.");
      return;
    }
    setSavingDob(true);
    const { error } = await client.from("players").update({ date_of_birth: dobInput }).eq("id", linkedPlayer.id);
    setSavingDob(false);
    if (error) {
      setMessage(`Failed to save date of birth: ${error.message}`);
      return;
    }
    setLinkedPlayer((prev) => (prev ? { ...prev, date_of_birth: dobInput } : prev));
    setMessage(null);
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Welcome" eyebrow="Account" subtitle="Registration and profile-link status." />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {loading ? <p className="text-slate-600">Checking your account status...</p> : null}
            {!loading ? (
              <div className="space-y-3 text-sm text-slate-700">
                <p>
                  Signed in as: <span className="font-semibold text-slate-900">{email ?? "Unknown email"}</span>
                </p>
                {linkedPlayer ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                    Profile linked successfully: <span className="font-semibold">{linkedPlayer.full_name?.trim() || linkedPlayer.display_name}</span>
                    {linkedPlayer.date_of_birth ? (
                      <p className="mt-1 text-sm">
                        Age: <span className="font-semibold">{playerAge ?? "-"}</span>
                      </p>
                    ) : null}
                  </div>
                ) : pendingClaim ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    Profile-link request pending review
                    {pendingClaim.requested_full_name ? ` for ${pendingClaim.requested_full_name}` : ""}. Requested at{" "}
                    {new Date(pendingClaim.created_at).toLocaleString()}.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                    No profile link request found. Create an account request from the registration page.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {linkedPlayer && (!linkedPlayer.date_of_birth || promptDob) ? (
                    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <p className="mb-2 text-sm font-semibold">Date of birth required</p>
                      <p className="mb-2 text-xs">Please add your date of birth so age-restricted competitions can be validated.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={dobInput}
                          onChange={(e) => setDobInput(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => void saveDob()}
                          disabled={savingDob}
                          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {savingDob ? "Saving..." : "Save date of birth"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <Link href="/" className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white">
                    Go to dashboard
                  </Link>
                  {!linkedPlayer ? (
                    <Link href="/auth/register" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                      Open registration
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
          <MessageModal message={message} onClose={() => setMessage(null)} />
        </RequireAuth>
      </div>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-slate-600">Loading...</p>
            </section>
          </div>
        </main>
      }
    >
      <WelcomePageInner />
    </Suspense>
  );
}

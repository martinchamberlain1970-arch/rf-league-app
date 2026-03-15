"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import MessageModal from "@/components/MessageModal";

function readNextPath(): string {
  if (typeof window === "undefined") return "/";
  const raw = new URLSearchParams(window.location.search).get("next");
  return raw || "/";
}

function readSignupState(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("signup");
}
function hasDob(dob: string | null | undefined) {
  return Boolean(dob && dob.trim());
}

export default function SignInPage() {
  const router = useRouter();
  const nextPath = useMemo(() => readNextPath(), []);
  const signupState = useMemo(() => readSignupState(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (signupState === "created") {
      setMessage("Account created. Once your profile has been approved, sign in to continue.");
    }
  }, [signupState]);

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const { error } = await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(`Sign in failed: ${error.message}`);
      return;
    }
    const authUserRes = await client.auth.getUser();
    const signedInUserId = authUserRes.data.user?.id ?? null;
    if (signedInUserId) {
      const { data: appUser } = await client.from("app_users").select("linked_player_id").eq("id", signedInUserId).maybeSingle();
      const linkedPlayerId = appUser?.linked_player_id ?? null;
      if (linkedPlayerId) {
        let linkedPlayer: { age_band?: string | null; date_of_birth?: string | null } | null = null;
        const dobRes = await client.from("players").select("age_band,date_of_birth").eq("id", linkedPlayerId).maybeSingle();
        if (dobRes.error && dobRes.error.message.toLowerCase().includes("date_of_birth")) {
          const fallbackRes = await client.from("players").select("age_band").eq("id", linkedPlayerId).maybeSingle();
          linkedPlayer = fallbackRes.data as { age_band?: string | null } | null;
        } else {
          linkedPlayer = dobRes.data as { age_band?: string | null; date_of_birth?: string | null } | null;
        }
        const isUnder18 = Boolean(linkedPlayer?.age_band && linkedPlayer.age_band !== "18_plus");
        if (isUnder18) {
          await client.auth.signOut();
          setMessage("Direct login is available for 18+ accounts only. Under-18 profiles must be managed by a parent/guardian or administrator.");
          return;
        }
        if (!hasDob(linkedPlayer?.date_of_birth)) {
          router.replace("/auth/welcome?prompt=dob");
          return;
        }
      }
    }
    await logAudit("auth_sign_in", { entityType: "auth", summary: "User signed in." });
    const pending = typeof window !== "undefined" ? window.localStorage.getItem("pending_claim") : null;
    if (pending) {
      try {
        const parsed = JSON.parse(pending) as {
          type: "existing" | "create";
          playerId?: string;
          fullName?: string;
          restoreArchived?: boolean;
          firstName?: string;
          secondName?: string;
          dateOfBirth?: string;
          locationId?: string;
          teamId?: string | null;
          ageBand?: "under_13" | "13_15" | "16_17" | "18_plus";
          guardianConsent?: boolean;
          guardianName?: string;
          guardianEmail?: string;
          guardianUserId?: string;
        };
        const { data } = await client.auth.getUser();
        const userId = data.user?.id;
        if (!userId) {
          window.localStorage.removeItem("pending_claim");
          router.replace(nextPath);
          return;
        }
        const submitClaim = async (playerId: string, fullName: string, requestedDateOfBirth?: string | null) => {
          await client.from("player_claim_requests").insert({
            player_id: playerId,
            requester_user_id: userId,
            requested_full_name: fullName,
            requested_date_of_birth: requestedDateOfBirth ?? null,
            status: "pending",
          });
        };
        if (parsed.type === "existing" && parsed.playerId && parsed.fullName) {
          await submitClaim(parsed.playerId, parsed.fullName, parsed.dateOfBirth ?? null);
          setMessage("Your profile-link request has been submitted for administrator approval.");
          if (parsed.locationId) {
            await client.from("player_update_requests").insert({
              player_id: parsed.playerId,
              requester_user_id: userId,
              requested_full_name: null,
              requested_location_id: parsed.locationId,
              requested_age_band: parsed.ageBand ?? null,
              requested_guardian_consent: parsed.guardianConsent ?? null,
              requested_guardian_name: parsed.guardianName ?? null,
              requested_guardian_email: parsed.guardianEmail ?? null,
              requested_guardian_user_id: parsed.guardianUserId ?? null,
              status: "pending",
            });
          }
        }
        if (parsed.type === "create" && parsed.firstName) {
          const effectiveAgeBand = parsed.ageBand ?? "18_plus";
          const fullName = effectiveAgeBand === "18_plus" ? `${parsed.firstName} ${parsed.secondName ?? ""}`.trim() : parsed.firstName;
          const { data: created } = await client
            .from("players")
            .insert({
              display_name: parsed.firstName,
              first_name: parsed.firstName,
              nickname: null,
              full_name: fullName,
              is_archived: false,
              claimed_by: null,
              location_id: effectiveAgeBand === "18_plus" ? parsed.locationId ?? null : null,
              date_of_birth: parsed.dateOfBirth ?? null,
              age_band: effectiveAgeBand,
              guardian_consent: effectiveAgeBand === "18_plus" ? false : Boolean(parsed.guardianConsent),
              guardian_name: parsed.guardianName ?? null,
              guardian_email: parsed.guardianEmail ?? null,
              guardian_user_id: parsed.guardianUserId ?? null,
            })
            .select("id")
            .single();
          if (created?.id) {
            if (parsed.teamId) {
              const existingMember = await client
                .from("league_registered_team_members")
                .select("id")
                .eq("team_id", parsed.teamId)
                .eq("player_id", created.id)
                .maybeSingle();
              if (!existingMember.error && !existingMember.data?.id) {
                await client.from("league_registered_team_members").insert({
                  team_id: parsed.teamId,
                  player_id: created.id,
                  is_captain: false,
                  is_vice_captain: false,
                });
              }
            }
            await submitClaim(created.id, fullName, parsed.dateOfBirth ?? null);
            setMessage("Your profile-link request has been submitted for administrator approval.");
          }
        }
      } catch {
        // ignore parse/side-effect errors here
      }
      window.localStorage.removeItem("pending_claim");
    }
    router.replace(nextPath);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.55),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(253,230,138,0.38),_transparent_28%),#f8fafc] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_1.35fr_0.9fr]">
          <section className="rounded-[2rem] border border-sky-100 bg-white/95 p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] sm:p-8">
            <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
              Rack & Frame League
            </span>
            <h1 className="mt-5 max-w-md text-5xl font-black leading-[0.95] tracking-tight text-slate-950 sm:text-6xl">
              Get straight back to your league night.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">
              Sign in to review fixtures, check results, follow competition draws, and keep your club activity moving.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
              <p className="text-sm font-semibold text-amber-900">League access note</p>
              <p className="mt-2 text-sm leading-7 text-amber-800">
                New accounts are reviewed before full access is enabled. Approval is usually completed within an hour and can take up to 24 hours.
              </p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] sm:p-6">
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-100 p-4">
              <div className="flex min-h-[24rem] items-center justify-center rounded-[1.5rem] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_38%),linear-gradient(145deg,_#111827,_#1f2937_52%,_#0f172a)] p-8">
                <div className="text-center">
                  <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.34em] text-slate-100">
                    Snooker League
                  </div>
                  <div className="mt-8 text-5xl font-black tracking-tight text-white sm:text-6xl">
                    Rack<span className="text-amber-400">&amp;</span>Frame
                  </div>
                  <p className="mt-4 max-w-md text-base leading-7 text-slate-200">
                    Fixtures, tables, player rankings, competitions, and result submission in one place.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-5">
                <p className="text-xl font-semibold text-slate-900">Ready to continue?</p>
                <p className="mt-2 text-base leading-7 text-slate-600">
                  Use your existing account to open your dashboard, view notifications, and jump straight into league activity.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Sign in</p>
            <h2 className="mt-3 text-5xl font-black tracking-tight text-slate-950">Welcome back</h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Captains, vice-captains, and players all sign in here. Team permissions are controlled centrally by the Super User.
            </p>
            <form onSubmit={onSignIn} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-16 w-full rounded-[1.35rem] border border-slate-300 bg-white px-5 text-lg text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-16 w-full rounded-[1.35rem] border border-slate-300 bg-white px-5 text-lg text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  placeholder="Enter your password"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-16 items-center justify-center rounded-[1.35rem] bg-teal-700 px-8 text-xl font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              >
                {busy ? "Please wait..." : "Sign in"}
              </button>
            </form>
            <section className="mt-8 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-base text-slate-700">
                Don&apos;t have an account yet?{" "}
                <Link href="/auth/register" className="font-semibold text-teal-700 underline underline-offset-4">
                  Create one here
                </Link>
                .
              </p>
            </section>
            <p className="mt-8 text-sm uppercase tracking-[0.22em] text-slate-400">Designed and developed by Martin Chamberlain</p>
            <MessageModal message={message} onClose={() => setMessage(null)} />
          </section>
        </div>
      </div>
    </main>
  );
}

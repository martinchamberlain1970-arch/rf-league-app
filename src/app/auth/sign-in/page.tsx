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

function readResetState(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("reset");
}
function hasDob(dob: string | null | undefined) {
  return Boolean(dob && dob.trim());
}

export default function SignInPage() {
  const router = useRouter();
  const nextPath = useMemo(() => readNextPath(), []);
  const signupState = useMemo(() => readSignupState(), []);
  const resetState = useMemo(() => readResetState(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (signupState === "created") {
      setMessage("Account created. Once your profile has been approved, sign in to continue.");
      return;
    }
    if (resetState === "success") {
      setMessage("Password updated. Sign in with your new password.");
    }
  }, [resetState, signupState]);

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
          const existingClaim = await client
            .from("player_claim_requests")
            .select("id,status")
            .eq("player_id", playerId)
            .eq("requester_user_id", userId)
            .in("status", ["pending", "approved"])
            .maybeSingle();
          if (existingClaim.data?.id) return false;
          await client.from("player_claim_requests").insert({
            player_id: playerId,
            requester_user_id: userId,
            requested_full_name: fullName,
            requested_date_of_birth: requestedDateOfBirth ?? null,
            status: "pending",
          });
          return true;
        };
        const notifySignupRequest = async (subject: string, text: string) => {
          const sessionRes = await client.auth.getSession();
          const accessToken = sessionRes.data.session?.access_token;
          if (!accessToken) return;
          await fetch("/api/auth/notify-signup-request", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ subject, text }),
          }).catch(() => undefined);
        };
        const requestedLocationId = parsed.locationId?.trim() ?? "";
        const { data: requestedLocation } = requestedLocationId
          ? await client.from("locations").select("id").eq("id", requestedLocationId).maybeSingle()
          : { data: null };
        const validLocationId = requestedLocation?.id ?? null;
        if (!validLocationId) {
          setMessage(
            "Your account was created, but no club was saved with the signup request. Please contact the League Secretary or Super User so your club can be assigned before your profile is linked."
          );
          window.localStorage.removeItem("pending_claim");
          router.replace(nextPath);
          return;
        }
        if (parsed.type === "existing" && parsed.playerId && parsed.fullName) {
          const claimCreated = await submitClaim(parsed.playerId, parsed.fullName, parsed.dateOfBirth ?? null);
          setMessage(
            claimCreated
              ? "Your profile-link request has been submitted for administrator approval."
              : "A profile-link request for this account is already awaiting approval."
          );
          const existingUpdate = await client
            .from("player_update_requests")
            .select("id,status")
            .eq("player_id", parsed.playerId)
            .eq("requester_user_id", userId)
            .eq("status", "pending")
            .maybeSingle();
          if (!existingUpdate.data?.id) {
            await client.from("player_update_requests").insert({
              player_id: parsed.playerId,
              requester_user_id: userId,
              requested_full_name: null,
              requested_location_id: validLocationId,
              requested_age_band: parsed.ageBand ?? null,
              requested_guardian_consent: parsed.guardianConsent ?? null,
              requested_guardian_name: parsed.guardianName ?? null,
              requested_guardian_email: parsed.guardianEmail ?? null,
              requested_guardian_user_id: parsed.guardianUserId ?? null,
              status: "pending",
            });
          }
          if (claimCreated) {
            await notifySignupRequest(
              "New league signup approval request",
              `A new profile-link request is waiting for review.\n\nName: ${parsed.fullName}\nEmail: ${data.user?.email ?? "Unknown"}\nClub ID: ${validLocationId}\nRoute: Existing player profile`
            );
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
              location_id: effectiveAgeBand === "18_plus" ? validLocationId : null,
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
            const claimCreated = await submitClaim(created.id, fullName, parsed.dateOfBirth ?? null);
            setMessage(
              claimCreated
                ? "Your profile-link request has been submitted for administrator approval."
                : "A profile-link request for this account is already awaiting approval."
            );
            if (claimCreated) {
              await notifySignupRequest(
                "New league player registration awaiting approval",
                `A new player registration is waiting for review.\n\nName: ${fullName}\nEmail: ${data.user?.email ?? "Unknown"}\nClub ID: ${validLocationId}\nRoute: New player profile request`
              );
            }
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.45),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(253,230,138,0.28),_transparent_28%),#f8fafc] px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <section className="rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-6 lg:sticky lg:top-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-2">
              <img src="/rf-logo.png" alt="Rack & Frame League logo" className="max-h-full w-auto object-contain" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Rack & Frame League</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Sign in</h1>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-600">
            Access fixtures, league tables, live matches, notifications, and match-night tools from one account.
          </p>
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            New player profile links are reviewed separately by the League Secretary or Super User after account creation.
          </div>
          <div className="mt-5 grid gap-2 text-sm text-slate-600">
            <Link href="/live-matches" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-800 hover:bg-white">
              Follow live matches
            </Link>
            <Link href="/captain-guide" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-800 hover:bg-white">
              Captain / Vice-captain guide
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Welcome back</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">League account</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Captains, vice-captains, and players all sign in here. Team permissions are managed centrally.
          </p>

          <form onSubmit={onSignIn} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <Link href="/auth/forgot-password" className="text-sm font-semibold text-teal-700 underline underline-offset-4">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                placeholder="Enter your password"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-teal-700 px-5 text-base font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60 sm:w-auto"
            >
              {busy ? "Please wait..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              Don&apos;t have an account yet?{" "}
              <Link href="/auth/register" className="font-semibold text-teal-700 underline underline-offset-4">
                Create one here
              </Link>
              .
            </p>
          </div>

          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-slate-400">Designed and developed by Martin Chamberlain</p>
          <MessageModal message={message} onClose={() => setMessage(null)} />
        </section>
      </div>
    </main>
  );
}

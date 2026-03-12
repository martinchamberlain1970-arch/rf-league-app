"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import ConfirmModal from "@/components/ConfirmModal";
import InfoModal from "@/components/InfoModal";
import MessageModal from "@/components/MessageModal";

type Location = { id: string; name: string };
type Team = { id: string; name: string; location_id: string | null };
const SIGNUP_DRAFT_KEY = "signup_draft_v1";
const LEGAL_VERSION = "2026-03-11";

function mapSignUpError(message: string, code?: string, status?: number) {
  const detail = [code, status ? String(status) : null].filter(Boolean).join(" · ");
  const lower = message.toLowerCase();
  if (lower.includes("unexpected failure")) {
    return `Sign up failed. Check Supabase Auth settings (Confirm email, Allow signups, CAPTCHA, SMTP).${detail ? ` (${detail})` : ""}`;
  }
  if (lower.includes("email rate limit")) {
    return `Too many signup emails were sent recently. Wait a few minutes and try again.${detail ? ` (${detail})` : ""}`;
  }
  return `Sign up failed: ${message}${detail ? ` (${detail})` : ""}`;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locationId, setLocationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; body: string; closeLabel?: string; redirectTo?: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    resolve?: (value: boolean) => void;
  }>({ open: false, title: "", description: "" });
  const privacyPolicyUrl = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL?.trim() || "/privacy";
  const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL?.trim() || "/terms";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        step?: 1 | 2;
        email?: string;
        password?: string;
        firstName?: string;
        secondName?: string;
        dateOfBirth?: string;
        locationId?: string;
        teamId?: string;
        acceptPrivacy?: boolean;
        acceptTerms?: boolean;
      };
      if (parsed.step === 1 || parsed.step === 2) setStep(parsed.step);
      if (typeof parsed.email === "string") setEmail(parsed.email);
      if (typeof parsed.password === "string") setPassword(parsed.password);
      if (typeof parsed.firstName === "string") setFirstName(parsed.firstName);
      if (typeof parsed.secondName === "string") setSecondName(parsed.secondName);
      if (typeof parsed.dateOfBirth === "string") setDateOfBirth(parsed.dateOfBirth);
      if (typeof parsed.locationId === "string") setLocationId(parsed.locationId);
      if (typeof parsed.teamId === "string") setTeamId(parsed.teamId);
      if (typeof parsed.acceptPrivacy === "boolean") setAcceptPrivacy(parsed.acceptPrivacy);
      if (typeof parsed.acceptTerms === "boolean") setAcceptTerms(parsed.acceptTerms);
    } catch {
      window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = {
      step,
      email,
      password,
      firstName,
      secondName,
      dateOfBirth,
      locationId,
      teamId,
      acceptPrivacy,
      acceptTerms,
    };
    window.sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
  }, [step, email, password, firstName, secondName, dateOfBirth, locationId, teamId, acceptPrivacy, acceptTerms]);

  const askConfirm = (title: string, description: string, confirmLabel = "Yes", cancelLabel = "No") =>
    new Promise<boolean>((resolve) => {
      setConfirmState({ open: true, title, description, confirmLabel, cancelLabel, resolve });
    });

  const closeConfirm = (result: boolean) => {
    const resolver = confirmState.resolve;
    setConfirmState({ open: false, title: "", description: "" });
    resolver?.(result);
  };

  useEffect(() => {
    fetch("/api/public/locations")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.locations)) setLocations(data.locations as Location[]);
      })
      .catch(() => undefined);
  }, []);

  const selectedLocationId = locationId;
  const selectedTeamId = teamId;

  useEffect(() => {
    if (!selectedLocationId) {
      setTeams([]);
      setTeamId("");
      return;
    }
    fetch(`/api/public/teams?locationId=${encodeURIComponent(selectedLocationId)}`)
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data?.teams) ? (data.teams as Team[]) : [];
        setTeams(rows);
        if (teamId && !rows.some((team) => team.id === teamId)) {
          setTeamId("");
        }
      })
      .catch(() => {
        setTeams([]);
        setTeamId("");
      });
  }, [selectedLocationId, teamId]);

  const validateStepOne = async () => {
    if (!email.trim()) {
      setMessage("Enter your email to create an account.");
      return false;
    }
    if (!password || password.length < 6) {
      setMessage("Choose a password with at least 6 characters.");
      return false;
    }
    const first = firstName.trim();
    const second = secondName.trim();
    if (!first || !second) {
      setMessage("Enter your first and second name so we can check for an existing profile before signup.");
      return false;
    }
    if (!dateOfBirth.trim()) {
      setMessage("Enter your date of birth.");
      return false;
    }
    if (!locationId.trim()) {
      setMessage("Select a club to continue.");
      return false;
    }
    return true;
  };

  const onContinue = async () => {
    setMessage(null);
    const ok = await validateStepOne();
    if (!ok) return;
    setStep(2);
  };

  const onSignUp = async () => {
    setMessage(null);
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const okStepOne = await validateStepOne();
    if (!okStepOne) {
      setBusy(false);
      return;
    }
    if (!acceptPrivacy || !acceptTerms) {
      setBusy(false);
      setMessage("You must accept the Privacy Policy and Terms & Conditions before creating an account.");
      return;
    }

    const first = firstName.trim();
    const second = secondName.trim();
    const selectedLocation = selectedLocationId.trim();
    const selectedTeam = selectedTeamId.trim();
    if (!first || !second) {
      setBusy(false);
      setMessage("Enter your first and second name so we can check for an existing profile before signup.");
      return;
    }
    if (!selectedLocation) {
      setBusy(false);
      setMessage("Select an existing club to continue.");
      return;
    }
    const fullName = `${first} ${second}`.trim();
    const normalizedFull = normalizeName(fullName);
    const normalizedFirst = normalizeName(first);
    const normalizedSecond = normalizeName(second);

    const { data } = await client
      .from("players")
      .select("id,full_name,display_name,claimed_by,location_id,is_archived")
      .eq("location_id", selectedLocation)
      .limit(300);

    const teamMemberIds = new Set<string>();
    if (selectedTeam) {
      const teamMembersRes = await client
        .from("league_registered_team_members")
        .select("player_id")
        .eq("team_id", selectedTeam);
      if (!teamMembersRes.error) {
        for (const row of teamMembersRes.data ?? []) {
          if (row.player_id) teamMemberIds.add(row.player_id as string);
        }
      }
    }

    const unclaimed = (data ?? []).filter((p) => !p.claimed_by);
    const scored = unclaimed
      .map((p) => {
        const nFull = normalizeName(p.full_name ?? "");
        const nDisplay = normalizeName(p.display_name ?? "");
        let score = 0;
        if (nFull && nFull === normalizedFull) score = 100;
        else if (nDisplay && nDisplay === normalizedFull) score = 95;
        else if (nFull.includes(normalizedFirst) && nFull.includes(normalizedSecond)) score = 85;
        else if (nDisplay.includes(normalizedFirst) && nDisplay.includes(normalizedSecond)) score = 80;
        else if (nDisplay === normalizedFirst) score = 65;
        else if (nFull.includes(normalizedFirst)) score = 55;
        if (selectedTeam && teamMemberIds.has(p.id)) score += 20;
        if (p.is_archived) score -= 5;
        return { p, score };
      })
      .filter((x) => x.score >= 65)
      .sort((a, b) => b.score - a.score);
    const candidate = scored[0]?.p ?? null;

    if (candidate && !candidate.claimed_by) {
      const ok = await askConfirm(
        candidate.is_archived ? "Archived profile found" : "Existing profile found",
        candidate.is_archived
          ? `An archived profile exists for "${fullName}". Do you want to request restore and claim it after you sign in?`
          : `A profile already exists for "${fullName}". Would you like to claim it after you sign in?`,
        candidate.is_archived ? "Restore & claim" : "Claim profile",
        "Cancel"
      );
      if (ok) {
        if (!candidate.location_id && selectedLocation) {
          window.localStorage.setItem(
            "pending_claim",
            JSON.stringify({
              type: "existing",
              playerId: candidate.id,
              fullName,
              locationId: selectedLocation,
              teamId: selectedTeam || null,
              restoreArchived: Boolean(candidate.is_archived),
              dateOfBirth,
            })
          );
        } else {
          window.localStorage.setItem(
            "pending_claim",
            JSON.stringify({
              type: "existing",
              playerId: candidate.id,
              fullName,
              teamId: selectedTeam || null,
              restoreArchived: Boolean(candidate.is_archived),
              dateOfBirth,
            })
          );
        }
      } else {
        const createOk = await askConfirm(
          "Create a new profile?",
          "No claim selected. Would you like to create a new profile after you sign in?",
          "Create profile",
          "Cancel"
        );
        if (createOk) {
          window.localStorage.setItem(
            "pending_claim",
            JSON.stringify({
              type: "create",
              firstName: first,
              secondName: second,
              dateOfBirth,
              locationId: selectedLocation,
              teamId: selectedTeam || null,
            })
          );
        }
      }
    } else if ((data ?? []).some((p) => p.claimed_by)) {
      setBusy(false);
      setMessage("An existing account/profile already appears to be linked for this name. Sign in with your existing account or contact support.");
      return;
    } else {
      const createOk = await askConfirm(
        "No matching profile found",
        "Would you like to create a new profile after you sign in? (If a previous profile was permanently deleted, a new profile will be created.)",
        "Create profile",
        "Cancel"
      );
      if (createOk) {
        window.localStorage.setItem(
          "pending_claim",
          JSON.stringify({
            type: "create",
            firstName: first,
            secondName: second,
            dateOfBirth,
            locationId: selectedLocation,
            teamId: selectedTeam || null,
          })
        );
      }
    }

    const pending = typeof window !== "undefined" ? window.localStorage.getItem("pending_claim") : null;
    if (!pending) {
      setBusy(false);
      setMessage("You must claim or create a profile before signing up.");
      return;
    }

    const acceptedAt = new Date().toISOString();
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          privacy_policy_accepted: true,
          privacy_policy_version: LEGAL_VERSION,
          terms_accepted: true,
          terms_version: LEGAL_VERSION,
          legal_accepted_at: acceptedAt,
        },
      },
    });
    setBusy(false);
    if (error) {
      setMessage(mapSignUpError(error.message, (error as any).code, (error as any).status));
      return;
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    }
    await logAudit("auth_sign_up", { entityType: "auth", summary: "User account created." });
    setInfoModal({
      title: "Account created",
      body: "Your account was created successfully. If email verification is enabled, verify your email first. Then sign in to complete your profile linking and continue.",
      closeLabel: "Go to sign in",
      redirectTo: "/auth/sign-in?signup=created&next=%2Fauth%2Fwelcome",
    });
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-3xl font-bold text-slate-900">Create Account</h1>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">First-time setup</p>
            <p className="text-sm text-slate-600">
              {step === 1
                ? "Complete your account details and profile check."
                : "Review legal terms and finish account creation."}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Steps</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"><span className="font-semibold text-slate-900">1.</span> Enter details</div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"><span className="font-semibold text-slate-900">2.</span> Legal agreement</div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"><span className="font-semibold text-slate-900">3.</span> Create account</div>
            </div>
          </div>
          {step === 1 ? (
            <>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Captains, vice-captains, and players all register here using the same flow. Captain/vice-captain permissions are assigned later by the Super User from team management.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Second name" value={secondName} onChange={(e) => setSecondName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Date of birth</label>
                <input
                  type="date"
                  required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </div>
              <div>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    setTeamId("");
                  }}
                >
                  <option value="">Select club (required)</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={!selectedLocationId}
                >
                  <option value="">{selectedLocationId ? "Select team (optional)" : "Select club first"}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  If your club or team is not listed, please send a WhatsApp message to the league secretary/chairman to update the system.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Review your details</p>
                <p className="mt-1">{email.trim()}</p>
                <p>{firstName.trim()} {secondName.trim()}</p>
                <p>{dateOfBirth ? new Date(`${dateOfBirth}T12:00:00`).toLocaleDateString() : "Date of birth not entered"}</p>
                <p>{locations.find((l) => l.id === selectedLocationId)?.name ?? "Club not selected"}</p>
                <p>{teams.find((t) => t.id === selectedTeamId)?.name ?? "Team not selected"}</p>
              </div>
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                <p className="font-semibold">Legal summary</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  <li>Your data is used to run league fixtures, results, rankings, and competitions.</li>
                  <li>Your date of birth is used for age-restricted competition eligibility checks.</li>
                  <li>Result submissions and approvals are audit logged for governance.</li>
                  <li>You can request profile correction or deletion through league administration.</li>
                </ul>
              </div>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Under-18 players do not create login accounts directly. A parent/guardian or administrator should create and manage under-18 player profiles.
              </p>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(e) => setAcceptPrivacy(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I have read and accept the{" "}
                    <a href={privacyPolicyUrl} target="_blank" rel="noreferrer" className="font-medium text-teal-700 underline">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I have read and accept the{" "}
                    <a href={termsUrl} target="_blank" rel="noreferrer" className="font-medium text-teal-700 underline">
                      Terms &amp; Conditions
                    </a>
                    .
                  </span>
                </label>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {step === 1 ? (
              <button type="button" onClick={() => void onContinue()} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white">
                Continue
              </button>
            ) : (
              <>
                <button type="button" onClick={onSignUp} disabled={busy} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {busy ? "Please wait..." : "Create account"}
                </button>
                <button type="button" onClick={() => setStep(1)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                  Back
                </button>
              </>
            )}
            <Link href="/auth/sign-in" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Back to sign in
            </Link>
          </div>
          <MessageModal message={message} onClose={() => setMessage(null)} />
        </section>
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
      <InfoModal
        open={Boolean(infoModal)}
        title={infoModal?.title ?? ""}
        description={infoModal?.body ?? ""}
        closeLabel={infoModal?.closeLabel ?? "OK"}
        onClose={() => {
          const redirectTo = infoModal?.redirectTo;
          setInfoModal(null);
          if (redirectTo) router.push(redirectTo);
        }}
      />
    </main>
  );
}

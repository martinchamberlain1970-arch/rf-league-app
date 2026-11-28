"use client";

import LeagueAuthLayout from "@/components/LeagueAuthLayout";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    let payload: { error?: string } = {};
    let ok = false;
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      ok = response.ok;
      payload = (await response.json()) as { error?: string };
    } catch {
      setBusy(false);
      setError("Could not send reset link: network error.");
      return;
    }
    setBusy(false);
    if (!ok) {
      setError(`Could not send reset link: ${payload.error || "Please try again."}`);
      return;
    }
    setMessage("If an account exists for that email, a password reset link has been sent.");
  };

  return (
    <LeagueAuthLayout title="Reset your password" intro="Enter your league account email and we’ll send you a reset link.">
          <form onSubmit={onSubmit} className="mt-8 max-w-xl space-y-5">
            <div>
              <label htmlFor="reset-request-email" className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
              <input
                id="reset-request-email"
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                placeholder="you@example.com"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy} className="rounded-[1.2rem] bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60">
                {busy ? "Sending..." : "Send reset link"}
              </button>
              <Link href="/auth/sign-in" className="text-sm font-semibold text-slate-600 underline underline-offset-4">
                Back to sign in
              </Link>
            </div>
          </form>

          {message ? <div className="mt-6 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{message}</div> : null}
          {error ? <div className="mt-6 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
    </LeagueAuthLayout>
  );
}

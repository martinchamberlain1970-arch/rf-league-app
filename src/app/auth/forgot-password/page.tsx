"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

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
    const client = supabase;
    if (!client) {
      setBusy(false);
      setError("Supabase is not configured.");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = origin ? `${origin}/auth/reset-password` : undefined;
    const { error: resetError } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    setBusy(false);
    if (resetError) {
      setError(`Could not send reset link: ${resetError.message}`);
      return;
    }
    setMessage("If an account exists for that email, a password reset link has been sent.");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.55),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(253,230,138,0.38),_transparent_28%),#f8fafc] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] sm:p-8">
          <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
            Password reset
          </span>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Reset your league password</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Enter your email address and we will send a password reset link. The link will take you back here to choose a new password.
          </p>

          <form onSubmit={onSubmit} className="mt-8 max-w-xl space-y-5">
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
        </section>
      </div>
    </main>
  );
}

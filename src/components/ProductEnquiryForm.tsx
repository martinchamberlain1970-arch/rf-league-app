"use client";

import { FormEvent, useState } from "react";

type FormState = {
  name: string;
  email: string;
  leagueName: string;
  area: string;
  teamCount: string;
  message: string;
  website: string;
  consent: boolean;
};

const initialForm: FormState = {
  name: "",
  email: "",
  leagueName: "",
  area: "",
  teamCount: "",
  message: "",
  website: "",
  consent: false,
};

export default function ProductEnquiryForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/public/product-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your enquiry could not be sent.");
      setStatus("sent");
      setMessage("Thank you. Your enquiry has been sent and Martin will be in touch.");
      setForm(initialForm);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Your enquiry could not be sent.");
    }
  }

  const inputClass = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10";

  return (
    <form onSubmit={submit} className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-200">
          Your name
          <input required autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} className={inputClass} placeholder="Full name" maxLength={100} />
        </label>
        <label className="text-sm font-bold text-slate-200">
          Email address
          <input required type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} className={inputClass} placeholder="you@yourleague.co.uk" maxLength={180} />
        </label>
        <label className="text-sm font-bold text-slate-200">
          League or club
          <input required value={form.leagueName} onChange={(event) => update("leagueName", event.target.value)} className={inputClass} placeholder="League or club name" maxLength={160} />
        </label>
        <label className="text-sm font-bold text-slate-200">
          Area
          <input required value={form.area} onChange={(event) => update("area", event.target.value)} className={inputClass} placeholder="Town, city or county" maxLength={120} />
        </label>
        <label className="text-sm font-bold text-slate-200 sm:col-span-2">
          Approximate number of teams
          <select required value={form.teamCount} onChange={(event) => update("teamCount", event.target.value)} className={inputClass}>
            <option value="">Select a range</option>
            <option value="Up to 10">Up to 10</option>
            <option value="11–20">11–20</option>
            <option value="21–40">21–40</option>
            <option value="More than 40">More than 40</option>
            <option value="Club use only">Club use only</option>
          </select>
        </label>
        <label className="text-sm font-bold text-slate-200 sm:col-span-2">
          What would you like help with?
          <textarea required value={form.message} onChange={(event) => update("message", event.target.value)} className={`${inputClass} min-h-32 resize-y`} placeholder="Tell us how your league or club currently works and what you would like to improve." maxLength={1500} />
        </label>
        <label className="hidden" aria-hidden="true">
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} />
        </label>
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
        <input required type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} className="mt-1 h-4 w-4 accent-cyan-300" />
        <span>I am happy for Rack &amp; Frame to use these details to respond to this enquiry. They will not be added to a marketing list.</span>
      </label>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={status === "sending"} className="rounded-2xl bg-cyan-300 px-6 py-3.5 text-base font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60">
          {status === "sending" ? "Sending enquiry…" : "Register your interest"}
        </button>
        <p aria-live="polite" className={`text-sm ${status === "error" ? "text-rose-300" : status === "sent" ? "text-emerald-300" : "text-slate-400"}`}>{message || "No pricing or commitment—just an initial conversation."}</p>
      </div>
    </form>
  );
}

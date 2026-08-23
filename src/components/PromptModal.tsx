"use client";

import { useEffect, useState } from "react";

type PromptModalProps = {
  open: boolean;
  title: string;
  description: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export default function PromptModal({
  open,
  title,
  description,
  initialValue = "",
  placeholder,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  required = false,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [initialValue, open]);

  if (!open) return null;
  const disabled = required && !value.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="app-prompt-title" className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 px-5 py-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300">Rack &amp; Frame</p>
          <h2 id="app-prompt-title" className="mt-1 text-xl font-bold">{title}</h2>
        </header>
        <div className="p-5">
          <p className="text-sm leading-6 text-slate-700">{description}</p>
          <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} rows={4} className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700" onClick={onCancel}>{cancelLabel}</button>
            <button type="button" disabled={disabled} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" onClick={() => onConfirm(value.trim())}>{confirmLabel}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

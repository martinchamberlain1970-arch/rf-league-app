"use client";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="app-confirm-title" className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 px-5 py-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300">Rack &amp; Frame</p>
          <h2 id="app-confirm-title" className="mt-1 text-xl font-bold">{title}</h2>
        </header>
        <div className="p-5">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{description}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white ${
                tone === "danger" ? "bg-rose-700" : "bg-teal-700"
              }`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

"use client";

type InfoModalProps = {
  open: boolean;
  title: string;
  description: string;
  closeLabel?: string;
  onClose: () => void;
};

export default function InfoModal({ open, title, description, closeLabel = "OK", onClose }: InfoModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="app-info-title" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 px-5 py-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300">Rack &amp; Frame</p>
          <h2 id="app-info-title" className="mt-1 text-xl font-bold">{title}</h2>
        </header>
        <div className="p-5">
          <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 sm:text-base">{description}</p>
          </div>
          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white"
              onClick={onClose}
            >
              {closeLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

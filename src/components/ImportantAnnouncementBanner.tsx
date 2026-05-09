"use client";

type Announcement = {
  title?: string | null;
  body?: string | null;
};

export default function ImportantAnnouncementBanner({ announcement }: { announcement: Announcement | null }) {
  if (!announcement || (!announcement.title && !announcement.body)) return null;
  return (
    <section className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100 via-white to-amber-50 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-800">Important Announcement</p>
      {announcement.title ? <h2 className="mt-2 text-xl font-black text-slate-950">{announcement.title}</h2> : null}
      {announcement.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{announcement.body}</p> : null}
    </section>
  );
}

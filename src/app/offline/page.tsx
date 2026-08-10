export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <img
          src="/icons/icon-192.png"
          alt="Rack & Frame"
          className="mx-auto h-24 w-24 rounded-2xl"
        />
        <h1 className="mt-5 text-2xl font-bold text-slate-950">You’re offline</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Rack & Frame needs a connection to load current fixtures and safely submit results. Your league data has not been replaced with an old cached copy.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </a>
      </section>
    </main>
  );
}

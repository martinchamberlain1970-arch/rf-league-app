/** Poll only visible screens; resume immediately and never overlap requests. */
export function startVisiblePolling(load: () => Promise<void>, intervalMs: number) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running || document.visibilityState === "hidden") return;
    running = true;
    try { await load(); }
    catch (error) { console.error("Display refresh failed", error); }
    finally { running = false; }
  };
  const onVisible = () => { if (document.visibilityState === "visible") void run(); };
  void run();
  const timer = window.setInterval(() => { void run(); }, intervalMs);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

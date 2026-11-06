/** Poll only visible screens; resume immediately and never overlap requests. */
export function startVisiblePolling(load: () => Promise<void>, intervalMs: number | (() => number)) {
  let stopped = false;
  let running = false;
  let lastStartedAt: number | null = null;
  const run = async () => {
    if (stopped || running || document.visibilityState === "hidden") return;
    running = true;
    lastStartedAt = Date.now();
    try { await load(); }
    catch (error) { console.error("Display refresh failed", error); }
    finally { running = false; }
  };
  const onVisible = () => { if (document.visibilityState === "visible") void run(); };
  void run();
  // Re-evaluate the UK match window locally; this timer makes no network request
  // until the current interval is due, including when Thursday evening starts.
  const timer = window.setInterval(() => {
    if (typeof intervalMs === "number" || lastStartedAt === null || Date.now() - lastStartedAt >= intervalMs()) void run();
  }, typeof intervalMs === "number" ? intervalMs : 60000);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const londonClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", weekday: "short", hour: "2-digit", hourCycle: "h23",
});

/** Static league data: hourly, or five minutes on Thursdays 19:00–00:00 UK time. */
export function staticDisplayRefreshMs(now: Date = new Date()): number {
  const parts = londonClock.formatToParts(now);
  const day = parts.find(part => part.type === "weekday")?.value;
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  return day === "Thu" && hour >= 19 ? 300000 : 3600000;
}

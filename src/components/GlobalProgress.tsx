"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const startEventName = "rack-and-frame:progress-start";
const stopEventName = "rack-and-frame:progress-stop";
let requestSequence = 0;

type ProgressEventDetail = { id: string };

export function startGlobalProgress(id = "manual") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProgressEventDetail>(startEventName, { detail: { id } }));
}

export function stopGlobalProgress(id = "manual") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProgressEventDetail>(stopEventName, { detail: { id } }));
}

export default function GlobalProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const start = (event: Event) => {
      const id = (event as CustomEvent<ProgressEventDetail>).detail?.id;
      if (!id) return;
      setActiveIds((current) => new Set(current).add(id));
    };
    const stop = (event: Event) => {
      const id = (event as CustomEvent<ProgressEventDetail>).detail?.id;
      if (!id) return;
      setActiveIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    };

    window.addEventListener(startEventName, start);
    window.addEventListener(stopEventName, stop);
    return () => {
      window.removeEventListener(startEventName, start);
      window.removeEventListener(stopEventName, stop);
    };
  }, []);

  useEffect(() => {
    if (activeIds.size === 0) {
      setVisible(false);
      return;
    }
    const showTimer = window.setTimeout(() => setVisible(true), 140);
    const safetyTimer = window.setTimeout(() => setActiveIds(new Set()), 30000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(safetyTimer);
    };
  }, [activeIds]);

  useEffect(() => {
    stopGlobalProgress("navigation");
  }, [pathname, searchParams]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download")) return;

      window.setTimeout(() => {
        if (event.defaultPrevented) return;
        const destination = new URL(target.href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        const current = `${window.location.pathname}${window.location.search}`;
        const next = `${destination.pathname}${destination.search}`;
        if (current === next) return;
        startGlobalProgress("navigation");
      }, 0);
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const trackedFetch: typeof window.fetch = async (input, init) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const shouldTrack = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (!shouldTrack) return originalFetch(input, init);

      const requestId = `request-${++requestSequence}`;
      startGlobalProgress(requestId);
      try {
        return await originalFetch(input, init);
      } finally {
        stopGlobalProgress(requestId);
      }
    };

    window.fetch = trackedFetch;
    return () => {
      if (window.fetch === trackedFetch) window.fetch = originalFetch;
    };
  }, []);

  return (
    <div
      className={`rf-global-progress ${visible ? "rf-global-progress--visible" : ""}`}
      role="progressbar"
      aria-label="Rack & Frame is working"
      aria-hidden={!visible}
    >
      <span className="rf-global-progress__bar" />
      <span className="sr-only">Please wait. Rack &amp; Frame is working.</span>
    </div>
  );
}

"use client";

import Image from "next/image";
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
  const [percent, setPercent] = useState(0);

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
      if (!visible) {
        setPercent(0);
        return;
      }
      setPercent(100);
      const hideTimer = window.setTimeout(() => {
        setVisible(false);
        setPercent(0);
      }, 450);
      return () => window.clearTimeout(hideTimer);
    }

    if (!visible) setPercent(0);
    const showTimer = window.setTimeout(() => setVisible(true), 140);
    const progressTimer = window.setInterval(() => {
      setPercent((current) => {
        if (current < 35) return Math.min(35, current + 7);
        if (current < 70) return Math.min(70, current + 4);
        if (current < 88) return Math.min(88, current + 2);
        return Math.min(95, current + 1);
      });
    }, 320);
    const safetyTimer = window.setTimeout(() => setActiveIds(new Set()), 30000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearInterval(progressTimer);
      window.clearTimeout(safetyTimer);
    };
  }, [activeIds, visible]);

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
      className={`fixed inset-0 z-[200] grid place-items-center px-4 transition-opacity duration-150 ${visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      role="progressbar"
      aria-label="Rack & Frame is working"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-hidden={!visible}
    >
      <span className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" aria-hidden="true" />
      <section className="relative w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 shadow-2xl shadow-slate-950/30">
        <div className="flex items-center gap-4">
          <Image src="/icons/rack-frame-icon-192-v2.png" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl shadow-md" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">Rack &amp; Frame</p>
            <p className="mt-1 text-xl font-black text-slate-950">Please wait…</p>
          </div>
        </div>
        <div className="mt-6 flex items-end justify-between gap-4">
          <p className="text-sm font-semibold text-slate-600">Working on your request</p>
          <p className="text-2xl font-black tabular-nums text-teal-800">{percent}%</p>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-cyan-400 via-teal-500 to-amber-400 transition-[width] duration-300 ease-out ${percent === 100 ? "shadow-[0_0_12px_rgba(13,148,136,0.55)]" : ""}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="sr-only">Please wait. Rack &amp; Frame is working. {percent}% complete.</p>
      </section>
    </div>
  );
}

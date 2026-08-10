"use client";

import { useEffect } from "react";

const SERVICE_WORKER_URL = "/sw.js";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | null = null;

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
        await registration.update();
      } catch (error) {
        console.warn("Rack & Frame could not enable offline support.", error);
      }
    };

    const checkForUpdate = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };

    void register();
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => document.removeEventListener("visibilitychange", checkForUpdate);
  }, []);

  return null;
}

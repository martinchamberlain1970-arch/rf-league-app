"use client";
import { useSyncExternalStore } from "react";

export function parseDisplayPageSeconds(search: string): number | null {
  const value = Number(new URLSearchParams(search).get("pageSeconds"));
  return Number.isInteger(value) && value >= 5 && value <= 120 ? value : null;
}
const subscribe = () => () => {};
const snapshot = () => parseDisplayPageSeconds(window.location.search);
const serverSnapshot = () => null;
/** Read only after hydration; invalid or absent overrides preserve the display default. */
export function useDisplayPageSeconds(fallback: number) {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot) ?? fallback;
}

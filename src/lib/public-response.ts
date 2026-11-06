import { NextResponse } from "next/server";

/** Only for anonymous, published display data. Never use for draft or private routes. */
export function publicJson(body: unknown, init?: ResponseInit, seconds = 60) {
  const response = NextResponse.json(body, init);
  const hasError = Boolean(body && typeof body === "object" && "error" in body && body.error);
  response.headers.set("Cache-Control", response.ok && !hasError
    ? `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=30`
    : "private, no-store");
  return response;
}

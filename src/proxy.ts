import { NextRequest, NextResponse } from "next/server";

const marketingHosts = new Set(["rackandframe.app", "www.rackandframe.app"]);

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (marketingHosts.has(host) && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/product", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};

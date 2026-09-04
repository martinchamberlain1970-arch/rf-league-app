import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Cross-app player matching has been disabled. League and club ratings are separate." },
    { status: 410 }
  );
}

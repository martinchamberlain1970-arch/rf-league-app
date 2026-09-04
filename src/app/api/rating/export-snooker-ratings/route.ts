import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Cross-app Elo exports have been disabled. League and club ratings are separate." },
    { status: 410 }
  );
}

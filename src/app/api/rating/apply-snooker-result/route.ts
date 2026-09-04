import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "External club results are not accepted. League Elo is maintained independently." },
    { status: 410 }
  );
}

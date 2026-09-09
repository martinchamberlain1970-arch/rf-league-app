import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const resetRetiredMessage =
  "The Premier opening reset was withdrawn after Proposal 2 was adopted at the EGM. Validated Elo ratings and handicaps must carry forward.";

export async function GET() {
  return NextResponse.json({ error: resetRetiredMessage }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: resetRetiredMessage }, { status: 410 });
}

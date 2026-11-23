import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { error: "Competition entries are submitted by your captain using the team entry form.", entryForm: "/competition-entry" },
    { status: 403 },
  );
}

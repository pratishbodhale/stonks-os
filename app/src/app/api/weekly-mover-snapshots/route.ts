import { NextResponse } from "next/server";
import { listWeeklyMoverSnapshots } from "@/lib/db";

export async function GET() {
  const snapshots = listWeeklyMoverSnapshots(50);
  return NextResponse.json({ snapshots });
}

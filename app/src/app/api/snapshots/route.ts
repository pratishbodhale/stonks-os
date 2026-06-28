import { NextResponse } from "next/server";
import { listSnapshots } from "@/lib/db";

export async function GET() {
  const snapshots = listSnapshots(50);
  return NextResponse.json({ snapshots });
}

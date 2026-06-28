import { NextResponse } from "next/server";
import {
  getWeeklyMoverAiBrief,
  getWeeklyMoverSnapshotMeta,
  listWeeklyMoverAiBriefs,
} from "@/lib/db";

export const dynamic = "force-dynamic";

function parseNumber(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const id = parseNumber(searchParams.get("id"), 0);

  if (id > 0) {
    const brief = getWeeklyMoverAiBrief(id);
    if (!brief) {
      return NextResponse.json({ error: "AI brief not found" }, { status: 404 });
    }
    return NextResponse.json({ brief });
  }

  const snapshotId = parseNumber(searchParams.get("snapshotId"), 0);
  const briefTypeParam = searchParams.get("briefType");
  const briefType =
    briefTypeParam === "market" || briefTypeParam === "stock" ? briefTypeParam : undefined;
  const symbol = searchParams.get("symbol")?.trim() || undefined;
  const limit = Math.min(100, Math.max(1, parseNumber(searchParams.get("limit"), 50)));

  if (snapshotId > 0 && !getWeeklyMoverSnapshotMeta(snapshotId)) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const briefs = listWeeklyMoverAiBriefs(limit, {
    snapshotId: snapshotId > 0 ? snapshotId : undefined,
    briefType,
    symbol,
  });

  return NextResponse.json({ briefs });
}

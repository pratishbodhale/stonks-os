import { NextResponse } from "next/server";
import {
  getWeeklyMoverSnapshotMeta,
  getWeeklyMoverSnapshotRows,
  saveWeeklyMoverSnapshot,
} from "@/lib/db";
import {
  getIndexSymbolsForScan,
  parseNiftyUniverse,
  type NiftyUniverse,
} from "@/lib/nifty-constituents";
import type { WeeklyMoversResult } from "@/lib/types";
import {
  filterWeeklyMovers,
  scanWeeklyMovers,
  type WeeklyMoverDirection,
} from "@/lib/weekly-movers";

export const dynamic = "force-dynamic";

type CacheEntry = {
  data: WeeklyMoversResult;
  lastSnapshotId: number | null;
  lookbackKey: string;
};

const cacheByUniverse: Partial<Record<NiftyUniverse, CacheEntry>> = {};
const lastComputedAt: Partial<Record<NiftyUniverse, number>> = {};
const CACHE_WINDOW_MS = 10 * 60 * 1000;

function parseNumber(queryValue: string | null, fallback: number): number {
  if (!queryValue) {
    return fallback;
  }
  const parsed = Number(queryValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseDirection(value: string | null): WeeklyMoverDirection {
  if (value === "gainers" || value === "losers" || value === "both") {
    return value;
  }
  return "gainers";
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const niftyUniverse = parseNiftyUniverse(searchParams.get("niftyUniverse") ?? searchParams.get("nifty"));
  const lookbackDays = clamp(parseNumber(searchParams.get("lookbackDays"), 5), 1, 60);
  const direction = parseDirection(searchParams.get("direction"));
  const minAbsChangePct = Math.max(0, parseNumber(searchParams.get("minAbsChangePct"), 0));
  const limit = clamp(parseNumber(searchParams.get("limit"), 40), 1, 100);
  const forceRefresh = searchParams.get("forceRefresh") === "true";
  const snapshotId = parseNumber(searchParams.get("snapshotId"), 0);

  if (snapshotId > 0) {
    const snapshotMeta = getWeeklyMoverSnapshotMeta(snapshotId);
    if (!snapshotMeta) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
    const snapshotRows = getWeeklyMoverSnapshotRows(snapshotId);
    const filteredHistorical = filterWeeklyMovers(snapshotRows, {
      direction,
      minAbsChangePct,
      limit,
    });

    return NextResponse.json({
      scannedAt: snapshotMeta.createdAt,
      stale: false,
      symbolsScanned: snapshotMeta.symbolsScanned,
      snapshotId,
      historical: true,
      niftyUniverse: snapshotMeta.niftyUniverse,
      snapshotNiftyUniverse: snapshotMeta.niftyUniverse,
      lookbackDays: snapshotMeta.lookbackDays,
      results: filteredHistorical,
    });
  }

  const lookbackKey = String(lookbackDays);
  const now = Date.now();
  const entry = cacheByUniverse[niftyUniverse];
  const lastT = lastComputedAt[niftyUniverse] ?? 0;
  const timeStale = !entry || now - lastT > CACHE_WINDOW_MS;
  const lookbackChanged = entry && entry.lookbackKey !== lookbackKey;
  const needsRescan = forceRefresh || timeStale || lookbackChanged;

  if (needsRescan) {
    const { symbols } = getIndexSymbolsForScan(niftyUniverse);
    if (symbols.length === 0) {
      return NextResponse.json(
        { error: "No symbols available for the selected Nifty index." },
        { status: 500 },
      );
    }
    const results = await scanWeeklyMovers(symbols, lookbackDays);
    const newSnapshotId = saveWeeklyMoverSnapshot(results, symbols.length, niftyUniverse, lookbackDays);
    cacheByUniverse[niftyUniverse] = {
      data: {
        scannedAt: new Date().toISOString(),
        stale: false,
        symbolsScanned: symbols.length,
        niftyUniverse,
        lookbackDays,
        results,
      },
      lastSnapshotId: newSnapshotId,
      lookbackKey,
    };
    lastComputedAt[niftyUniverse] = now;
  }

  const c = cacheByUniverse[niftyUniverse]!;
  const filtered = filterWeeklyMovers(c.data.results, {
    direction,
    minAbsChangePct,
    limit,
  });

  return NextResponse.json({
    scannedAt: c.data.scannedAt,
    stale: now - (lastComputedAt[niftyUniverse] ?? 0) > CACHE_WINDOW_MS,
    symbolsScanned: c.data.symbolsScanned,
    snapshotId: c.lastSnapshotId,
    historical: false,
    niftyUniverse,
    lookbackDays: c.data.lookbackDays,
    results: filtered,
  });
}

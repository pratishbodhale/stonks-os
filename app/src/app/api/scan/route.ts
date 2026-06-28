import { NextResponse } from "next/server";
import {
  getIndexSymbolsForScan,
  type ConstituentSource,
  type NiftyUniverse,
  parseNiftyUniverse,
} from "@/lib/nifty-constituents";
import { getSnapshotMeta, getSnapshotRows, saveSnapshot } from "@/lib/db";
import { scanSymbols } from "@/lib/signals";
import type { ScanResult, SymbolSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

type ScanCacheEntry = {
  data: ScanResult;
  lastSnapshotId: number | null;
  volumeBuyingKey: string;
  niftyUniverse: NiftyUniverse;
  constituentsSource: ConstituentSource;
};

const cacheByUniverse: Partial<Record<NiftyUniverse, ScanCacheEntry>> = {};
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

type ScanFilters = {
  minVolSpike: number;
  breakoutOnly: boolean;
  minVolumeBuyingDays: number;
  goldenCrossOnly: boolean;
  goldenCrossWithinDays: number;
  limit: number;
};

function passesGoldenCrossFilter(
  row: SymbolSnapshot,
  goldenCrossOnly: boolean,
  goldenCrossWithinDays: number,
): boolean {
  if (goldenCrossOnly && !row.goldenCross) {
    return false;
  }
  if (goldenCrossWithinDays > 0) {
    if (row.daysSinceGoldenCross === null || row.daysSinceGoldenCross > goldenCrossWithinDays) {
      return false;
    }
  }
  return true;
}

function filterScanResults(rows: SymbolSnapshot[], filters: ScanFilters): SymbolSnapshot[] {
  const filtered = rows
    .filter((row) => row.volSpike >= filters.minVolSpike)
    .filter((row) => (filters.breakoutOnly ? row.breakout : true))
    .filter((row) =>
      filters.minVolumeBuyingDays > 0 ? row.volumeBuyingDays >= filters.minVolumeBuyingDays : true,
    )
    .filter((row) =>
      passesGoldenCrossFilter(row, filters.goldenCrossOnly, filters.goldenCrossWithinDays),
    );

  if (filters.goldenCrossOnly || filters.goldenCrossWithinDays > 0) {
    filtered.sort((a, b) => {
      const aDays = a.daysSinceGoldenCross ?? Number.MAX_SAFE_INTEGER;
      const bDays = b.daysSinceGoldenCross ?? Number.MAX_SAFE_INTEGER;
      if (aDays !== bDays) {
        return aDays - bDays;
      }
      return (b.smaSpreadPct ?? -Infinity) - (a.smaSpreadPct ?? -Infinity);
    });
  }

  return filtered.slice(0, filters.limit);
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const minVolSpike = parseNumber(searchParams.get("minVolSpike"), 2);
  const breakoutOnly = searchParams.get("breakoutOnly") === "true";
  const limit = parseNumber(searchParams.get("limit"), 30);
  const snapshotId = parseNumber(searchParams.get("snapshotId"), 0);
  const forceRefresh = searchParams.get("forceRefresh") === "true";
  const niftyUniverse = parseNiftyUniverse(searchParams.get("niftyUniverse") ?? searchParams.get("nifty"));

  const lookbackDays = clamp(parseNumber(searchParams.get("lookbackDays"), 5), 1, 60);
  const minVolumeBuyingDays = clamp(parseNumber(searchParams.get("minVolumeBuyingDays"), 0), 0, 60);
  const volumeBuyingMult = Math.max(1, parseNumber(searchParams.get("volumeBuyingMult"), 1.5));
  const volumeBuyingUpDayOnly = searchParams.get("volumeBuyingUpDayOnly") !== "false";
  const goldenCrossOnly = searchParams.get("goldenCrossOnly") === "true";
  const goldenCrossWithinDays = clamp(parseNumber(searchParams.get("goldenCrossWithinDays"), 0), 0, 60);

  const volumeBuyingKey = `${lookbackDays}|${volumeBuyingMult}|${volumeBuyingUpDayOnly}`;
  const filters: ScanFilters = {
    minVolSpike,
    breakoutOnly,
    minVolumeBuyingDays,
    goldenCrossOnly,
    goldenCrossWithinDays,
    limit,
  };

  if (snapshotId > 0) {
    const snapshotMeta = getSnapshotMeta(snapshotId);
    if (!snapshotMeta) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
    const snapshotRows = getSnapshotRows(snapshotId);
    const filteredHistorical = filterScanResults(snapshotRows, filters);

    return NextResponse.json({
      scannedAt: snapshotMeta.createdAt,
      stale: false,
      symbolsScanned: snapshotMeta.symbolsScanned,
      snapshotId,
      historical: true,
      results: filteredHistorical,
      niftyUniverse: snapshotMeta.niftyUniverse,
      snapshotNiftyUniverse: snapshotMeta.niftyUniverse,
    });
  }

  const now = Date.now();
  const entry = cacheByUniverse[niftyUniverse];
  const lastT = lastComputedAt[niftyUniverse] ?? 0;
  const timeStale = !entry || now - lastT > CACHE_WINDOW_MS;
  const volumeParamsChanged = entry && entry.volumeBuyingKey !== volumeBuyingKey;
  const needsRescan = forceRefresh || timeStale || volumeParamsChanged;

  if (needsRescan) {
    const { symbols, source } = getIndexSymbolsForScan(niftyUniverse);
    if (symbols.length === 0) {
      return NextResponse.json(
        { error: "No symbols available for the selected Nifty index." },
        { status: 500 },
      );
    }
    const results = await scanSymbols(symbols, {
      lookbackDays,
      volumeMult: volumeBuyingMult,
      upDayOnly: volumeBuyingUpDayOnly,
    });
    const newSnapshotId = saveSnapshot(results, symbols.length, niftyUniverse);
    cacheByUniverse[niftyUniverse] = {
      data: {
        scannedAt: new Date().toISOString(),
        stale: false,
        symbolsScanned: symbols.length,
        results,
      },
      lastSnapshotId: newSnapshotId,
      volumeBuyingKey,
      niftyUniverse,
      constituentsSource: source,
    };
    lastComputedAt[niftyUniverse] = now;
  }

  const c = cacheByUniverse[niftyUniverse]!;
  const filtered = filterScanResults(c.data.results, filters);

  return NextResponse.json({
    scannedAt: c.data.scannedAt,
    stale: now - (lastComputedAt[niftyUniverse] ?? 0) > CACHE_WINDOW_MS,
    symbolsScanned: c.data.symbolsScanned,
    snapshotId: c.lastSnapshotId,
    historical: false,
    results: filtered,
    niftyUniverse,
    constituentsSource: c.constituentsSource,
  });
}

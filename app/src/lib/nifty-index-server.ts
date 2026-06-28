import "server-only";

import { getNiftyIndexCache, saveNiftyIndexCache } from "@/lib/db";
import {
  getIndexSymbolsForScan,
  getLastIndexRefreshInfo,
  getNseIndexStatus,
  NIFTY_500_REFRESH_INTERVAL_DAYS,
  NIFTY_UNIVERSE_OPTIONS,
  refreshNiftyIndexFromNse,
  setIndexSymbolsInMemory,
  type NiftyUniverse,
} from "@/lib/nifty-constituents";

function hydrateNiftyIndexFromDb(u: NiftyUniverse): boolean {
  const cached = getNiftyIndexCache(u);
  if (!cached?.symbols.length) {
    return false;
  }
  setIndexSymbolsInMemory(u, cached.symbols, cached.refreshedAt);
  return true;
}

export function ensureNiftyIndexHydrated(u: NiftyUniverse): void {
  if (!getLastIndexRefreshInfo(u)) {
    hydrateNiftyIndexFromDb(u);
  }
}

export async function refreshNiftyIndexFromNseAndPersist(
  u: NiftyUniverse,
): Promise<{ ok: true; count: number; refreshedAt: string } | { ok: false; error: string }> {
  const result = await refreshNiftyIndexFromNse(u);
  if (!result.ok) {
    return result;
  }
  saveNiftyIndexCache(u, getIndexSymbolsForScan(u).symbols);
  return result;
}

export async function refreshNiftyIndexFromNseIfStale(
  u: NiftyUniverse,
  maxAgeDays = NIFTY_500_REFRESH_INTERVAL_DAYS,
): Promise<{ refreshedFromNse: boolean; count: number }> {
  ensureNiftyIndexHydrated(u);

  const cached = getNiftyIndexCache(u);
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  if (cached && Date.now() - new Date(cached.refreshedAt).getTime() < maxAgeMs) {
    return { refreshedFromNse: false, count: cached.symbols.length };
  }

  const result = await refreshNiftyIndexFromNseAndPersist(u);
  if (!result.ok) {
    const current = getIndexSymbolsForScan(u);
    return { refreshedFromNse: false, count: current.symbols.length };
  }

  return { refreshedFromNse: true, count: result.count };
}

export function getIndexSymbolsForScanWithCache(u: NiftyUniverse) {
  ensureNiftyIndexHydrated(u);
  return getIndexSymbolsForScan(u);
}

export function getNseIndexStatusWithCache() {
  for (const u of NIFTY_UNIVERSE_OPTIONS) {
    ensureNiftyIndexHydrated(u);
  }
  return getNseIndexStatus();
}

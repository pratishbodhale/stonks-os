import type { WeeklyMoverRow } from "@/lib/types";
import { computePrePeriodVolumeBaseline, volumeSpikeRatio } from "@/lib/volume-baseline";
import { fetchYahooFundamentals, fetchYahooSeries } from "@/lib/yahoo";

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const limit = Math.max(1, Math.floor(concurrency));
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function buildWeeklyMover(
  symbol: string,
  lookbackDays: number,
): Promise<WeeklyMoverRow | null> {
  const [series, fundamentals] = await Promise.all([
    fetchYahooSeries(symbol),
    fetchYahooFundamentals(symbol),
  ]);
  if (!series) {
    return null;
  }

  const { closes, volumes } = series;
  const n = closes.length;
  const lb = Math.max(1, Math.min(60, Math.floor(lookbackDays)));

  if (n < lb + 2 || volumes.length !== n) {
    return null;
  }

  const last = n - 1;
  const startIdx = last - lb;
  const currentPrice = closes[last];
  const periodStartPrice = closes[startIdx];
  const previousClose = closes[last - 1];

  if (!Number.isFinite(currentPrice) || !Number.isFinite(periodStartPrice) || periodStartPrice <= 0) {
    return null;
  }

  const periodChangePct = ((currentPrice - periodStartPrice) / periodStartPrice) * 100;
  const dayChangePct =
    Number.isFinite(previousClose) && previousClose > 0
      ? ((currentPrice - previousClose) / previousClose) * 100
      : 0;

  const periodCloses = closes.slice(startIdx, last + 1);
  const periodVolumes = volumes.slice(startIdx, last + 1);
  const periodHigh = Math.max(...periodCloses);
  const periodLow = Math.min(...periodCloses);
  const avgVolumePeriod = average(periodVolumes);

  const volumeBaseline = computePrePeriodVolumeBaseline(volumes, lb);
  if (!volumeBaseline) {
    return null;
  }
  const avgVolumePrior20 = volumeBaseline.avgVolume;

  const volumeChangePct =
    avgVolumePrior20 > 0
      ? ((avgVolumePeriod - avgVolumePrior20) / avgVolumePrior20) * 100
      : null;

  const currentVolume = volumes[last];
  const volSpikeToday = volumeSpikeRatio(currentVolume, volumeBaseline);

  return {
    symbol,
    currentPrice,
    periodStartPrice,
    periodChangePct,
    periodHigh,
    periodLow,
    dayChangePct,
    avgVolumePeriod,
    avgVolumePrior20,
    volumeChangePct,
    volSpikeToday,
    pe: fundamentals.pe,
    industry: fundamentals.industry,
    industryPe: null,
    lookbackDays: lb,
  };
}

function fillIndustryPe(rows: WeeklyMoverRow[]): void {
  const industryPeBuckets = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.industry || row.pe === null) {
      continue;
    }
    const values = industryPeBuckets.get(row.industry) ?? [];
    values.push(row.pe);
    industryPeBuckets.set(row.industry, values);
  }

  for (const row of rows) {
    if (!row.industry) {
      row.industryPe = null;
      continue;
    }
    const values = industryPeBuckets.get(row.industry) ?? [];
    row.industryPe =
      values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }
}

export type WeeklyMoverDirection = "gainers" | "losers" | "both";

export function filterWeeklyMovers(
  rows: WeeklyMoverRow[],
  options: {
    direction: WeeklyMoverDirection;
    minAbsChangePct: number;
    limit: number;
  },
): WeeklyMoverRow[] {
  const minAbs = Math.max(0, options.minAbsChangePct);
  let filtered = rows.filter((row) => Math.abs(row.periodChangePct) >= minAbs);

  if (options.direction === "gainers") {
    filtered = filtered.filter((row) => row.periodChangePct > 0);
    filtered.sort((a, b) => b.periodChangePct - a.periodChangePct);
  } else if (options.direction === "losers") {
    filtered = filtered.filter((row) => row.periodChangePct < 0);
    filtered.sort((a, b) => a.periodChangePct - b.periodChangePct);
  } else {
    filtered.sort(
      (a, b) => Math.abs(b.periodChangePct) - Math.abs(a.periodChangePct) || b.volSpikeToday - a.volSpikeToday,
    );
  }

  return filtered.slice(0, Math.max(1, options.limit));
}

export async function scanWeeklyMovers(
  symbols: string[],
  lookbackDays: number,
  concurrency = 20,
): Promise<WeeklyMoverRow[]> {
  const lb = Math.max(1, Math.min(60, Math.floor(lookbackDays)));
  const rows = await mapWithConcurrency(symbols, concurrency, (symbol) =>
    buildWeeklyMover(symbol, lb),
  );
  const valid = rows.filter((row): row is WeeklyMoverRow => row !== null);
  fillIndustryPe(valid);
  return valid;
}

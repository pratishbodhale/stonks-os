import type { SymbolSnapshot } from "@/lib/types";
import { computePrePeriodVolumeBaseline, volumeSpikeRatio } from "@/lib/volume-baseline";
import { fetchYahooFundamentals, fetchYahooSeries } from "@/lib/yahoo";

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type VolumeBuyingOptions = {
  lookbackDays: number;
  volumeMult: number;
  upDayOnly: boolean;
};

const DEFAULT_VOLUME_BUYING: VolumeBuyingOptions = {
  lookbackDays: 5,
  volumeMult: 1.5,
  upDayOnly: true,
};

export const SMA_SHORT_PERIOD = 50;
export const SMA_LONG_PERIOD = 200;

/** SMA ending at index `endIndex` (inclusive) over `period` closes. */
export function smaAt(closes: number[], endIndex: number, period: number): number | null {
  if (endIndex < period - 1 || endIndex >= closes.length) {
    return null;
  }
  const slice = closes.slice(endIndex - period + 1, endIndex + 1);
  if (slice.length < period) {
    return null;
  }
  return average(slice);
}

export type GoldenCrossState = {
  sma50: number | null;
  sma200: number | null;
  smaSpreadPct: number | null;
  goldenCross: boolean;
  daysSinceGoldenCross: number | null;
};

export function computeGoldenCrossState(
  closes: number[],
  shortPeriod = SMA_SHORT_PERIOD,
  longPeriod = SMA_LONG_PERIOD,
): GoldenCrossState {
  const empty: GoldenCrossState = {
    sma50: null,
    sma200: null,
    smaSpreadPct: null,
    goldenCross: false,
    daysSinceGoldenCross: null,
  };

  const n = closes.length;
  if (n < longPeriod + 1) {
    return empty;
  }

  const last = n - 1;
  const smaShortToday = smaAt(closes, last, shortPeriod);
  const smaLongToday = smaAt(closes, last, longPeriod);
  const smaShortYesterday = smaAt(closes, last - 1, shortPeriod);
  const smaLongYesterday = smaAt(closes, last - 1, longPeriod);

  if (
    smaShortToday === null ||
    smaLongToday === null ||
    smaShortYesterday === null ||
    smaLongYesterday === null
  ) {
    return empty;
  }

  const goldenCross = smaShortToday > smaLongToday && smaShortYesterday <= smaLongYesterday;
  const smaSpreadPct =
    smaLongToday > 0 ? ((smaShortToday - smaLongToday) / smaLongToday) * 100 : null;

  let daysSinceGoldenCross: number | null = null;
  if (smaShortToday > smaLongToday) {
    for (let i = last; i >= longPeriod; i--) {
      const st = smaAt(closes, i, shortPeriod);
      const lt = smaAt(closes, i, longPeriod);
      const stPrev = smaAt(closes, i - 1, shortPeriod);
      const ltPrev = smaAt(closes, i - 1, longPeriod);
      if (st !== null && lt !== null && stPrev !== null && ltPrev !== null && st > lt && stPrev <= ltPrev) {
        daysSinceGoldenCross = last - i;
        break;
      }
    }
  }

  return {
    sma50: smaShortToday,
    sma200: smaLongToday,
    smaSpreadPct,
    goldenCross,
    daysSinceGoldenCross,
  };
}

/**
 * Count sessions in the last `lookbackDays` bars where volume >= mult * (avg of prior 20 sessions)
 * and optionally close > previous close (up day).
 */
export function countVolumeBuyingDays(
  closes: number[],
  volumes: number[],
  lookbackDays: number,
  volumeMult: number,
  upDayOnly: boolean,
): number {
  const n = closes.length;
  if (n < 21 || volumes.length !== n || lookbackDays < 1) {
    return 0;
  }

  const cappedLookback = Math.min(lookbackDays, n - 1);
  let count = 0;

  for (let j = n - cappedLookback; j <= n - 1; j++) {
    if (j < 20) {
      continue;
    }
    const avg20Before = average(volumes.slice(j - 20, j));
    if (avg20Before <= 0) {
      continue;
    }
    const elevated = volumes[j] >= volumeMult * avg20Before;
    const upDay = closes[j] > closes[j - 1];
    if (elevated && (!upDayOnly || upDay)) {
      count += 1;
    }
  }

  return count;
}

export async function buildSignal(
  symbol: string,
  volumeBuying: VolumeBuyingOptions = DEFAULT_VOLUME_BUYING,
): Promise<SymbolSnapshot | null> {
  const [series, fundamentals] = await Promise.all([
    fetchYahooSeries(symbol),
    fetchYahooFundamentals(symbol),
  ]);
  if (!series) {
    return null;
  }

  const { closes, volumes } = series;
  const currentPrice = closes[closes.length - 1];
  const previousClose = closes[closes.length - 2];
  const currentVolume = volumes[volumes.length - 1];

  const lookbackCloses = closes.slice(-21, -1);
  const lb = Math.max(1, Math.min(60, Math.floor(volumeBuying.lookbackDays)));
  const volumeBaseline = computePrePeriodVolumeBaseline(volumes, lb);

  if (!previousClose || !currentVolume || lookbackCloses.length < 20 || !volumeBaseline) {
    return null;
  }

  const highestClose20 = Math.max(...lookbackCloses);
  const avgVolume20 = volumeBaseline.avgVolume;
  const priceChangePct = ((currentPrice - previousClose) / previousClose) * 100;
  const volSpike = volumeSpikeRatio(currentVolume, volumeBaseline);
  const breakout = currentPrice > highestClose20 && volSpike >= 1.5;

  const vm = volumeBuying.volumeMult > 0 ? volumeBuying.volumeMult : 1.5;
  const volumeBuyingDays = countVolumeBuyingDays(closes, volumes, lb, vm, volumeBuying.upDayOnly);
  const goldenCrossState = computeGoldenCrossState(closes);

  return {
    symbol,
    currentPrice,
    previousClose,
    currentVolume,
    avgVolume20,
    highestClose20,
    priceChangePct,
    volSpike,
    breakout,
    pe: fundamentals.pe,
    industry: fundamentals.industry,
    industryPe: null,
    volumeBuyingDays,
    volumeBuyingLookback: lb,
    volumeBuyingMult: vm,
    volumeBuyingUpDayOnly: volumeBuying.upDayOnly,
    ...goldenCrossState,
  };
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

export async function scanSymbols(
  symbols: string[],
  volumeBuying: VolumeBuyingOptions = DEFAULT_VOLUME_BUYING,
  concurrency = 20,
): Promise<SymbolSnapshot[]> {
  const signals = await mapWithConcurrency(symbols, concurrency, (symbol) =>
    buildSignal(symbol, volumeBuying),
  );
  const validSignals = signals.filter((signal): signal is SymbolSnapshot => signal !== null);

  const industryPeBuckets = new Map<string, number[]>();
  for (const signal of validSignals) {
    if (!signal.industry || signal.pe === null) {
      continue;
    }
    const values = industryPeBuckets.get(signal.industry) ?? [];
    values.push(signal.pe);
    industryPeBuckets.set(signal.industry, values);
  }

  for (const signal of validSignals) {
    if (!signal.industry) {
      signal.industryPe = null;
      continue;
    }
    const values = industryPeBuckets.get(signal.industry) ?? [];
    signal.industryPe =
      values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  return validSignals.sort((a, b) => {
    if (b.volumeBuyingDays !== a.volumeBuyingDays) {
      return b.volumeBuyingDays - a.volumeBuyingDays;
    }
    if (b.volSpike !== a.volSpike) {
      return b.volSpike - a.volSpike;
    }
    return b.priceChangePct - a.priceChangePct;
  });
}

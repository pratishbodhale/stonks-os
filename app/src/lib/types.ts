export type SymbolSnapshot = {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  currentVolume: number;
  /** 20-session mean volume before the recent lookback window (excludes elevated period). */
  avgVolume20: number;
  highestClose20: number;
  priceChangePct: number;
  volSpike: number;
  breakout: boolean;
  pe: number | null;
  industry: string | null;
  industryPe: number | null;
  /** Days in the last `volumeBuyingLookback` sessions with elevated volume (and optional up-close). */
  volumeBuyingDays: number;
  /** Same lookback used when this row was computed (for snapshots / UI). */
  volumeBuyingLookback: number;
  /** Volume multiplier vs pre-period 20-session avg. */
  volumeBuyingMult: number;
  /** Whether up-day filter was applied (close > previous close). */
  volumeBuyingUpDayOnly: boolean;
  /** 50-day simple moving average of close (null if insufficient history). */
  sma50: number | null;
  /** 200-day simple moving average of close (null if insufficient history). */
  sma200: number | null;
  /** (sma50 − sma200) / sma200 × 100 when both SMAs are available. */
  smaSpreadPct: number | null;
  /** Short SMA crossed above long SMA on the latest session. */
  goldenCross: boolean;
  /** Sessions since the most recent golden cross (0 = today); null if not above long SMA. */
  daysSinceGoldenCross: number | null;
};

export type ScanResult = {
  scannedAt: string;
  stale: boolean;
  symbolsScanned: number;
  results: SymbolSnapshot[];
};

export type SocialNote = {
  symbol: string;
  note: string;
  updatedAt: string;
};

/** One row from the weekly price-movement scan (N trading-day lookback). */
export type WeeklyMoverRow = {
  symbol: string;
  currentPrice: number;
  periodStartPrice: number;
  /** Close-to-close % change over the lookback window. */
  periodChangePct: number;
  periodHigh: number;
  periodLow: number;
  dayChangePct: number;
  avgVolumePeriod: number;
  avgVolumePrior20: number;
  /** Period avg volume vs prior 20-session avg (%). */
  volumeChangePct: number | null;
  volSpikeToday: number;
  pe: number | null;
  industry: string | null;
  industryPe: number | null;
  lookbackDays: number;
};

export type WeeklyMoversResult = {
  scannedAt: string;
  stale: boolean;
  symbolsScanned: number;
  niftyUniverse: string;
  lookbackDays: number;
  results: WeeklyMoverRow[];
};

export type WeeklyMoverAiBriefType = "market" | "stock";

export type WeeklyMoverAiBriefMeta = {
  id: number;
  snapshotId: number;
  briefType: WeeklyMoverAiBriefType;
  symbol: string | null;
  provider: string;
  model: string | null;
  createdAt: string;
  snapshotCreatedAt: string;
  niftyUniverse: string;
  lookbackDays: number;
};

export type WeeklyMoverAiBrief = WeeklyMoverAiBriefMeta & {
  text: string;
};

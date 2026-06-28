import {
  formatDailyScanNotification,
  sendDailyScanNotification,
} from "@/lib/firebase-admin";
import {
  getDailyScanRun,
  saveDailyScanRun,
  saveSnapshot,
  saveWeeklyMoverSnapshot,
} from "@/lib/db";
import {
  DAILY_SCAN_UNIVERSE,
  filterDailyVolumeSpikes,
} from "@/lib/daily-volume-scan";
import type { AiAnalysisProvider } from "@/lib/market-brief";
import { generateMarketBrief } from "@/lib/market-brief";
import { formatIstDateKey, isAfterNseMarketClose, isNseTradingDay } from "@/lib/market-hours";
import {
  getIndexSymbolsForScanWithCache,
  refreshNiftyIndexFromNseIfStale,
} from "@/lib/nifty-index-server";
import { scanSymbols } from "@/lib/signals";
import type { SymbolSnapshot, WeeklyMoverRow } from "@/lib/types";
import { filterWeeklyMovers, scanWeeklyMovers } from "@/lib/weekly-movers";

export const DAILY_WEEKLY_MOVER_LOOKBACK_DAYS = 5;
export const DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT = 3;

export function filterDailyWeeklyGainers(rows: WeeklyMoverRow[]): WeeklyMoverRow[] {
  return filterWeeklyMovers(rows, {
    direction: "gainers",
    minAbsChangePct: DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT,
    limit: rows.length,
  });
}

export type DailyScanStrategyResults = {
  volume: {
    snapshotId: number;
    spikeCount: number;
    spikes: SymbolSnapshot[];
  };
  weeklyMovers: {
    snapshotId: number;
    gainerCount: number;
    gainers: WeeklyMoverRow[];
    lookbackDays: number;
  };
};

export type DailyScanResult = {
  runDate: string;
  alreadyRan: boolean;
  symbolsScanned: number;
  constituentsSource: "memory" | "embedded";
  indexRefreshedFromNse: boolean;
  strategies: DailyScanStrategyResults | null;
};

export async function runDailyScan(options?: {
  force?: boolean;
  runDate?: string;
}): Promise<DailyScanResult> {
  const runDate = options?.runDate ?? formatIstDateKey();
  if (!options?.force) {
    const existing = getDailyScanRun(runDate);
    if (existing) {
      return {
        runDate,
        alreadyRan: true,
        symbolsScanned: 0,
        constituentsSource: "embedded",
        indexRefreshedFromNse: false,
        strategies: null,
      };
    }
  }

  const indexRefresh = await refreshNiftyIndexFromNseIfStale(DAILY_SCAN_UNIVERSE);
  const { symbols, source } = getIndexSymbolsForScanWithCache(DAILY_SCAN_UNIVERSE);
  if (symbols.length === 0) {
    throw new Error("No NIFTY 500 symbols available for daily scan.");
  }

  const [volumeResults, weeklyResults] = await Promise.all([
    scanSymbols(symbols, undefined, 15),
    scanWeeklyMovers(symbols, DAILY_WEEKLY_MOVER_LOOKBACK_DAYS, 15),
  ]);

  const spikes = filterDailyVolumeSpikes(volumeResults);
  const gainers = filterDailyWeeklyGainers(weeklyResults);

  const volumeSnapshotId = saveSnapshot(volumeResults, symbols.length, DAILY_SCAN_UNIVERSE);
  const weeklySnapshotId = saveWeeklyMoverSnapshot(
    weeklyResults,
    symbols.length,
    DAILY_SCAN_UNIVERSE,
    DAILY_WEEKLY_MOVER_LOOKBACK_DAYS,
  );

  saveDailyScanRun(
    runDate,
    volumeSnapshotId,
    spikes.length,
    weeklySnapshotId,
    gainers.length,
  );

  return {
    runDate,
    alreadyRan: false,
    symbolsScanned: symbols.length,
    constituentsSource: source,
    indexRefreshedFromNse: indexRefresh.refreshedFromNse,
    strategies: {
      volume: {
        snapshotId: volumeSnapshotId,
        spikeCount: spikes.length,
        spikes,
      },
      weeklyMovers: {
        snapshotId: weeklySnapshotId,
        gainerCount: gainers.length,
        gainers,
        lookbackDays: DAILY_WEEKLY_MOVER_LOOKBACK_DAYS,
      },
    },
  };
}

export type DailyScanSkipReason = "not_trading_day" | "before_market_close" | "already_ran_today";

export type DailyScanAiBriefSummary =
  | {
      status: "generated";
      aiBriefId: number | null;
      provider: AiAnalysisProvider;
      model: string | null;
    }
  | {
      status: "skipped";
      reason: "no_gainers" | "no_movers" | "ai_not_configured";
    };

export type DailyScanJobSummary = {
  runDate: string;
  symbolsScanned: number;
  constituentsSource: "memory" | "embedded";
  indexRefreshedFromNse: boolean;
  volumeSnapshotId: number;
  spikeCount: number;
  weeklyMoverSnapshotId: number;
  gainerCount: number;
  lookbackDays: number;
  aiBrief: DailyScanAiBriefSummary | null;
};

export type DailyScanJobResult =
  | { status: "skipped"; reason: DailyScanSkipReason; runDate: string }
  | { status: "completed"; summary: DailyScanJobSummary };

function toJobSummary(
  scan: DailyScanResult,
  aiBrief: DailyScanAiBriefSummary | null,
): DailyScanJobSummary {
  const strategies = scan.strategies!;
  return {
    runDate: scan.runDate,
    symbolsScanned: scan.symbolsScanned,
    constituentsSource: scan.constituentsSource,
    indexRefreshedFromNse: scan.indexRefreshedFromNse,
    volumeSnapshotId: strategies.volume.snapshotId,
    spikeCount: strategies.volume.spikeCount,
    weeklyMoverSnapshotId: strategies.weeklyMovers.snapshotId,
    gainerCount: strategies.weeklyMovers.gainerCount,
    lookbackDays: strategies.weeklyMovers.lookbackDays,
    aiBrief,
  };
}

async function runDailyScanAiAnalysis(
  scan: DailyScanResult,
  options?: { provider?: AiAnalysisProvider },
): Promise<DailyScanAiBriefSummary> {
  const strategies = scan.strategies;
  if (!strategies || strategies.weeklyMovers.gainerCount === 0) {
    return { status: "skipped", reason: "no_gainers" };
  }

  const outcome = await generateMarketBrief({
    movers: strategies.weeklyMovers.gainers.map((row) => ({
      symbol: row.symbol,
      periodChangePct: row.periodChangePct,
      industry: row.industry,
    })),
    lookbackDays: strategies.weeklyMovers.lookbackDays,
    niftyUniverse: DAILY_SCAN_UNIVERSE,
    direction: "gainers",
    provider: options?.provider,
    weeklyMoverSnapshotId: strategies.weeklyMovers.snapshotId,
  });

  if (outcome.status === "skipped") {
    return { status: "skipped", reason: outcome.reason };
  }

  return {
    status: "generated",
    aiBriefId: outcome.result.aiBriefId,
    provider: outcome.result.provider,
    model: outcome.result.model,
  };
}

export async function executeDailyScanJob(options?: {
  force?: boolean;
  skipMarketCheck?: boolean;
  sendNotification?: boolean;
  includeAiAnalysis?: boolean;
  aiProvider?: AiAnalysisProvider;
  runDate?: string;
}): Promise<DailyScanJobResult> {
  const force = options?.force ?? false;
  const skipMarketCheck = options?.skipMarketCheck ?? false;
  const sendNotification = options?.sendNotification ?? false;
  const includeAiAnalysis = options?.includeAiAnalysis ?? true;
  const runDate = options?.runDate ?? formatIstDateKey();

  if (!skipMarketCheck && !force) {
    if (!isNseTradingDay()) {
      return { status: "skipped", reason: "not_trading_day", runDate };
    }
    if (!isAfterNseMarketClose()) {
      return { status: "skipped", reason: "before_market_close", runDate };
    }
  }

  const scan = await runDailyScan({ force, runDate });
  if (scan.alreadyRan) {
    return { status: "skipped", reason: "already_ran_today", runDate: scan.runDate };
  }

  let aiBrief: DailyScanAiBriefSummary | null = null;
  if (includeAiAnalysis) {
    try {
      aiBrief = await runDailyScanAiAnalysis(scan, { provider: options?.aiProvider });
    } catch (error) {
      console.error(
        "Daily scan AI analysis failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (sendNotification && scan.strategies) {
    const strategies = scan.strategies;
    const notification = formatDailyScanNotification({
      spikes: strategies.volume.spikes,
      gainers: strategies.weeklyMovers.gainers,
      volumeSnapshotId: strategies.volume.snapshotId,
      weeklyMoverSnapshotId: strategies.weeklyMovers.snapshotId,
      lookbackDays: strategies.weeklyMovers.lookbackDays,
    });
    await sendDailyScanNotification(notification);
  }

  return { status: "completed", summary: toJobSummary(scan, aiBrief) };
}

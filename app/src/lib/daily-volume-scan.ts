import { getDailyScanRun } from "@/lib/db";
import { runDailyScan, type DailyScanResult } from "@/lib/daily-scan";
import type { SymbolSnapshot } from "@/lib/types";

export const DAILY_VOLUME_SPIKE_THRESHOLD = 5;
export const DAILY_SCAN_UNIVERSE = "500" as const;

export function isReportableDailyVolumeSpike(
  row: Pick<SymbolSnapshot, "volSpike">,
): boolean {
  return row.volSpike >= DAILY_VOLUME_SPIKE_THRESHOLD;
}

export function filterDailyVolumeSpikes(rows: SymbolSnapshot[]): SymbolSnapshot[] {
  return rows.filter(isReportableDailyVolumeSpike).sort((a, b) => b.volSpike - a.volSpike);
}

export type DailyVolumeScanResult = {
  runDate: string;
  alreadyRan: boolean;
  symbolsScanned: number;
  constituentsSource: "memory" | "embedded";
  indexRefreshedFromNse: boolean;
  snapshotId: number;
  spikes: SymbolSnapshot[];
};

function toDailyVolumeScanResult(result: DailyScanResult): DailyVolumeScanResult {
  if (result.alreadyRan) {
    const existing = getDailyScanRun(result.runDate);
    return {
      runDate: result.runDate,
      alreadyRan: true,
      symbolsScanned: 0,
      constituentsSource: "embedded",
      indexRefreshedFromNse: false,
      snapshotId: existing?.snapshotId ?? 0,
      spikes: [],
    };
  }

  const volume = result.strategies!.volume;
  return {
    runDate: result.runDate,
    alreadyRan: false,
    symbolsScanned: result.symbolsScanned,
    constituentsSource: result.constituentsSource,
    indexRefreshedFromNse: result.indexRefreshedFromNse,
    snapshotId: volume.snapshotId,
    spikes: volume.spikes,
  };
}

/** @deprecated Prefer `runDailyScan()` for multi-strategy daily jobs. */
export async function runDailyVolumeScan(options?: {
  force?: boolean;
  runDate?: string;
}): Promise<DailyVolumeScanResult> {
  return toDailyVolumeScanResult(await runDailyScan(options));
}

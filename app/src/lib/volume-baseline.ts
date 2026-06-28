export const VOLUME_BASELINE_SESSIONS = 20;
export const MIN_PRIOR_VOLUME_SESSIONS = 10;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type VolumeBaseline = {
  /** Mean volume over the chosen baseline window. */
  avgVolume: number;
  /** Sessions included in the average. */
  sessionCount: number;
  /** True when history was too short for a full pre-period window. */
  usedFallback: boolean;
};

/**
 * Volume baseline used by both volume analysis and weekly movers.
 *
 * Takes the average of `baselineSessions` bars that end immediately before a
 * recent `gapSessions` window (the move window). That window is excluded so a
 * multi-day volume surge does not inflate the denominator.
 */
export function computePrePeriodVolumeBaseline(
  volumes: number[],
  gapSessions: number,
  baselineSessions = VOLUME_BASELINE_SESSIONS,
): VolumeBaseline | null {
  const n = volumes.length;
  const gap = Math.max(1, Math.floor(gapSessions));
  const base = Math.max(1, Math.floor(baselineSessions));

  if (n < gap + 2) {
    return null;
  }

  const last = n - 1;
  const startIdx = last - gap;
  const priorStart = Math.max(0, startIdx - base);
  const priorVolumes = volumes.slice(priorStart, startIdx);
  const fallbackPrior = volumes.slice(Math.max(0, n - 21), n - 1);
  const usedFallback = priorVolumes.length < MIN_PRIOR_VOLUME_SESSIONS;
  const chosen = usedFallback ? fallbackPrior : priorVolumes;

  if (chosen.length === 0) {
    return null;
  }

  return {
    avgVolume: average(chosen),
    sessionCount: chosen.length,
    usedFallback,
  };
}

export function volumeSpikeRatio(
  currentVolume: number,
  baseline: VolumeBaseline | null,
): number {
  if (!baseline || baseline.avgVolume <= 0 || !Number.isFinite(currentVolume)) {
    return 0;
  }
  return currentVolume / baseline.avgVolume;
}

export function periodAvgVolumeChangeLabel(lookbackDays: number): string {
  return `${lookbackDays}d avg vol vs baseline`;
}

export function periodAvgVolumeChangeTitle(lookbackDays: number): string {
  return `% change: average volume over the last ${lookbackDays} sessions vs the pre-move 20-session baseline`;
}

export const TODAY_VOLUME_VS_BASELINE_LABEL = "Today vol vs baseline";

export const TODAY_VOLUME_VS_BASELINE_TITLE =
  "Today's session volume divided by the pre-move 20-session baseline";

export const BASELINE_VOLUME_LABEL = "Pre-move baseline vol";

export const BASELINE_VOLUME_TITLE =
  "20-session average volume from before the recent lookback window";

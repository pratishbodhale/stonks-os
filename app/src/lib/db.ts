import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { getDataDir, getDatabasePath } from "@/lib/data-path";
import type { SymbolSnapshot, WeeklyMoverAiBrief, WeeklyMoverAiBriefMeta, WeeklyMoverRow } from "@/lib/types";

type SnapshotRowRecord = {
  symbol: string;
  current_price: number;
  previous_close: number;
  current_volume: number;
  avg_volume_20: number;
  highest_close_20: number;
  price_change_pct: number;
  vol_spike: number;
  breakout: number;
  pe: number | null;
  industry: string | null;
  industry_pe: number | null;
  volume_buying_days?: number | null;
  volume_buying_lookback?: number | null;
  volume_buying_mult?: number | null;
  volume_buying_up_only?: number | null;
  sma_50?: number | null;
  sma_200?: number | null;
  sma_spread_pct?: number | null;
  golden_cross?: number | null;
  days_since_golden_cross?: number | null;
};

const dataDir = getDataDir();
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(getDatabasePath());
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    symbols_scanned INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fcm_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_scan_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date TEXT NOT NULL UNIQUE,
    snapshot_id INTEGER,
    spike_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nifty_index_cache (
    universe TEXT PRIMARY KEY,
    symbols_json TEXT NOT NULL,
    refreshed_at TEXT NOT NULL,
    symbol_count INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshot_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    current_price REAL NOT NULL,
    previous_close REAL NOT NULL,
    current_volume REAL NOT NULL,
    avg_volume_20 REAL NOT NULL,
    highest_close_20 REAL NOT NULL,
    price_change_pct REAL NOT NULL,
    vol_spike REAL NOT NULL,
    breakout INTEGER NOT NULL,
    pe REAL,
    industry TEXT,
    industry_pe REAL,
    FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
  );

  CREATE TABLE IF NOT EXISTS weekly_mover_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    symbols_scanned INTEGER NOT NULL,
    nifty_universe TEXT NOT NULL,
    lookback_days INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weekly_mover_snapshot_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    current_price REAL NOT NULL,
    period_start_price REAL NOT NULL,
    period_change_pct REAL NOT NULL,
    period_high REAL NOT NULL,
    period_low REAL NOT NULL,
    day_change_pct REAL NOT NULL,
    avg_volume_period REAL NOT NULL,
    avg_volume_prior_20 REAL NOT NULL,
    volume_change_pct REAL,
    vol_spike_today REAL NOT NULL,
    pe REAL,
    industry TEXT,
    industry_pe REAL,
    lookback_days INTEGER NOT NULL,
    FOREIGN KEY(snapshot_id) REFERENCES weekly_mover_snapshots(id)
  );

  CREATE TABLE IF NOT EXISTS weekly_mover_ai_briefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    brief_type TEXT NOT NULL,
    symbol TEXT,
    provider TEXT NOT NULL,
    model TEXT,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(snapshot_id) REFERENCES weekly_mover_snapshots(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_mover_ai_briefs_unique
    ON weekly_mover_ai_briefs(snapshot_id, brief_type, coalesce(symbol, ''), provider);
`);
function ensureColumnExists(columnDef: string) {
  try {
    sqlite.exec(`ALTER TABLE snapshot_rows ADD COLUMN ${columnDef}`);
  } catch {
    // Existing databases already containing the column will throw here.
  }
}

function ensureSnapshotTableColumnExists(columnDef: string) {
  try {
    sqlite.exec(`ALTER TABLE snapshots ADD COLUMN ${columnDef}`);
  } catch {
    // Column already present.
  }
}

ensureColumnExists("pe REAL");
ensureColumnExists("industry TEXT");
ensureColumnExists("industry_pe REAL");
ensureColumnExists("volume_buying_days INTEGER");
ensureColumnExists("volume_buying_lookback INTEGER");
ensureColumnExists("volume_buying_mult REAL");
ensureColumnExists("volume_buying_up_only INTEGER");
ensureColumnExists("sma_50 REAL");
ensureColumnExists("sma_200 REAL");
ensureColumnExists("sma_spread_pct REAL");
ensureColumnExists("golden_cross INTEGER");
ensureColumnExists("days_since_golden_cross INTEGER");
ensureSnapshotTableColumnExists("nifty_universe TEXT");

function ensureDailyScanRunColumnExists(columnDef: string) {
  try {
    sqlite.exec(`ALTER TABLE daily_scan_runs ADD COLUMN ${columnDef}`);
  } catch {
    // Column already present.
  }
}

ensureDailyScanRunColumnExists("weekly_mover_snapshot_id INTEGER");
ensureDailyScanRunColumnExists("weekly_gainer_count INTEGER NOT NULL DEFAULT 0");

export type DailyScanRunRecord = {
  id: number;
  runDate: string;
  snapshotId: number | null;
  spikeCount: number;
  weeklyMoverSnapshotId: number | null;
  weeklyGainerCount: number;
  createdAt: string;
};

function toSymbolSnapshot(row: SnapshotRowRecord): SymbolSnapshot {
  return {
    symbol: row.symbol,
    currentPrice: row.current_price,
    previousClose: row.previous_close,
    currentVolume: row.current_volume,
    avgVolume20: row.avg_volume_20,
    highestClose20: row.highest_close_20,
    priceChangePct: row.price_change_pct,
    volSpike: row.vol_spike,
    breakout: Boolean(row.breakout),
    pe: row.pe,
    industry: row.industry,
    industryPe: row.industry_pe,
    volumeBuyingDays: row.volume_buying_days ?? 0,
    volumeBuyingLookback: row.volume_buying_lookback ?? 5,
    volumeBuyingMult: row.volume_buying_mult ?? 1.5,
    volumeBuyingUpDayOnly: Boolean(row.volume_buying_up_only ?? 1),
    sma50: row.sma_50 ?? null,
    sma200: row.sma_200 ?? null,
    smaSpreadPct: row.sma_spread_pct ?? null,
    goldenCross: Boolean(row.golden_cross ?? 0),
    daysSinceGoldenCross: row.days_since_golden_cross ?? null,
  };
}

export function saveSnapshot(
  results: SymbolSnapshot[],
  symbolsScanned: number,
  niftyUniverse: string = "200",
): number {
  const createdAt = new Date().toISOString();
  const insertSnapshot = sqlite.prepare(
    "INSERT INTO snapshots (created_at, symbols_scanned, nifty_universe) VALUES (?, ?, ?)",
  );
  const insertRow = sqlite.prepare(`
    INSERT INTO snapshot_rows (
      snapshot_id, symbol, current_price, previous_close, current_volume, avg_volume_20,
      highest_close_20, price_change_pct, vol_spike, breakout, pe, industry, industry_pe,
      volume_buying_days, volume_buying_lookback, volume_buying_mult, volume_buying_up_only,
      sma_50, sma_200, sma_spread_pct, golden_cross, days_since_golden_cross
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = sqlite.transaction(() => {
    const snapshotResult = insertSnapshot.run(createdAt, symbolsScanned, niftyUniverse);
    const snapshotId = Number(snapshotResult.lastInsertRowid);
    for (const row of results) {
      insertRow.run(
        snapshotId,
        row.symbol,
        row.currentPrice,
        row.previousClose,
        row.currentVolume,
        row.avgVolume20,
        row.highestClose20,
        row.priceChangePct,
        row.volSpike,
        row.breakout ? 1 : 0,
        row.pe,
        row.industry,
        row.industryPe,
        row.volumeBuyingDays,
        row.volumeBuyingLookback,
        row.volumeBuyingMult,
        row.volumeBuyingUpDayOnly ? 1 : 0,
        row.sma50,
        row.sma200,
        row.smaSpreadPct,
        row.goldenCross ? 1 : 0,
        row.daysSinceGoldenCross,
      );
    }
    return snapshotId;
  });

  return transaction();
}

export function getSnapshotRows(snapshotId: number): SymbolSnapshot[] {
  const rows = sqlite
    .prepare(
      `
      SELECT symbol, current_price, previous_close, current_volume, avg_volume_20,
             highest_close_20, price_change_pct, vol_spike, breakout, pe, industry, industry_pe,
             volume_buying_days, volume_buying_lookback, volume_buying_mult, volume_buying_up_only,
             sma_50, sma_200, sma_spread_pct, golden_cross, days_since_golden_cross
      FROM snapshot_rows
      WHERE snapshot_id = ?
      ORDER BY vol_spike DESC, price_change_pct DESC
    `,
    )
    .all(snapshotId) as SnapshotRowRecord[];

  return rows.map(toSymbolSnapshot);
}

export function getSnapshotMeta(
  snapshotId: number,
): { id: number; createdAt: string; symbolsScanned: number; niftyUniverse: string } | null {
  const row = sqlite
    .prepare(
      "SELECT id, created_at as createdAt, symbols_scanned as symbolsScanned, " +
        "coalesce(nifty_universe, '200') as niftyUniverse " +
        "FROM snapshots WHERE id = ?",
    )
    .get(snapshotId) as
    | { id: number; createdAt: string; symbolsScanned: number; niftyUniverse: string }
    | undefined;
  return row ?? null;
}

export function saveFcmToken(token: string): void {
  sqlite
    .prepare("INSERT OR IGNORE INTO fcm_tokens (token) VALUES (?)")
    .run(token.trim());
}

export function listFcmTokens(): string[] {
  const rows = sqlite.prepare("SELECT token FROM fcm_tokens ORDER BY id ASC").all() as Array<{
    token: string;
  }>;
  return rows.map((row) => row.token);
}

export function removeFcmTokens(tokens: string[]): void {
  if (tokens.length === 0) {
    return;
  }
  const placeholders = tokens.map(() => "?").join(", ");
  sqlite.prepare(`DELETE FROM fcm_tokens WHERE token IN (${placeholders})`).run(...tokens);
}

export function getDailyScanRun(runDate: string): DailyScanRunRecord | null {
  const row = sqlite
    .prepare(
      `
      SELECT id, run_date as runDate, snapshot_id as snapshotId, spike_count as spikeCount,
             weekly_mover_snapshot_id as weeklyMoverSnapshotId,
             weekly_gainer_count as weeklyGainerCount, created_at as createdAt
      FROM daily_scan_runs
      WHERE run_date = ?
    `,
    )
    .get(runDate) as DailyScanRunRecord | undefined;
  return row ?? null;
}

export function saveDailyScanRun(
  runDate: string,
  snapshotId: number | null,
  spikeCount: number,
  weeklyMoverSnapshotId: number | null = null,
  weeklyGainerCount = 0,
): void {
  const createdAt = new Date().toISOString();
  sqlite
    .prepare(
      `
      INSERT OR REPLACE INTO daily_scan_runs (
        run_date, snapshot_id, spike_count, weekly_mover_snapshot_id, weekly_gainer_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(runDate, snapshotId, spikeCount, weeklyMoverSnapshotId, weeklyGainerCount, createdAt);
}

export function listDailyScanRuns(limit = 30): DailyScanRunRecord[] {
  return sqlite
    .prepare(
      `
      SELECT id, run_date as runDate, snapshot_id as snapshotId, spike_count as spikeCount,
             weekly_mover_snapshot_id as weeklyMoverSnapshotId,
             weekly_gainer_count as weeklyGainerCount, created_at as createdAt
      FROM daily_scan_runs
      ORDER BY run_date DESC
      LIMIT ?
    `,
    )
    .all(limit) as DailyScanRunRecord[];
}

export type NiftyIndexCache = {
  universe: string;
  symbols: string[];
  refreshedAt: string;
};

export function getNiftyIndexCache(universe: string): NiftyIndexCache | null {
  const row = sqlite
    .prepare(
      "SELECT universe, symbols_json as symbolsJson, refreshed_at as refreshedAt FROM nifty_index_cache WHERE universe = ?",
    )
    .get(universe) as { universe: string; symbolsJson: string; refreshedAt: string } | undefined;

  if (!row) {
    return null;
  }

  try {
    const symbols = JSON.parse(row.symbolsJson) as string[];
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return null;
    }
    return { universe: row.universe, symbols, refreshedAt: row.refreshedAt };
  } catch {
    return null;
  }
}

export function saveNiftyIndexCache(universe: string, symbols: string[]): void {
  const refreshedAt = new Date().toISOString();
  sqlite
    .prepare(
      "INSERT OR REPLACE INTO nifty_index_cache (universe, symbols_json, refreshed_at, symbol_count) VALUES (?, ?, ?, ?)",
    )
    .run(universe, JSON.stringify(symbols), refreshedAt, symbols.length);
}

export function listSnapshots(
  limit = 25,
): Array<{ id: number; createdAt: string; symbolsScanned: number; niftyUniverse: string }> {
  return sqlite
    .prepare(
      `
      SELECT id, created_at as createdAt, symbols_scanned as symbolsScanned,
             coalesce(nifty_universe, '200') as niftyUniverse
      FROM snapshots
      ORDER BY id DESC
      LIMIT ?
    `,
    )
    .all(limit) as Array<{
    id: number;
    createdAt: string;
    symbolsScanned: number;
    niftyUniverse: string;
  }>;
}

type WeeklyMoverSnapshotRowRecord = {
  symbol: string;
  current_price: number;
  period_start_price: number;
  period_change_pct: number;
  period_high: number;
  period_low: number;
  day_change_pct: number;
  avg_volume_period: number;
  avg_volume_prior_20: number;
  volume_change_pct: number | null;
  vol_spike_today: number;
  pe: number | null;
  industry: string | null;
  industry_pe: number | null;
  lookback_days: number;
};

function toWeeklyMoverRow(row: WeeklyMoverSnapshotRowRecord): WeeklyMoverRow {
  return {
    symbol: row.symbol,
    currentPrice: row.current_price,
    periodStartPrice: row.period_start_price,
    periodChangePct: row.period_change_pct,
    periodHigh: row.period_high,
    periodLow: row.period_low,
    dayChangePct: row.day_change_pct,
    avgVolumePeriod: row.avg_volume_period,
    avgVolumePrior20: row.avg_volume_prior_20,
    volumeChangePct: row.volume_change_pct,
    volSpikeToday: row.vol_spike_today,
    pe: row.pe,
    industry: row.industry,
    industryPe: row.industry_pe,
    lookbackDays: row.lookback_days,
  };
}

export function saveWeeklyMoverSnapshot(
  results: WeeklyMoverRow[],
  symbolsScanned: number,
  niftyUniverse: string,
  lookbackDays: number,
): number {
  const createdAt = new Date().toISOString();
  const insertSnapshot = sqlite.prepare(
    "INSERT INTO weekly_mover_snapshots (created_at, symbols_scanned, nifty_universe, lookback_days) VALUES (?, ?, ?, ?)",
  );
  const insertRow = sqlite.prepare(`
    INSERT INTO weekly_mover_snapshot_rows (
      snapshot_id, symbol, current_price, period_start_price, period_change_pct,
      period_high, period_low, day_change_pct, avg_volume_period, avg_volume_prior_20,
      volume_change_pct, vol_spike_today, pe, industry, industry_pe, lookback_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = sqlite.transaction(() => {
    const snapshotResult = insertSnapshot.run(createdAt, symbolsScanned, niftyUniverse, lookbackDays);
    const snapshotId = Number(snapshotResult.lastInsertRowid);
    for (const row of results) {
      insertRow.run(
        snapshotId,
        row.symbol,
        row.currentPrice,
        row.periodStartPrice,
        row.periodChangePct,
        row.periodHigh,
        row.periodLow,
        row.dayChangePct,
        row.avgVolumePeriod,
        row.avgVolumePrior20,
        row.volumeChangePct,
        row.volSpikeToday,
        row.pe,
        row.industry,
        row.industryPe,
        row.lookbackDays,
      );
    }
    return snapshotId;
  });

  return transaction();
}

export function getWeeklyMoverSnapshotRows(snapshotId: number): WeeklyMoverRow[] {
  const rows = sqlite
    .prepare(
      `
      SELECT symbol, current_price, period_start_price, period_change_pct,
             period_high, period_low, day_change_pct, avg_volume_period, avg_volume_prior_20,
             volume_change_pct, vol_spike_today, pe, industry, industry_pe, lookback_days
      FROM weekly_mover_snapshot_rows
      WHERE snapshot_id = ?
      ORDER BY abs(period_change_pct) DESC, vol_spike_today DESC
    `,
    )
    .all(snapshotId) as WeeklyMoverSnapshotRowRecord[];

  return rows.map(toWeeklyMoverRow);
}

export function getWeeklyMoverSnapshotMeta(
  snapshotId: number,
): {
  id: number;
  createdAt: string;
  symbolsScanned: number;
  niftyUniverse: string;
  lookbackDays: number;
} | null {
  const row = sqlite
    .prepare(
      `
      SELECT id, created_at as createdAt, symbols_scanned as symbolsScanned,
             nifty_universe as niftyUniverse, lookback_days as lookbackDays
      FROM weekly_mover_snapshots
      WHERE id = ?
    `,
    )
    .get(snapshotId) as
    | {
        id: number;
        createdAt: string;
        symbolsScanned: number;
        niftyUniverse: string;
        lookbackDays: number;
      }
    | undefined;
  return row ?? null;
}

export function listWeeklyMoverSnapshots(
  limit = 50,
): Array<{
  id: number;
  createdAt: string;
  symbolsScanned: number;
  niftyUniverse: string;
  lookbackDays: number;
  aiBriefCount: number;
  hasMarketBrief: boolean;
}> {
  const rows = sqlite
    .prepare(
      `
      SELECT s.id, s.created_at as createdAt, s.symbols_scanned as symbolsScanned,
             s.nifty_universe as niftyUniverse, s.lookback_days as lookbackDays,
             count(b.id) as aiBriefCount,
             max(case when b.brief_type = 'market' then 1 else 0 end) as hasMarketBrief
      FROM weekly_mover_snapshots s
      LEFT JOIN weekly_mover_ai_briefs b ON b.snapshot_id = s.id
      GROUP BY s.id
      ORDER BY s.id DESC
      LIMIT ?
    `,
    )
    .all(limit) as Array<{
    id: number;
    createdAt: string;
    symbolsScanned: number;
    niftyUniverse: string;
    lookbackDays: number;
    aiBriefCount: number;
    hasMarketBrief: number;
  }>;

  return rows.map((row) => ({
    ...row,
    hasMarketBrief: Boolean(row.hasMarketBrief),
  }));
}

type WeeklyMoverAiBriefRecord = {
  id: number;
  snapshot_id: number;
  brief_type: string;
  symbol: string | null;
  provider: string;
  model: string | null;
  text?: string;
  created_at: string;
  snapshot_created_at: string;
  nifty_universe: string;
  lookback_days: number;
};

function toWeeklyMoverAiBriefMeta(row: WeeklyMoverAiBriefRecord): WeeklyMoverAiBriefMeta {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    briefType: row.brief_type === "stock" ? "stock" : "market",
    symbol: row.symbol,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    snapshotCreatedAt: row.snapshot_created_at,
    niftyUniverse: row.nifty_universe,
    lookbackDays: row.lookback_days,
  };
}

function toWeeklyMoverAiBrief(row: WeeklyMoverAiBriefRecord): WeeklyMoverAiBrief {
  return {
    ...toWeeklyMoverAiBriefMeta(row),
    text: row.text ?? "",
  };
}

const weeklyMoverAiBriefSelect = `
  SELECT b.id, b.snapshot_id, b.brief_type, b.symbol, b.provider, b.model, b.text, b.created_at,
         s.created_at as snapshot_created_at, s.nifty_universe, s.lookback_days
  FROM weekly_mover_ai_briefs b
  JOIN weekly_mover_snapshots s ON s.id = b.snapshot_id
`;

const weeklyMoverAiBriefMetaSelect = `
  SELECT b.id, b.snapshot_id, b.brief_type, b.symbol, b.provider, b.model, b.created_at,
         s.created_at as snapshot_created_at, s.nifty_universe, s.lookback_days
  FROM weekly_mover_ai_briefs b
  JOIN weekly_mover_snapshots s ON s.id = b.snapshot_id
`;

export function saveWeeklyMoverAiBrief(params: {
  snapshotId: number;
  briefType: "market" | "stock";
  symbol: string | null;
  provider: string;
  model: string | null;
  text: string;
}): number {
  const createdAt = new Date().toISOString();
  const symbol = params.briefType === "stock" ? params.symbol?.trim() || null : null;
  const existing = sqlite
    .prepare(
      `
      SELECT id FROM weekly_mover_ai_briefs
      WHERE snapshot_id = ? AND brief_type = ? AND coalesce(symbol, '') = coalesce(?, '') AND provider = ?
    `,
    )
    .get(params.snapshotId, params.briefType, symbol, params.provider) as { id: number } | undefined;

  if (existing) {
    sqlite
      .prepare(
        "UPDATE weekly_mover_ai_briefs SET model = ?, text = ?, created_at = ? WHERE id = ?",
      )
      .run(params.model, params.text, createdAt, existing.id);
    return existing.id;
  }

  const result = sqlite
    .prepare(
      `
      INSERT INTO weekly_mover_ai_briefs (
        snapshot_id, brief_type, symbol, provider, model, text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      params.snapshotId,
      params.briefType,
      symbol,
      params.provider,
      params.model,
      params.text,
      createdAt,
    );
  return Number(result.lastInsertRowid);
}

export function getWeeklyMoverAiBrief(id: number): WeeklyMoverAiBrief | null {
  const row = sqlite
    .prepare(`${weeklyMoverAiBriefSelect} WHERE b.id = ?`)
    .get(id) as WeeklyMoverAiBriefRecord | undefined;
  return row ? toWeeklyMoverAiBrief(row) : null;
}

export function getLatestWeeklyMoverAiBrief(
  snapshotId: number,
  briefType: "market" | "stock",
  symbol?: string | null,
): WeeklyMoverAiBrief | null {
  const symbolFilter = briefType === "stock" ? symbol?.trim() || null : null;
  const row = sqlite
    .prepare(
      `
      ${weeklyMoverAiBriefSelect}
      WHERE b.snapshot_id = ? AND b.brief_type = ?
        AND coalesce(b.symbol, '') = coalesce(?, '')
      ORDER BY b.created_at DESC
      LIMIT 1
    `,
    )
    .get(snapshotId, briefType, symbolFilter) as WeeklyMoverAiBriefRecord | undefined;
  return row ? toWeeklyMoverAiBrief(row) : null;
}

export function listWeeklyMoverAiBriefs(
  limit = 50,
  filters?: {
    snapshotId?: number;
    briefType?: "market" | "stock";
    symbol?: string | null;
  },
): WeeklyMoverAiBriefMeta[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.snapshotId) {
    clauses.push("b.snapshot_id = ?");
    params.push(filters.snapshotId);
  }
  if (filters?.briefType) {
    clauses.push("b.brief_type = ?");
    params.push(filters.briefType);
  }
  if (filters?.symbol) {
    clauses.push("b.symbol = ?");
    params.push(filters.symbol.trim());
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(limit);

  const rows = sqlite
    .prepare(
      `
      ${weeklyMoverAiBriefMetaSelect}
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ?
    `,
    )
    .all(...params) as WeeklyMoverAiBriefRecord[];

  return rows.map(toWeeklyMoverAiBriefMeta);
}

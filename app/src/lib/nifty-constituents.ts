import embedded50 from "./embedded-nifty-50.json";
import embedded200 from "./embedded-nifty-200.json";
import embedded500 from "./embedded-nifty-500.json";

export type NiftyUniverse = "50" | "200" | "500";

export const NIFTY_UNIVERSE_OPTIONS: NiftyUniverse[] = ["50", "200", "500"];

/** NIFTY 500 auto-refresh from NSE runs at most once per month. */
export const NIFTY_500_REFRESH_INTERVAL_DAYS = 30;

const NSE_INDEX_CSV: Record<NiftyUniverse, string> = {
  "50": "https://archives.nseindia.com/content/indices/ind_nifty50list.csv",
  "200": "https://archives.nseindia.com/content/indices/ind_nifty200list.csv",
  "500": "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",
};

const EMBEDDED: Record<NiftyUniverse, string[]> = {
  "50": embedded50 as string[],
  "200": embedded200 as string[],
  "500": embedded500 as string[],
};

/** In-process cache of last successful NSE list per universe (survives until server restart). */
const symbolListMemory: Partial<Record<NiftyUniverse, string[]>> = {};

function parseCsvLine(line: string): string[] {
  const row: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      row.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  return row.map((c) => c.replace(/^"|"$/g, "").trim());
}

function parseNseIndexCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }
  const headerCols = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
  const symIdx = headerCols.indexOf("symbol");
  if (symIdx < 0) {
    return [];
  }
  const out: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const sym = row[symIdx];
    if (sym) {
      out.push(sym);
    }
  }
  return [...new Set(out)];
}

async function fetchNseIndexSymbols(u: NiftyUniverse): Promise<string[] | null> {
  const url = NSE_INDEX_CSV[u];
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: ac.signal, next: { revalidate: 0 } });
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    const syms = parseNseIndexCsv(text);
    return syms.length > 0 ? syms : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function parseNiftyUniverse(s: string | null): NiftyUniverse {
  if (s === "50" || s === "200" || s === "500") {
    return s;
  }
  return "200";
}

export type ConstituentSource = "memory" | "embedded";

const indexMeta: Partial<Record<NiftyUniverse, { count: number; at: string }>> = {};

export function setIndexSymbolsInMemory(
  u: NiftyUniverse,
  symbols: string[],
  refreshedAt: string,
): void {
  symbolListMemory[u] = symbols;
  indexMeta[u] = { count: symbols.length, at: refreshedAt };
}

/**
 * Fetches the latest NSE index CSV and stores it in memory for this process.
 */
export async function refreshNiftyIndexFromNse(
  u: NiftyUniverse,
): Promise<{ ok: true; count: number; refreshedAt: string } | { ok: false; error: string }> {
  const nse = await fetchNseIndexSymbols(u);
  if (!nse?.length) {
    return { ok: false, error: "Could not load the index from NSE (network or format)." };
  }
  const refreshedAt = new Date().toISOString();
  setIndexSymbolsInMemory(u, nse, refreshedAt);
  return { ok: true, count: nse.length, refreshedAt };
}

export function getLastIndexRefreshInfo(u: NiftyUniverse): { count: number; at: string } | null {
  return indexMeta[u] ?? null;
}

/**
 * In-memory NSE list state for this server process (e.g. sync to client on load).
 */
export function getNseIndexStatus(): Record<
  NiftyUniverse,
  { symbolsPulled: number; fetchedAt: string } | null
> {
  return {
    "50": toClientPull("50"),
    "200": toClientPull("200"),
    "500": toClientPull("500"),
  };
}

function toClientPull(
  u: NiftyUniverse,
): { symbolsPulled: number; fetchedAt: string } | null {
  const meta = indexMeta[u];
  if (meta) {
    return { symbolsPulled: meta.count, fetchedAt: meta.at };
  }
  const mem = symbolListMemory[u];
  if (mem?.length) {
    return { symbolsPulled: mem.length, fetchedAt: new Date().toISOString() };
  }
  return null;
}

/**
 * Resolves the symbol list for a Yahoo scan: in-memory NSE list if set, else embedded backup.
 */
export function getIndexSymbolsForScan(
  u: NiftyUniverse,
): { symbols: string[]; source: ConstituentSource } {
  if (symbolListMemory[u]?.length) {
    return { symbols: symbolListMemory[u]!, source: "memory" };
  }
  return { symbols: EMBEDDED[u], source: "embedded" };
}

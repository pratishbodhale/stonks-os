import { withBasePath } from "@/lib/base-path";

export function getScreenerUrl(symbol: string): string {
  return `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
}

export function getTradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/symbols/NSE-${encodeURIComponent(symbol)}/`;
}

export function getRunDetailsPath(snapshotId: number): string {
  return withBasePath(`/runs/${snapshotId}`);
}

export function getWeeklyRunDetailsPath(snapshotId: number): string {
  return withBasePath(`/runs/weekly/${snapshotId}`);
}

export function getRunDetailsUrl(snapshotId: number): string {
  const path = `/runs/${snapshotId}`;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : withBasePath(path);
}

export function getWeeklyRunDetailsUrl(snapshotId: number): string {
  const path = `/runs/weekly/${snapshotId}`;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : withBasePath(path);
}

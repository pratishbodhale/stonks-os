import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";
import { DAILY_VOLUME_SPIKE_THRESHOLD } from "@/lib/daily-volume-scan";
import { getScreenerUrl, getTradingViewUrl } from "@/lib/stock-links";
import type { SymbolSnapshot } from "@/lib/types";
import {
  BASELINE_VOLUME_LABEL,
  BASELINE_VOLUME_TITLE,
  TODAY_VOLUME_VS_BASELINE_LABEL,
  TODAY_VOLUME_VS_BASELINE_TITLE,
} from "@/lib/volume-baseline";

type RunResultsTableProps = {
  rows: SymbolSnapshot[];
};

export function RunResultsTable({ rows }: RunResultsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
        No stocks met the {DAILY_VOLUME_SPIKE_THRESHOLD}× volume threshold in this run.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="min-w-[1320px] border-separate border-spacing-0 text-sm">
        <thead className="text-left">
          <tr>
            <th className="sticky left-0 z-30 border-b border-r border-zinc-200/80 bg-zinc-100 px-3 py-2 text-zinc-900 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)]">
              Symbol
            </th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Industry</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Price</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Change %</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Volume</th>
            <th
              className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2"
              title={BASELINE_VOLUME_TITLE}
            >
              {BASELINE_VOLUME_LABEL}
            </th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">PE</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Industry PE</th>
            <th
              className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2"
              title={TODAY_VOLUME_VS_BASELINE_TITLE}
            >
              {TODAY_VOLUME_VS_BASELINE_LABEL}
            </th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Breakout</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">SMA spread</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Golden cross</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Screener</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">TradingView</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const stripeClass = rowIndex % 2 === 1 ? "bg-zinc-50" : "bg-white";
            return (
              <tr key={row.symbol} className={`border-t border-zinc-200 ${stripeClass}`}>
                <td
                  className={`sticky left-0 z-20 whitespace-nowrap border-r border-zinc-200 px-3 py-2 font-medium shadow-[4px_0_8px_-2px_rgba(0,0,0,0.1)] [background-clip:padding-box] ${stripeClass}`}
                >
                  {row.symbol}
                </td>
                <td className="px-3 py-2">{row.industry ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{row.currentPrice.toFixed(2)}</td>
                <td
                  className={`px-3 py-2 tabular-nums ${row.priceChangePct >= 0 ? "text-emerald-700" : "text-red-700"}`}
                >
                  {row.priceChangePct >= 0 ? "+" : ""}
                  {row.priceChangePct.toFixed(2)}%
                </td>
                <td className="px-3 py-2 tabular-nums">{formatVolume(row.currentVolume)}</td>
                <td className="px-3 py-2 tabular-nums">{formatVolume(row.avgVolume20)}</td>
                <td className="px-3 py-2 tabular-nums">{row.pe !== null ? row.pe.toFixed(2) : "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.industryPe !== null ? row.industryPe.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums font-semibold text-violet-700">
                  {row.volSpike.toFixed(2)}×
                </td>
                <td className="px-3 py-2">{row.breakout ? "Yes" : "No"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.smaSpreadPct !== null
                    ? `${row.smaSpreadPct >= 0 ? "+" : ""}${row.smaSpreadPct.toFixed(2)}%`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {row.goldenCross ? (
                    <span className="font-medium text-emerald-700">Today</span>
                  ) : row.daysSinceGoldenCross !== null ? (
                    <span className="text-zinc-700">{row.daysSinceGoldenCross}d ago</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={getScreenerUrl(row.symbol)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-700"
                    aria-label={`Open ${row.symbol} on Screener`}
                  >
                    <ExternalLinkIcon />
                  </a>
                </td>
                <td className="px-3 py-2">
                  <a
                    href={getTradingViewUrl(row.symbol)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-700"
                    aria-label={`Open ${row.symbol} on TradingView`}
                  >
                    <ExternalLinkIcon />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

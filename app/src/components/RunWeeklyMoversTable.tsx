"use client";

import { useMemo } from "react";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";
import {
  useWeeklyMoverSortState,
  WeeklyMoverSortHeader,
} from "@/components/WeeklyMoverSortHeader";
import { getScreenerUrl, getTradingViewUrl } from "@/lib/stock-links";
import type { WeeklyMoverRow } from "@/lib/types";
import {
  periodAvgVolumeChangeLabel,
  periodAvgVolumeChangeTitle,
  TODAY_VOLUME_VS_BASELINE_LABEL,
  TODAY_VOLUME_VS_BASELINE_TITLE,
} from "@/lib/volume-baseline";
import { sortWeeklyMoverRows } from "@/lib/weekly-mover-sort";

function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

type RunWeeklyMoversTableProps = {
  rows: WeeklyMoverRow[];
  lookbackDays: number;
  emptyMessage?: string;
};

export function RunWeeklyMoversTable({
  rows,
  lookbackDays,
  emptyMessage = "No weekly gainers met the threshold in this run.",
}: RunWeeklyMoversTableProps) {
  const { sortKey, sortDirection, toggleSort } = useWeeklyMoverSortState("periodChangePct", "desc");
  const sortedRows = useMemo(
    () => sortWeeklyMoverRows(rows, sortKey, sortDirection),
    [rows, sortKey, sortDirection],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="min-w-[1100px] border-separate border-spacing-0 text-sm">
        <thead className="text-left">
          <tr>
            <WeeklyMoverSortHeader
              label="Symbol"
              sortKey="symbol"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              sticky
            />
            <WeeklyMoverSortHeader
              label="Industry"
              sortKey="industry"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <WeeklyMoverSortHeader
              label={`${lookbackDays}d move`}
              sortKey="periodChangePct"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              title={`Close-to-close over last ${lookbackDays} sessions`}
            />
            <WeeklyMoverSortHeader
              label="Today"
              sortKey="dayChangePct"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <WeeklyMoverSortHeader
              label="Current price"
              sortKey="currentPrice"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <WeeklyMoverSortHeader
              label="Period H / L"
              sortKey="periodHigh"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              title="Sort by period high"
            />
            <WeeklyMoverSortHeader
              label={periodAvgVolumeChangeLabel(lookbackDays)}
              sortKey="volumeChangePct"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              title={periodAvgVolumeChangeTitle(lookbackDays)}
            />
            <WeeklyMoverSortHeader
              label={TODAY_VOLUME_VS_BASELINE_LABEL}
              sortKey="volSpikeToday"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              title={TODAY_VOLUME_VS_BASELINE_TITLE}
            />
            <WeeklyMoverSortHeader
              label="PE"
              sortKey="pe"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Screener</th>
            <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">TradingView</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, rowIndex) => {
            const stripeClass = rowIndex % 2 === 1 ? "bg-zinc-50" : "bg-white";
            return (
              <tr key={row.symbol} className={`border-t border-zinc-200 ${stripeClass}`}>
                <td
                  className={`sticky left-0 z-20 whitespace-nowrap border-r border-zinc-200 px-3 py-2 font-medium shadow-[4px_0_8px_-2px_rgba(0,0,0,0.1)] [background-clip:padding-box] ${stripeClass}`}
                >
                  {row.symbol}
                </td>
                <td className="px-3 py-2">{row.industry ?? "—"}</td>
                <td
                  className={`px-3 py-2 tabular-nums font-semibold ${row.periodChangePct >= 0 ? "text-emerald-700" : "text-red-700"}`}
                >
                  {formatPct(row.periodChangePct)}
                </td>
                <td
                  className={`px-3 py-2 tabular-nums ${row.dayChangePct >= 0 ? "text-emerald-700" : "text-red-700"}`}
                >
                  {formatPct(row.dayChangePct)}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-900">
                  {row.currentPrice.toFixed(2)}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-700">
                  {row.periodHigh.toFixed(2)} / {row.periodLow.toFixed(2)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {row.volumeChangePct !== null ? formatPct(row.volumeChangePct) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums font-semibold text-violet-700">
                  {row.volSpikeToday.toFixed(2)}×
                </td>
                <td className="px-3 py-2 tabular-nums">{row.pe !== null ? row.pe.toFixed(2) : "—"}</td>
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

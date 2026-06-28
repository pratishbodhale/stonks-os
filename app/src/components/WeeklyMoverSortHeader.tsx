"use client";

import { useState } from "react";
import type { SortDirection, WeeklyMoverSortKey } from "@/lib/weekly-mover-sort";
import { defaultSortDirection } from "@/lib/weekly-mover-sort";

type WeeklyMoverSortHeaderProps = {
  label: string;
  sortKey: WeeklyMoverSortKey;
  activeKey: WeeklyMoverSortKey;
  direction: SortDirection;
  onSort: (key: WeeklyMoverSortKey) => void;
  className?: string;
  title?: string;
  sticky?: boolean;
};

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) {
    return <span className="ml-1 text-[10px] text-zinc-400">↕</span>;
  }
  return (
    <span className="ml-1 text-[10px] font-bold text-violet-700" aria-hidden>
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function WeeklyMoverSortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = "",
  title,
  sticky = false,
}: WeeklyMoverSortHeaderProps) {
  const isActive = activeKey === sortKey;
  const stickyClass = sticky
    ? "sticky left-0 z-30 border-r border-zinc-200/80 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)]"
    : "";

  return (
    <th
      className={`border-b border-zinc-200/80 bg-zinc-100 px-3 py-2 ${stickyClass} ${className}`}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title}
        className={`inline-flex items-center gap-0.5 text-left font-medium transition hover:text-violet-800 ${
          isActive ? "text-violet-800" : "text-zinc-900"
        }`}
      >
        {label}
        <SortIndicator active={isActive} direction={direction} />
      </button>
    </th>
  );
}

export function useWeeklyMoverSortState(
  defaultKey: WeeklyMoverSortKey = "periodChangePct",
  defaultDirection?: SortDirection,
) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    defaultDirection ?? defaultSortDirection(defaultKey),
  );

  const toggleSort = (key: WeeklyMoverSortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(defaultSortDirection(key));
  };

  return { sortKey, sortDirection, toggleSort };
}

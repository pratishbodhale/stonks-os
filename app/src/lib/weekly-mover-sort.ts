import type { WeeklyMoverRow } from "@/lib/types";

export type WeeklyMoverSortKey =
  | "symbol"
  | "industry"
  | "periodChangePct"
  | "dayChangePct"
  | "currentPrice"
  | "periodHigh"
  | "periodLow"
  | "volumeChangePct"
  | "volSpikeToday"
  | "pe";

export type SortDirection = "asc" | "desc";

export function defaultSortDirection(key: WeeklyMoverSortKey): SortDirection {
  return key === "symbol" || key === "industry" ? "asc" : "desc";
}

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return direction === "asc" ? a - b : b - a;
}

function compareStrings(a: string, b: string, direction: SortDirection): number {
  const result = a.localeCompare(b, undefined, { sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

export function sortWeeklyMoverRows(
  rows: WeeklyMoverRow[],
  key: WeeklyMoverSortKey,
  direction: SortDirection,
): WeeklyMoverRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (key) {
      case "symbol":
        return compareStrings(a.symbol, b.symbol, direction);
      case "industry":
        return compareStrings(a.industry ?? "", b.industry ?? "", direction);
      case "periodChangePct":
        return direction === "asc"
          ? a.periodChangePct - b.periodChangePct
          : b.periodChangePct - a.periodChangePct;
      case "dayChangePct":
        return direction === "asc" ? a.dayChangePct - b.dayChangePct : b.dayChangePct - a.dayChangePct;
      case "currentPrice":
        return direction === "asc" ? a.currentPrice - b.currentPrice : b.currentPrice - a.currentPrice;
      case "periodHigh":
        return direction === "asc" ? a.periodHigh - b.periodHigh : b.periodHigh - a.periodHigh;
      case "periodLow":
        return direction === "asc" ? a.periodLow - b.periodLow : b.periodLow - a.periodLow;
      case "volumeChangePct":
        return compareNullableNumbers(a.volumeChangePct, b.volumeChangePct, direction);
      case "volSpikeToday":
        return direction === "asc"
          ? a.volSpikeToday - b.volSpikeToday
          : b.volSpikeToday - a.volSpikeToday;
      case "pe":
        return compareNullableNumbers(a.pe, b.pe, direction);
      default:
        return 0;
    }
  });
  return sorted;
}

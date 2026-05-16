import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import "./App.css";

export type Position = {
  tradingsymbol: string;
  fund: string | null;
  folio: string | null;
  quantity: number | null;
  average_price: number | null;
  last_price: number | null;
  pledged_quantity: number | null;
  pnl: number | null;
  profit_pct?: number | null;
  invested_value: number;
  current_value: number;
  expense_ratio?: number | null;
};

export type Snapshot = {
  id: number;
  created_at: string;
  source: string;
  positions: Position[];
  total_invested: number;
  total_current: number;
  total_pnl: number;
};

/** Row from GET /api/mf/snapshots (summary only, no positions). */
export type SnapshotListItem = {
  id: number;
  created_at: string;
  source: string;
  total_invested: number;
  total_current: number;
  total_pnl: number;
};

export type MfapiDetails = {
  source: string;
  isin: string;
  fund_name_query: string;
  scheme_code: number;
  meta: {
    fund_house?: string;
    scheme_type?: string;
    scheme_category?: string;
    scheme_code?: number;
    scheme_name?: string;
    isin_growth?: string | null;
    isin_div_reinvestment?: string | null;
  };
  latest_nav: number | null;
  latest_nav_date: string | null;
  nav_points_used: number;
  history_start: string;
  history_end: string;
  return_1y_total_pct: number | null;
  return_1y_cagr_pct: number | null;
  return_3y_cagr_pct: number | null;
  return_5y_cagr_pct: number | null;
  disclaimer: string;
  cached?: boolean;
};

export type CaptnemoBlock = {
  name?: string | null;
  code?: string | null;
  fund_house?: string | null;
  fund_name?: string | null;
  fund_category?: string | null;
  category?: string | null;
  expense_ratio_pct?: number | null;
  expense_ratio_date?: string | null;
  aum_crore_est?: number | null;
  return_1y_pct?: number | null;
  return_3y_pct?: number | null;
  return_5y_pct?: number | null;
  return_inception_pct?: number | null;
  returns_as_of?: string | null;
  nav?: number | null;
  nav_date?: string | null;
  volatility?: number | null;
  detail_info?: string | null;
  isin: string;
  fund_name_query: string;
};

export type FundDetailsResponse = {
  primary_source: "captnemo" | "mfapi.in";
  fallback_used: boolean;
  cached?: boolean;
  isin: string;
  fund_name_query: string;
  captnemo: CaptnemoBlock | null;
  mfapi: MfapiDetails | null;
  disclaimer: string;
};

export type CompareRow = {
  isin: string;
  fund_name: string;
  weight_pct: number | null;
  invested_value: number | null;
  current_value: number | null;
  expense_ratio_snapshot: number | null;
  primary_source: string | null;
  fallback_used: boolean | null;
  cached_detail: boolean | null;
  ter_pct: number | null;
  aum_crore_est: number | null;
  category: string | null;
  amc: string | null;
  return_1y_pct: number | null;
  return_3y_pct: number | null;
  return_5y_pct: number | null;
  nav: number | null;
  nav_date: string | null;
  error: string | null;
};

export type CompareResponse = {
  rows: CompareRow[];
  as_of: string;
  cache_ttl_seconds: number;
};

export type StockOverlapContribution = {
  fund_name: string;
  isin: string;
  weight_in_fund_pct: number;
  contribution_pct: number;
};

export type StockOverlapAggRow = {
  name: string;
  sector: string | null;
  effective_portfolio_pct: number;
  contributions: StockOverlapContribution[];
};

export type StockOverlapFundRow = {
  isin: string;
  fund_name: string;
  scheme_code: number | null;
  family_id: number | null;
  user_weight_pct: number;
  current_value: number;
  equities_loaded: number;
  holdings_month: string | null;
  error: string | null;
};

export type StockOverlapResponse = {
  source: string;
  base_url: string;
  holdings_month: string | null;
  total_current: number;
  funds_analyzed: number;
  funds: StockOverlapFundRow[];
  aggregated_equity: StockOverlapAggRow[];
  disclaimer: string;
};

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(digits)}%`;
}

/** Format API ISO timestamps for on-screen display (uses the browser locale). */
function formatDateTimeDisplay(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Local datetime for filenames (avoids `:` which is invalid on some OS). */
function portfolioCsvFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `mf_portfolio_${dt}.csv`;
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "number" && Number.isFinite(value) ? String(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildPortfolioCsv(snapshot: Snapshot, positions: Position[]): string {
  const totalCur = snapshot.total_current;
  const header = [
    "snapshot_id",
    "snapshot_created_at",
    "snapshot_source",
    "isin",
    "fund",
    "folio",
    "quantity",
    "average_price",
    "last_price",
    "pledged_quantity",
    "invested_value",
    "current_value",
    "pnl",
    "profit_pct",
    "expense_ratio_pct",
    "weight_pct_portfolio",
  ];
  const lines = [header.join(",")];
  for (const p of positions) {
    const w = totalCur > 0 ? (p.current_value / totalCur) * 100 : 0;
    const rowPnl = p.pnl ?? p.current_value - p.invested_value;
    const pPct =
      p.profit_pct ??
      (p.invested_value > 0 ? ((p.current_value / p.invested_value) - 1) * 100 : null);
    lines.push(
      [
        snapshot.id,
        snapshot.created_at,
        snapshot.source,
        p.tradingsymbol,
        p.fund ?? "",
        p.folio ?? "",
        p.quantity ?? "",
        p.average_price ?? "",
        p.last_price ?? "",
        p.pledged_quantity ?? "",
        p.invested_value,
        p.current_value,
        rowPnl,
        pPct ?? "",
        p.expense_ratio ?? "",
        w,
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }
  return lines.join("\n");
}

function downloadPortfolioCsv(snapshot: Snapshot, positions: Position[]) {
  const csv = buildPortfolioCsv(snapshot, positions);
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = portfolioCsvFilename();
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MAX_PIE_SLICES = 12;

const COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#06b6d4",
  "#a855f7",
];

function buildPieData(positions: Position[], totalCurrent: number) {
  const rows = positions
    .map((p) => ({
      name: (p.fund || p.tradingsymbol).slice(0, 48),
      value: p.current_value,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  if (rows.length <= MAX_PIE_SLICES) {
    return rows.map((r) => ({
      ...r,
      pct: totalCurrent > 0 ? (r.value / totalCurrent) * 100 : 0,
    }));
  }

  const top = rows.slice(0, MAX_PIE_SLICES - 1);
  const rest = rows.slice(MAX_PIE_SLICES - 1);
  const otherVal = rest.reduce((s, r) => s + r.value, 0);
  const withOther = [...top, { name: "Other", value: otherVal }];
  return withOther.map((r) => ({
    ...r,
    pct: totalCurrent > 0 ? (r.value / totalCurrent) * 100 : 0,
  }));
}

type SortKey =
  | "fund"
  | "invested_value"
  | "current_value"
  | "pnl"
  | "profit_pct"
  | "expense_ratio"
  | "weight";

function sortPositions(
  positions: Position[],
  totalCurrent: number,
  key: SortKey,
  asc: boolean,
): Position[] {
  const mult = asc ? 1 : -1;
  const weight = (p: Position) =>
    totalCurrent > 0 ? (p.current_value / totalCurrent) * 100 : 0;

  const profitPct = (p: Position) =>
    p.profit_pct ??
    (p.invested_value > 0
      ? ((p.current_value / p.invested_value) - 1) * 100
      : null);

  const ter = (p: Position) => p.expense_ratio ?? null;

  return [...positions].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "fund":
        cmp = (a.fund || a.tradingsymbol).localeCompare(b.fund || b.tradingsymbol);
        break;
      case "invested_value":
        cmp = a.invested_value - b.invested_value;
        break;
      case "current_value":
        cmp = a.current_value - b.current_value;
        break;
      case "pnl":
        cmp =
          a.current_value -
          a.invested_value -
          (b.current_value - b.invested_value);
        break;
      case "profit_pct": {
        const pa = profitPct(a) ?? -Infinity;
        const pb = profitPct(b) ?? -Infinity;
        cmp = pa - pb;
        break;
      }
      case "expense_ratio": {
        const ea = ter(a) ?? -Infinity;
        const eb = ter(b) ?? -Infinity;
        cmp = ea - eb;
        break;
      }
      case "weight":
        cmp = weight(a) - weight(b);
        break;
      default:
        break;
    }
    return mult * cmp;
  });
}

function posKey(p: Position, index: number): string {
  return `${index}:${p.tradingsymbol}:${p.folio ?? ""}`;
}

type CompareSortKey =
  | "fund"
  | "isin"
  | "weight_pct"
  | "invested_value"
  | "current_value"
  | "expense_ratio_snapshot"
  | "ter_pct"
  | "aum_crore_est"
  | "return_1y_pct"
  | "return_3y_pct"
  | "return_5y_pct"
  | "category"
  | "amc"
  | "primary_source"
  | "fallback_used"
  | "cached_detail"
  | "nav"
  | "error";

function numRank(
  a: number | null | undefined,
  b: number | null | undefined,
  asc: boolean,
): number {
  const am = a === null || a === undefined;
  const bm = b === null || b === undefined;
  if (am && bm) return 0;
  if (am) return 1;
  if (bm) return -1;
  const d = a - b;
  return asc ? d : -d;
}

function strRank(
  a: string | null | undefined,
  b: string | null | undefined,
  asc: boolean,
): number {
  const as = (a ?? "").trim();
  const bs = (b ?? "").trim();
  const am = !as;
  const bm = !bs;
  if (am && bm) return 0;
  if (am) return 1;
  if (bm) return -1;
  const d = as.localeCompare(bs);
  return asc ? d : -d;
}

function boolRank(
  a: boolean | null | undefined,
  b: boolean | null | undefined,
  asc: boolean,
): number {
  const av = a === true ? 1 : 0;
  const bv = b === true ? 1 : 0;
  return asc ? av - bv : bv - av;
}

function sortCompareRows(
  rows: CompareRow[],
  key: CompareSortKey,
  asc: boolean,
): CompareRow[] {
  return [...rows].sort((a, b) => {
    switch (key) {
      case "fund":
        return strRank(a.fund_name, b.fund_name, asc);
      case "isin":
        return strRank(a.isin, b.isin, asc);
      case "weight_pct":
        return numRank(a.weight_pct, b.weight_pct, asc);
      case "invested_value":
        return numRank(a.invested_value, b.invested_value, asc);
      case "current_value":
        return numRank(a.current_value, b.current_value, asc);
      case "expense_ratio_snapshot":
        return numRank(a.expense_ratio_snapshot, b.expense_ratio_snapshot, asc);
      case "ter_pct":
        return numRank(a.ter_pct, b.ter_pct, asc);
      case "aum_crore_est":
        return numRank(a.aum_crore_est, b.aum_crore_est, asc);
      case "return_1y_pct":
        return numRank(a.return_1y_pct, b.return_1y_pct, asc);
      case "return_3y_pct":
        return numRank(a.return_3y_pct, b.return_3y_pct, asc);
      case "return_5y_pct":
        return numRank(a.return_5y_pct, b.return_5y_pct, asc);
      case "category":
        return strRank(a.category, b.category, asc);
      case "amc":
        return strRank(a.amc, b.amc, asc);
      case "primary_source":
        return strRank(a.primary_source, b.primary_source, asc);
      case "fallback_used":
        return boolRank(a.fallback_used, b.fallback_used, asc);
      case "cached_detail":
        return boolRank(a.cached_detail, b.cached_detail, asc);
      case "nav":
        return numRank(a.nav, b.nav, asc);
      case "error":
        return strRank(a.error, b.error, asc);
      default:
        return 0;
    }
  });
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotsList, setSnapshotsList] = useState<SnapshotListItem[]>([]);
  const [pendingSnapshotId, setPendingSnapshotId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotSwitching, setSnapshotSwitching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("current_value");
  const [sortAsc, setSortAsc] = useState(false);

  const [mainTab, setMainTab] = useState<"portfolio" | "compare">("portfolio");
  const [compareSelected, setCompareSelected] = useState<Set<string>>(() => new Set());
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareErr, setCompareErr] = useState<string | null>(null);
  const [compareSortKey, setCompareSortKey] = useState<CompareSortKey>("weight_pct");
  const [compareSortAsc, setCompareSortAsc] = useState(false);

  const [stockOverlap, setStockOverlap] = useState<StockOverlapResponse | null>(null);
  const [stockOverlapLoading, setStockOverlapLoading] = useState(false);
  const [stockOverlapErr, setStockOverlapErr] = useState<string | null>(null);

  const [detailRow, setDetailRow] = useState<Position | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detailFund, setDetailFund] = useState<FundDetailsResponse | null>(null);

  const closeDetail = useCallback(() => {
    setDetailRow(null);
    setDetailFund(null);
    setDetailErr(null);
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    setStockOverlap(null);
    setStockOverlapErr(null);
  }, [snapshot?.id]);

  useEffect(() => {
    if (!detailRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailRow, closeDetail]);

  const loadFundDetails = useCallback(async (p: Position, refresh: boolean) => {
    const name = (p.fund || p.tradingsymbol).trim();
    if (!name) {
      setDetailErr("Missing fund name (needed if MFapi.in fallback is used).");
      return;
    }
    setDetailLoading(true);
    setDetailErr(null);
    if (refresh) setDetailFund(null);
    try {
      const qs = new URLSearchParams({
        isin: p.tradingsymbol,
        fund_name: name,
      });
      if (refresh) qs.set("refresh", "true");
      const res = await fetch(`/api/mf/mfapi-details?${qs}`);
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = { detail: text };
      }
      if (!res.ok) {
        const d = (body as { detail?: string }).detail;
        throw new Error(typeof d === "string" ? d : text);
      }
      setDetailFund(body as FundDetailsResponse);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetail = (p: Position) => {
    setDetailRow(p);
    setDetailFund(null);
    setDetailErr(null);
    void loadFundDetails(p, false);
  };

  const loadSnapshotDetail = useCallback(async (id: number) => {
    const res = await fetch(`/api/mf/snapshots/${id}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data: Snapshot = await res.json();
    setSnapshot(data);
  }, []);

  const loadSnapshotsList = useCallback(async () => {
    const res = await fetch("/api/mf/snapshots?limit=100");
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const list: SnapshotListItem[] = await res.json();
    setSnapshotsList(list);
    return list;
  }, []);

  const loadInitial = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await loadSnapshotsList();
      if (list.length === 0) {
        setSnapshot(null);
        return;
      }
      await loadSnapshotDetail(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load snapshots");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [loadSnapshotsList, loadSnapshotDetail]);

  const refreshFromDb = useCallback(async () => {
    setError(null);
    setLoading(true);
    const previousId = snapshot?.id;
    try {
      const list = await loadSnapshotsList();
      if (list.length === 0) {
        setSnapshot(null);
        return;
      }
      const targetId =
        previousId !== undefined && list.some((s) => s.id === previousId)
          ? previousId
          : list[0].id;
      await loadSnapshotDetail(targetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reload from DB");
    } finally {
      setLoading(false);
    }
  }, [snapshot?.id, loadSnapshotsList, loadSnapshotDetail]);

  const selectSnapshot = useCallback(
    async (id: number) => {
      if (snapshot?.id === id) return;
      setPendingSnapshotId(id);
      setSnapshotSwitching(true);
      setCompareSelected(new Set());
      setCompareResult(null);
      setCompareErr(null);
      closeDetail();
      setError(null);
      try {
        await loadSnapshotDetail(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load snapshot");
      } finally {
        setPendingSnapshotId(null);
        setSnapshotSwitching(false);
      }
    },
    [snapshot?.id, loadSnapshotDetail, closeDetail],
  );

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const createSnapshot = async () => {
    setError(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/mf/snapshot", { method: "POST" });
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text) as { detail?: string | { msg: string }[] };
      } catch {
        body = { detail: text };
      }
      if (!res.ok) {
        const detail = (body as { detail?: unknown }).detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d) => ("msg" in d ? d.msg : JSON.stringify(d))).join("; ")
              : text;
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const newSnap = body as Snapshot;
      setSnapshot(newSnap);
      try {
        await loadSnapshotsList();
      } catch {
        /* ignore list refresh errors */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setSyncing(false);
    }
  };

  const pieData = useMemo(
    () =>
      snapshot
        ? buildPieData(snapshot.positions, snapshot.total_current)
        : [],
    [snapshot],
  );

  const sortedRows = useMemo(() => {
    if (!snapshot) return [];
    return sortPositions(
      snapshot.positions,
      snapshot.total_current,
      sortKey,
      sortAsc,
    );
  }, [snapshot, sortKey, sortAsc]);

  const sortedCompareRows = useMemo(() => {
    if (!compareResult?.rows.length) return [];
    return sortCompareRows(compareResult.rows, compareSortKey, compareSortAsc);
  }, [compareResult, compareSortKey, compareSortAsc]);

  const loadStockOverlap = useCallback(async () => {
    if (!snapshot) return;
    setStockOverlapErr(null);
    setStockOverlapLoading(true);
    try {
      const positions = snapshot.positions.map((p) => ({
        tradingsymbol: p.tradingsymbol,
        fund: p.fund,
        current_value: p.current_value,
      }));
      const res = await fetch("/api/mf/portfolio-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions,
          total_current: snapshot.total_current,
        }),
      });
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = { detail: text };
      }
      if (!res.ok) {
        const d = (body as { detail?: string }).detail;
        throw new Error(typeof d === "string" ? d : text);
      }
      setStockOverlap(body as StockOverlapResponse);
    } catch (e) {
      setStockOverlap(null);
      setStockOverlapErr(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setStockOverlapLoading(false);
    }
  }, [snapshot]);

  const runCompare = useCallback(
    async (refresh: boolean) => {
      if (!snapshot) return;
      const entries = snapshot.positions
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => compareSelected.has(posKey(p, i)));
      if (!entries.length) {
        setCompareErr("Select at least one fund.");
        return;
      }
      setCompareErr(null);
      setCompareLoading(true);
      try {
        const total = snapshot.total_current;
        const holdings = entries.map(({ p }) => ({
          isin: p.tradingsymbol,
          fund_name: (p.fund || p.tradingsymbol).trim() || p.tradingsymbol,
          weight_pct: total > 0 ? (p.current_value / total) * 100 : 0,
          invested_value: p.invested_value,
          current_value: p.current_value,
          expense_ratio_snapshot:
            p.expense_ratio === undefined ? null : p.expense_ratio,
        }));
        const res = await fetch("/api/mf/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings, refresh }),
        });
        const text = await res.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = { detail: text };
        }
        if (!res.ok) {
          const d = (body as { detail?: string }).detail;
          throw new Error(typeof d === "string" ? d : text);
        }
        setCompareResult(body as CompareResponse);
      } catch (e) {
        setCompareErr(e instanceof Error ? e.message : "Compare failed");
      } finally {
        setCompareLoading(false);
      }
    },
    [snapshot, compareSelected],
  );

  const toggleCompareSort = (key: CompareSortKey) => {
    if (compareSortKey === key) setCompareSortAsc(!compareSortAsc);
    else {
      setCompareSortKey(key);
      setCompareSortAsc(
        key === "fund" ||
          key === "isin" ||
          key === "category" ||
          key === "amc" ||
          key === "error",
      );
    }
  };

  const cth = (key: CompareSortKey, label: string) => (
    <th
      className="sortable"
      onClick={() => toggleCompareSort(key)}
      title="Click to sort"
    >
      {label}
      {compareSortKey === key ? (compareSortAsc ? " \u2191" : " \u2193") : ""}
    </th>
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === "fund");
    }
  };

  const th = (key: SortKey, label: string) => (
    <th
      className="sortable"
      onClick={() => toggleSort(key)}
      title="Click to sort"
    >
      {label}
      {sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : ""}
    </th>
  );

  const retPct =
    snapshot && snapshot.total_invested > 0
      ? ((snapshot.total_current - snapshot.total_invested) /
          snapshot.total_invested) *
        100
      : null;

  return (
    <div className="app app-root">
      <header className="app-header">
        <div>
          <h1>Mutual fund holdings</h1>
          {snapshotsList.length > 0 && snapshot && (
            <div className="snapshot-picker">
              <label htmlFor="snapshot-select" className="snapshot-picker-label">
                Snapshot
              </label>
              <select
                id="snapshot-select"
                className="snapshot-select"
                value={pendingSnapshotId ?? snapshot?.id ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) void selectSnapshot(v);
                }}
                disabled={snapshotSwitching}
                aria-label="Choose snapshot version"
              >
                {snapshotsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {formatDateTimeDisplay(s.created_at)} · {s.source} ·
                    current {inr.format(s.total_current)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {snapshot && (
            <p className="meta snapshot-meta">
              Viewing #{snapshot.id} · {snapshot.positions.length} funds ·{" "}
              {formatDateTimeDisplay(snapshot.created_at)}
            </p>
          )}
        </div>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void refreshFromDb()}
            disabled={loading || syncing || snapshotSwitching}
          >
            Reload from DB
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void createSnapshot()}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Create snapshot from Kite"}
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {loading && <p className="meta">Loading…</p>}

      {!loading && !snapshot && (
        <div className="empty">
          <p>No snapshot stored yet.</p>
          <p>Use <strong>Create snapshot from Kite</strong> after logging in with{" "}
          <code style={{ fontSize: "0.85em" }}>python kite.py</code> from the repo root.
          </p>
        </div>
      )}

      {snapshot && (
        <>
          <nav className="main-tabs" aria-label="Main views">
            <button
              type="button"
              className={mainTab === "portfolio" ? "tab tab-active" : "tab"}
              onClick={() => setMainTab("portfolio")}
            >
              Portfolio
            </button>
            <button
              type="button"
              className={mainTab === "compare" ? "tab tab-active" : "tab"}
              onClick={() => setMainTab("compare")}
            >
              Compare
            </button>
          </nav>
          {mainTab === "portfolio" && (
            <>
          <section className="summary">
            <div className="summary-card">
              <label>Invested</label>
              <div className="value">{inr.format(snapshot.total_invested)}</div>
            </div>
            <div className="summary-card">
              <label>Current value</label>
              <div className="value">{inr.format(snapshot.total_current)}</div>
            </div>
            <div className="summary-card">
              <label>P&L</label>
              <div
                className={`value ${
                  snapshot.total_pnl >= 0 ? "positive" : "negative"
                }`}
              >
                {inr.format(snapshot.total_pnl)}
              </div>
            </div>
            {retPct !== null && (
              <div className="summary-card">
                <label>Return</label>
                <div
                  className={`value ${
                    retPct >= 0 ? "positive" : "negative"
                  }`}
                >
                  {retPct.toFixed(2)}%
                </div>
              </div>
            )}
          </section>

          <div className="layout-stack">
            <div className="panel">
              <h2>Distribution (by current value)</h2>
              <p className="meta chart-hint">
                Hover a slice for fund name, amount, and share of portfolio.
              </p>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="42%"
                      outerRadius="78%"
                      paddingAngle={1}
                    >
                      {pieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={COLORS[i % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const item = payload[0].payload as {
                          name: string;
                          value: number;
                          pct: number;
                        };
                        return (
                          <div className="pie-tooltip">
                            <div className="pie-tooltip-name">{item.name}</div>
                            <div className="pie-tooltip-row">
                              <span>Value</span>
                              <span>{inr.format(item.value)}</span>
                            </div>
                            <div className="pie-tooltip-row">
                              <span>Share</span>
                              <span>{item.pct.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading-row">
                <h2>Holdings ({snapshot.positions.length})</h2>
                <button
                  type="button"
                  className="secondary portfolio-csv-btn"
                  onClick={() => downloadPortfolioCsv(snapshot, sortedRows)}
                >
                  Download CSV
                </button>
              </div>
              <p className="meta table-hint">
                Click a row for fund details: primary{" "}
                <a href="https://mf.captnemo.in/">mf.captnemo.in</a> (Kuvera), with{" "}
                <a href="https://mfapi.in/">MFapi.in</a> as fallback.
              </p>
              <div className="panel-table">
                <table className="holdings-table">
                  <thead>
                    <tr>
                      {th("fund", "Fund")}
                      {th("invested_value", "Invested")}
                      {th("current_value", "Current")}
                      {th("pnl", "P&L")}
                      {th("profit_pct", "P&L %")}
                      {th("expense_ratio", "Expense % p.a.")}
                      {th("weight", "% portfolio")}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((p) => {
                      const w =
                        snapshot.total_current > 0
                          ? (p.current_value / snapshot.total_current) * 100
                          : 0;
                      const rowPnl =
                        p.pnl ??
                        p.current_value - p.invested_value;
                      const pPct =
                        p.profit_pct ??
                        (p.invested_value > 0
                          ? ((p.current_value / p.invested_value) - 1) * 100
                          : null);
                      return (
                        <tr
                          key={`${p.tradingsymbol}-${p.folio ?? ""}`}
                          className="row-clickable"
                          onClick={() => openDetail(p)}
                        >
                          <td className="fund-name">
                            {p.fund || p.tradingsymbol}
                          </td>
                          <td className="num">{inr.format(p.invested_value)}</td>
                          <td className="num">{inr.format(p.current_value)}</td>
                          <td
                            className={`num pnl-cell ${
                              rowPnl >= 0 ? "positive" : "negative"
                            }`}
                          >
                            {inr.format(rowPnl)}
                          </td>
                          <td
                            className={`num ${
                              pPct === null
                                ? ""
                                : pPct >= 0
                                  ? "positive"
                                  : "negative"
                            }`}
                          >
                            {pPct === null ? "—" : `${pPct.toFixed(2)}%`}
                          </td>
                          <td className="num">
                            {p.expense_ratio === null || p.expense_ratio === undefined
                              ? "—"
                              : `${p.expense_ratio.toFixed(2)}%`}
                          </td>
                          <td className="num">{w.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel overlap-panel">
            <h2>Underlying equities & overlap</h2>
            <p className="meta table-hint">
              Resolve each scheme via{" "}
              <a href="https://mfdata.in/docs" target="_blank" rel="noreferrer">
                mfdata.in
              </a>{" "}
              (monthly disclosed equity weights), then combine with your allocation to show
              synthetic exposure. Analyzes your largest positions first (see{" "}
              <code className="inline-code">HOLDINGS_STOCK_OVERLAP_MAX_FUNDS</code> on the
              server). Can take a minute and may time out if the upstream API is slow.
            </p>
            <div className="overlap-toolbar">
              <button
                type="button"
                className="primary"
                disabled={stockOverlapLoading}
                onClick={() => void loadStockOverlap()}
              >
                {stockOverlapLoading ? "Analyzing…" : "Run equity overlap analysis"}
              </button>
            </div>
            {stockOverlapErr && (
              <div className="error overlap-error">{stockOverlapErr}</div>
            )}
            {stockOverlap && (
              <>
                <p className="meta overlap-meta">
                  Data: {stockOverlap.source} ·{" "}
                  <a href={stockOverlap.base_url} target="_blank" rel="noreferrer">
                    {stockOverlap.base_url}
                  </a>
                  {stockOverlap.holdings_month
                    ? ` · holdings month ${stockOverlap.holdings_month}`
                    : ""}{" "}
                  · funds processed {stockOverlap.funds_analyzed}
                </p>
                <h3 className="overlap-subh">Per-fund fetch</h3>
                <div className="panel-table overlap-mini-table">
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>Fund</th>
                        <th>ISIN</th>
                        <th className="num">Your %</th>
                        <th className="num">Equities</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockOverlap.funds.map((f, i) => (
                        <tr key={`${f.isin}-${i}`}>
                          <td className="fund-name">{f.fund_name}</td>
                          <td className="mono">{f.isin}</td>
                          <td className="num">{f.user_weight_pct.toFixed(2)}%</td>
                          <td className="num">{f.equities_loaded}</td>
                          <td className={f.error ? "overlap-status-err" : ""}>
                            {f.error ?? (f.family_id ? `family ${f.family_id}` : "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="overlap-subh">Aggregated synthetic weights</h3>
                <p className="meta table-hint">
                  <strong>Synthetic % of your portfolio</strong> ≈ sum over funds of (your
                  % in that fund × the stock&apos;s weight inside that fund). Same stock held
                  by multiple funds appears once with combined %.
                </p>
                <div className="panel-table">
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>Stock / instrument</th>
                        <th>Sector</th>
                        <th className="num">Synthetic %</th>
                        <th>From your funds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockOverlap.aggregated_equity.map((r) => (
                        <tr key={r.name}>
                          <td className="fund-name">{r.name}</td>
                          <td>{r.sector ?? "—"}</td>
                          <td className="num">{r.effective_portfolio_pct.toFixed(2)}%</td>
                          <td className="overlap-sources">
                            {r.contributions
                              .map(
                                (c) =>
                                  `${c.fund_name.slice(0, 28)}${
                                    c.fund_name.length > 28 ? "…" : ""
                                  } (${c.weight_in_fund_pct.toFixed(1)}% in fund → ${c.contribution_pct.toFixed(2)}%)`,
                              )
                              .join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {stockOverlap.aggregated_equity.length === 0 && (
                  <p className="meta">No equity rows returned (debt-only funds or API gaps).</p>
                )}
                <p className="meta overlap-disclaimer">{stockOverlap.disclaimer}</p>
              </>
            )}
          </div>

            </>
          )}
          {mainTab === "compare" && (
            <div className="compare-layout">
              <div className="panel compare-selector-panel">
                <h2>Compare funds</h2>
                <p className="meta table-hint">
                  Tick the schemes to compare. The server reuses cached market data for up
                  to one day (see TTL below); <strong>Force refresh</strong> bypasses cache
                  and refetches.
                </p>
                <div className="compare-toolbar">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setCompareSelected(
                        new Set(
                          snapshot.positions.map((p, i) => posKey(p, i)),
                        ),
                      );
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCompareSelected(new Set())}
                  >
                    Clear
                  </button>
                  <span className="meta compare-count">
                    {compareSelected.size} selected
                  </span>
                  <button
                    type="button"
                    className="primary"
                    disabled={compareLoading}
                    onClick={() => void runCompare(false)}
                  >
                    {compareLoading ? "Loading…" : "Load comparison"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={compareLoading}
                    onClick={() => void runCompare(true)}
                  >
                    Force refresh
                  </button>
                </div>
                {compareErr && (
                  <div className="error compare-error">{compareErr}</div>
                )}
                <ul className="compare-fund-list">
                  {snapshot.positions.map((p, i) => {
                    const k = posKey(p, i);
                    const checked = compareSelected.has(k);
                    const w =
                      snapshot.total_current > 0
                        ? (p.current_value / snapshot.total_current) * 100
                        : 0;
                    return (
                      <li key={k}>
                        <label className="compare-fund-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCompareSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(k);
                                else next.delete(k);
                                return next;
                              });
                            }}
                          />
                          <span className="compare-fund-name">
                            {p.fund || p.tradingsymbol}
                          </span>
                          <span className="meta compare-fund-w">
                            {w.toFixed(1)}% portf.
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {compareResult && (
                <div className="panel compare-table-panel">
                  <h2>Comparison table</h2>
                  <p className="meta table-hint">
                    As of {formatDateTimeDisplay(compareResult.as_of)} · server cache TTL{" "}
                    {compareResult.cache_ttl_seconds}s (max 1 day)
                  </p>
                  <div className="panel-table compare-table-scroll">
                    <table className="compare-table">
                      <thead>
                        <tr>
                          {cth("fund", "Fund")}
                          {cth("isin", "ISIN")}
                          {cth("weight_pct", "% portf.")}
                          {cth("invested_value", "Invested")}
                          {cth("current_value", "Current")}
                          {cth("expense_ratio_snapshot", "TER snap.")}
                          {cth("ter_pct", "TER mkt.")}
                          {cth("aum_crore_est", "AUM ₹ Cr (est.)")}
                          {cth("return_1y_pct", "1Y %")}
                          {cth("return_3y_pct", "3Y %")}
                          {cth("return_5y_pct", "5Y %")}
                          {cth("category", "Category")}
                          {cth("amc", "AMC")}
                          {cth("primary_source", "Source")}
                          {cth("fallback_used", "Fallback")}
                          {cth("cached_detail", "Cached")}
                          {cth("nav", "NAV")}
                          {cth("error", "Error")}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCompareRows.map((r, ri) => (
                          <tr key={`${r.isin}-${ri}-${r.fund_name}`}>
                            <td className="fund-name compare-fund-cell">
                              {r.fund_name || "—"}
                            </td>
                            <td className="mono">{r.isin}</td>
                            <td className="num">
                              {r.weight_pct === null || r.weight_pct === undefined
                                ? "—"
                                : `${r.weight_pct.toFixed(2)}%`}
                            </td>
                            <td className="num">
                              {r.invested_value === null ||
                              r.invested_value === undefined
                                ? "—"
                                : inr.format(r.invested_value)}
                            </td>
                            <td className="num">
                              {r.current_value === null ||
                              r.current_value === undefined
                                ? "—"
                                : inr.format(r.current_value)}
                            </td>
                            <td className="num">
                              {r.expense_ratio_snapshot === null ||
                              r.expense_ratio_snapshot === undefined
                                ? "—"
                                : `${r.expense_ratio_snapshot.toFixed(2)}%`}
                            </td>
                            <td className="num">
                              {r.ter_pct === null || r.ter_pct === undefined
                                ? "—"
                                : `${r.ter_pct.toFixed(2)}%`}
                            </td>
                            <td className="num">
                              {r.aum_crore_est === null ||
                              r.aum_crore_est === undefined
                                ? "—"
                                : r.aum_crore_est.toLocaleString("en-IN", {
                                    maximumFractionDigits: 2,
                                  })}
                            </td>
                            <td className="num">{fmtPct(r.return_1y_pct)}</td>
                            <td className="num">{fmtPct(r.return_3y_pct)}</td>
                            <td className="num">{fmtPct(r.return_5y_pct)}</td>
                            <td>{r.category ?? "—"}</td>
                            <td>{r.amc ?? "—"}</td>
                            <td>
                              {r.primary_source === "captnemo"
                                ? "Captnemo"
                                : r.primary_source === "mfapi.in"
                                  ? "MFapi"
                                  : r.primary_source ?? "—"}
                            </td>
                            <td className="num">
                              {r.fallback_used === null
                                ? "—"
                                : r.fallback_used
                                  ? "Yes"
                                  : "No"}
                            </td>
                            <td className="num">
                              {r.cached_detail === null
                                ? "—"
                                : r.cached_detail
                                  ? "Yes"
                                  : "No"}
                            </td>
                            <td className="num">
                              {r.nav === null || r.nav === undefined
                                ? "—"
                                : `${r.nav.toFixed(4)}${r.nav_date ? ` (${formatDateTimeDisplay(r.nav_date)})` : ""}`}
                            </td>
                            <td className="compare-err-cell">
                              {r.error ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {detailRow && (
        <div
          className="detail-backdrop"
          role="presentation"
          onClick={closeDetail}
        >
          <div
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fund-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="detail-modal-header">
              <h2 id="fund-detail-title">Fund details</h2>
              <button
                type="button"
                className="detail-close"
                onClick={closeDetail}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="meta detail-sub">
              {detailRow.fund || detailRow.tradingsymbol}
              <br />
              <span className="detail-isin">{detailRow.tradingsymbol}</span>
            </p>

            <section className="detail-section">
              <h3>Your snapshot</h3>
              <dl className="detail-dl">
                <div>
                  <dt>Invested</dt>
                  <dd>{inr.format(detailRow.invested_value)}</dd>
                </div>
                <div>
                  <dt>Current</dt>
                  <dd>{inr.format(detailRow.current_value)}</dd>
                </div>
                <div>
                  <dt>Expense % p.a. (from snapshot)</dt>
                  <dd>
                    {detailRow.expense_ratio === null ||
                    detailRow.expense_ratio === undefined
                      ? "—"
                      : `${detailRow.expense_ratio.toFixed(2)}%`}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="detail-section">
              <h3>Market data</h3>
              {detailLoading && <p className="meta">Loading…</p>}
              {detailErr && <div className="detail-error">{detailErr}</div>}
              {detailFund && (
                <>
                  {detailFund.cached && (
                    <p className="meta cache-tag">Cached response</p>
                  )}
                  <p className="meta source-tag">
                    Source:{" "}
                    {detailFund.primary_source === "captnemo"
                      ? "mf.captnemo.in (Kuvera)"
                      : "MFapi.in"}
                    {detailFund.fallback_used ? " — fallback after Captnemo had no match" : ""}
                  </p>

                  {detailFund.captnemo && (
                    <>
                      <h4 className="detail-returns-h">Kuvera / Captnemo</h4>
                      <dl className="detail-dl">
                        <div>
                          <dt>AMC</dt>
                          <dd>{detailFund.captnemo.fund_house ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Category</dt>
                          <dd>
                            {detailFund.captnemo.fund_category ??
                              detailFund.captnemo.category ??
                              "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Expense % p.a.</dt>
                          <dd>
                            {detailFund.captnemo.expense_ratio_pct === null ||
                            detailFund.captnemo.expense_ratio_pct === undefined
                              ? "—"
                              : `${detailFund.captnemo.expense_ratio_pct.toFixed(2)}%`}
                            {detailFund.captnemo.expense_ratio_date
                              ? ` (${detailFund.captnemo.expense_ratio_date})`
                              : ""}
                          </dd>
                        </div>
                        <div>
                          <dt>AUM (est. ₹ Cr)</dt>
                          <dd>
                            {detailFund.captnemo.aum_crore_est === null ||
                            detailFund.captnemo.aum_crore_est === undefined
                              ? "—"
                              : `${detailFund.captnemo.aum_crore_est.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                          </dd>
                        </div>
                        <div>
                          <dt>Latest NAV</dt>
                          <dd>
                            {detailFund.captnemo.nav !== null &&
                            detailFund.captnemo.nav !== undefined
                              ? `${detailFund.captnemo.nav.toFixed(4)} (${detailFund.captnemo.nav_date ?? "—"})`
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                      <h4 className="detail-returns-h">Returns (Kuvera)</h4>
                      <dl className="detail-dl detail-returns">
                        <div>
                          <dt>1Y</dt>
                          <dd>{fmtPct(detailFund.captnemo.return_1y_pct)}</dd>
                        </div>
                        <div>
                          <dt>3Y</dt>
                          <dd>{fmtPct(detailFund.captnemo.return_3y_pct)}</dd>
                        </div>
                        <div>
                          <dt>5Y</dt>
                          <dd>{fmtPct(detailFund.captnemo.return_5y_pct)}</dd>
                        </div>
                        <div>
                          <dt>Since inception</dt>
                          <dd>{fmtPct(detailFund.captnemo.return_inception_pct)}</dd>
                        </div>
                      </dl>
                      {detailFund.captnemo.detail_info && (
                        <p className="meta">
                          <a
                            href={String(detailFund.captnemo.detail_info)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Scheme / SID link
                          </a>
                        </p>
                      )}
                    </>
                  )}

                  {detailFund.mfapi && (
                    <>
                      <h4 className="detail-returns-h">
                        MFapi.in{detailFund.fallback_used ? " (fallback)" : ""}
                      </h4>
                      <dl className="detail-dl">
                        <div>
                          <dt>AMC</dt>
                          <dd>{detailFund.mfapi.meta.fund_house ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Category</dt>
                          <dd>{detailFund.mfapi.meta.scheme_category ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Scheme code</dt>
                          <dd>{detailFund.mfapi.scheme_code}</dd>
                        </div>
                        <div>
                          <dt>Latest NAV</dt>
                          <dd>
                            {detailFund.mfapi.latest_nav !== null
                              ? `${detailFund.mfapi.latest_nav.toFixed(4)} (${detailFund.mfapi.latest_nav_date ?? "—"})`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>NAV points (window)</dt>
                          <dd>{detailFund.mfapi.nav_points_used}</dd>
                        </div>
                      </dl>
                      <h4 className="detail-returns-h">Returns (from NAV history)</h4>
                      <dl className="detail-dl detail-returns">
                        <div>
                          <dt>1Y total</dt>
                          <dd>{fmtPct(detailFund.mfapi.return_1y_total_pct)}</dd>
                        </div>
                        <div>
                          <dt>1Y CAGR</dt>
                          <dd>{fmtPct(detailFund.mfapi.return_1y_cagr_pct)}</dd>
                        </div>
                        <div>
                          <dt>3Y CAGR</dt>
                          <dd>{fmtPct(detailFund.mfapi.return_3y_cagr_pct)}</dd>
                        </div>
                        <div>
                          <dt>5Y CAGR</dt>
                          <dd>{fmtPct(detailFund.mfapi.return_5y_cagr_pct)}</dd>
                        </div>
                      </dl>
                    </>
                  )}

                  <p className="meta detail-disclaimer">{detailFund.disclaimer}</p>
                  <button
                    type="button"
                    className="secondary detail-refresh"
                    onClick={() => detailRow && void loadFundDetails(detailRow, true)}
                    disabled={detailLoading}
                  >
                    Refresh market data
                  </button>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

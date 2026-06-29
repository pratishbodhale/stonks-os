"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DailyScanRunButton } from "@/components/DailyScanRunButton";
import { NotificationSetup } from "@/components/NotificationSetup";
import { PerplexityMarkdown } from "@/components/PerplexityMarkdown";
import { WeeklyMoversResultsTable } from "@/components/WeeklyMoversResultsTable";
import { type NiftyUniverse, NIFTY_UNIVERSE_OPTIONS } from "@/lib/nifty-constituents";
import { withBasePath } from "@/lib/base-path";
import { readApiErrorMessage } from "@/lib/ai-error";
import type { StockDeepDive } from "@/lib/stock-deep-dive";
import type { NseDealRow } from "@/lib/nse-large-deals";
import type { SymbolSnapshot, WeeklyMoverAiBriefMeta, WeeklyMoverRow } from "@/lib/types";
import {
  BASELINE_VOLUME_LABEL,
  periodAvgVolumeChangeLabel,
  TODAY_VOLUME_VS_BASELINE_LABEL,
} from "@/lib/volume-baseline";

type DashboardStrategy = "volume" | "weekly-movers";
type AiAnalysisProvider = "perplexity" | "gemini";

const AI_PROVIDER_LABELS: Record<AiAnalysisProvider, string> = {
  perplexity: "Perplexity",
  gemini: "Gemini",
};

function formatWeeklySnapshotLabel(snapshot: WeeklyMoverSnapshotMeta): string {
  const summarySuffix =
    snapshot.aiBriefCount && snapshot.aiBriefCount > 0
      ? ` · ${snapshot.aiBriefCount} summar${snapshot.aiBriefCount === 1 ? "y" : "ies"}`
      : "";
  return `#${snapshot.id} — NIFTY ${snapshot.niftyUniverse} · ${snapshot.lookbackDays}d — ${new Date(snapshot.createdAt).toLocaleString()}${summarySuffix}`;
}

function formatAiBriefChipLabel(brief: WeeklyMoverAiBriefMeta): string {
  const provider =
    brief.provider === "gemini" ? "Gemini" : brief.provider === "perplexity" ? "Perplexity" : brief.provider;
  if (brief.briefType === "market") {
    return `Market · ${provider}`;
  }
  return `${brief.symbol ?? "Stock"} · ${provider}`;
}

function isAiAnalysisProvider(value: string): value is AiAnalysisProvider {
  return value === "perplexity" || value === "gemini";
}

type ScanResponse = {
  scannedAt?: string;
  stale: boolean;
  symbolsScanned: number;
  snapshotId?: number;
  historical?: boolean;
  results: SymbolSnapshot[];
  niftyUniverse?: NiftyUniverse;
  snapshotNiftyUniverse?: NiftyUniverse;
  constituentsSource?: "memory" | "embedded";
};

type NseIndexPullInfo = { symbolsPulled: number; fetchedAt: string };

function isNiftyUniverseString(s: string): s is NiftyUniverse {
  return s === "50" || s === "200" || s === "500";
}

function parseVerifiedIndexRefreshResponse(
  raw: unknown,
): { symbolsPulled: number; fetchedAt: string; niftyUniverse: NiftyUniverse } {
  if (raw === null || typeof raw !== "object") {
    throw new Error("NSE index response: expected a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    throw new Error("NSE index response: field ok must be true on success");
  }
  if (typeof o.niftyUniverse !== "string" || !isNiftyUniverseString(o.niftyUniverse)) {
    throw new Error("NSE index response: missing or invalid niftyUniverse");
  }
  if (typeof o.symbolsPulled !== "number" || !Number.isFinite(o.symbolsPulled) || o.symbolsPulled < 1) {
    throw new Error("NSE index response: missing or invalid symbolsPulled");
  }
  if (typeof o.fetchedAt !== "string" || o.fetchedAt.length < 8) {
    throw new Error("NSE index response: missing or invalid fetchedAt");
  }
  return { symbolsPulled: o.symbolsPulled, fetchedAt: o.fetchedAt, niftyUniverse: o.niftyUniverse };
}

function parseNseIndexStatusResponse(raw: unknown): Partial<Record<NiftyUniverse, NseIndexPullInfo>> {
  if (raw === null || typeof raw !== "object" || !("universes" in raw)) {
    return {};
  }
  const universes = (raw as { universes: unknown }).universes;
  if (universes === null || typeof universes !== "object") {
    return {};
  }
  const u = universes as Record<string, unknown>;
  const out: Partial<Record<NiftyUniverse, NseIndexPullInfo>> = {};
  for (const k of NIFTY_UNIVERSE_OPTIONS) {
    const entry = u[k];
    if (entry == null) {
      continue;
    }
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const sp = (entry as Record<string, unknown>).symbolsPulled;
    const at = (entry as Record<string, unknown>).fetchedAt;
    if (typeof sp === "number" && Number.isFinite(sp) && sp > 0 && typeof at === "string" && at) {
      out[k] = { symbolsPulled: sp, fetchedAt: at };
    }
  }
  return out;
}

type SnapshotMeta = {
  id: number;
  createdAt: string;
  symbolsScanned: number;
  niftyUniverse: NiftyUniverse;
};

type WeeklyMoverSnapshotMeta = SnapshotMeta & {
  lookbackDays: number;
  aiBriefCount?: number;
  hasMarketBrief?: boolean;
};

type WeeklyMoversResponse = {
  scannedAt?: string;
  stale?: boolean;
  symbolsScanned?: number;
  snapshotId?: number;
  historical?: boolean;
  niftyUniverse?: NiftyUniverse;
  snapshotNiftyUniverse?: NiftyUniverse;
  lookbackDays?: number;
  results?: WeeklyMoverRow[];
  error?: string;
};

type CachedAiBrief = {
  id: number;
  briefType: "market" | "stock";
  symbol: string | null;
  provider: AiAnalysisProvider | null;
  text: string;
};

type RedditTrendingResponse = {
  fetchedAt?: string;
  postsSampled?: number;
  subredditsUsed?: string;
  sort?: string;
  rankings?: Array<{ symbol: string; mentions: number }>;
  error?: string;
  hint?: string;
};

function ExternalLinkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v7h-7" />
      <path d="M3 10V3h7" />
      <path d="M3 21h7v-7" />
    </svg>
  );
}

function formatInt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) {
    return "—";
  }
  return Math.round(n).toLocaleString();
}

function formatDec(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) {
    return "—";
  }
  return n.toFixed(digits);
}

function formatPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) {
    return "—";
  }
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatInr(n: number | null): string {
  if (n === null || !Number.isFinite(n)) {
    return "—";
  }
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function BuySellBadge({ side }: { side: string }) {
  const upper = side.toUpperCase();
  const isBuy = upper === "BUY";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
        isBuy
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : "bg-rose-50 text-rose-800 ring-rose-200"
      }`}
    >
      {upper}
    </span>
  );
}

function NseDealTable({
  title,
  rows,
  kindLabel,
}: {
  title: string;
  rows: NseDealRow[];
  kindLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-slate-500">
        No {kindLabel} deals for this symbol in the current NSE snapshot.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
        {title}{" "}
        <span className="font-normal text-slate-500">({rows.length} shown)</span>
      </div>
      <table className="min-w-[640px] text-left text-xs">
        <thead className="sticky top-0 bg-slate-100 text-slate-600">
          <tr>
            <th className="whitespace-nowrap px-2 py-2 font-medium">Date</th>
            <th className="whitespace-nowrap px-2 py-2 font-medium">Side</th>
            <th className="whitespace-nowrap px-2 py-2 font-medium">Qty</th>
            <th className="whitespace-nowrap px-2 py-2 font-medium">WAP</th>
            <th className="min-w-[140px] px-2 py-2 font-medium">Client</th>
            <th className="min-w-[120px] px-2 py-2 font-medium">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.date}-${row.clientName}-${index}`}
              className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60"
            >
              <td className="whitespace-nowrap px-2 py-2 text-slate-800">{row.date}</td>
              <td className="px-2 py-2">
                <BuySellBadge side={row.buySell} />
              </td>
              <td className="whitespace-nowrap px-2 py-2 font-medium tabular-nums text-slate-900">
                {formatInt(row.qty)}
              </td>
              <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-800">
                {formatInr(row.weightedAvgPrice)}
              </td>
              <td className="px-2 py-2 text-slate-700">{row.clientName}</td>
              <td className="px-2 py-2 text-slate-500">{row.remarks ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [strategy, setStrategy] = useState<DashboardStrategy>("weekly-movers");
  const [rows, setRows] = useState<SymbolSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minVolSpike, setMinVolSpike] = useState(2);
  const [breakoutOnly, setBreakoutOnly] = useState(false);
  const [lookbackDays, setLookbackDays] = useState(5);
  const [minVolumeBuyingDays, setMinVolumeBuyingDays] = useState(0);
  const [volumeBuyingMult, setVolumeBuyingMult] = useState(1.5);
  const [volumeBuyingUpDayOnly, setVolumeBuyingUpDayOnly] = useState(true);
  const [goldenCrossOnly, setGoldenCrossOnly] = useState(false);
  const [goldenCrossWithinDays, setGoldenCrossWithinDays] = useState(0);
  const [scannedAt, setScannedAt] = useState<string>("");
  const [symbolsScanned, setSymbolsScanned] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [scanStatus, setScanStatus] = useState<"idle" | "running" | "completed">("idle");
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("latest");
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [historicalView, setHistoricalView] = useState(false);
  const [niftyUniverse, setNiftyUniverse] = useState<NiftyUniverse>("200");
  const [nseIndexPullByUniverse, setNseIndexPullByUniverse] = useState<
    Partial<Record<NiftyUniverse, NseIndexPullInfo>>
  >({});
  const [indexRefreshLoading, setIndexRefreshLoading] = useState(false);
  const [indexRefreshMessage, setIndexRefreshMessage] = useState<string | null>(null);
  const [indexRefreshError, setIndexRefreshError] = useState<string | null>(null);

  const [deepDive, setDeepDive] = useState<StockDeepDive | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveError, setDeepDiveError] = useState<string | null>(null);

  const [aiBriefText, setAiBriefText] = useState<string | null>(null);
  const [aiBriefProvider, setAiBriefProvider] = useState<AiAnalysisProvider | null>(null);
  const [aiBriefLoading, setAiBriefLoading] = useState<AiAnalysisProvider | null>(null);
  const [aiBriefError, setAiBriefError] = useState<string | null>(null);
  const [aiBriefContentById, setAiBriefContentById] = useState<Record<number, CachedAiBrief>>({});
  const [expandedAiBriefId, setExpandedAiBriefId] = useState<number | null>(null);

  const [redditRankings, setRedditRankings] = useState<
    Array<{ symbol: string; mentions: number }>
  >([]);
  const [redditMeta, setRedditMeta] = useState<{
    fetchedAt: string;
    postsSampled: number;
    subredditsUsed: string;
    sort: string;
  } | null>(null);
  const [redditLoading, setRedditLoading] = useState(false);
  const [redditError, setRedditError] = useState<string | null>(null);

  const [weeklyRows, setWeeklyRows] = useState<WeeklyMoverRow[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklyLookbackDays, setWeeklyLookbackDays] = useState(5);
  const [weeklyMinAbsChangePct, setWeeklyMinAbsChangePct] = useState(3);
  const [weeklyScannedAt, setWeeklyScannedAt] = useState("");
  const [weeklySymbolsScanned, setWeeklySymbolsScanned] = useState(0);
  const [weeklyScanStatus, setWeeklyScanStatus] = useState<"idle" | "running" | "completed">("idle");
  const [weeklySnapshots, setWeeklySnapshots] = useState<WeeklyMoverSnapshotMeta[]>([]);
  const [selectedWeeklySnapshotId, setSelectedWeeklySnapshotId] = useState<string>("latest");
  const [activeWeeklySnapshotId, setActiveWeeklySnapshotId] = useState<number | null>(null);
  const [weeklyHistoricalView, setWeeklyHistoricalView] = useState(false);

  const [marketBriefLoading, setMarketBriefLoading] = useState<AiAnalysisProvider | null>(null);
  const [marketBriefError, setMarketBriefError] = useState<string | null>(null);
  const [aiBriefSnapshots, setAiBriefSnapshots] = useState<WeeklyMoverAiBriefMeta[]>([]);

  const preScanViewRef = useRef<{
    rows: SymbolSnapshot[];
    scannedAt: string;
    symbolsScanned: number;
    niftyUniverse: NiftyUniverse;
  } | null>(null);

  const preWeeklyScanViewRef = useRef<{
    rows: WeeklyMoverRow[];
    scannedAt: string;
    symbolsScanned: number;
    niftyUniverse: NiftyUniverse;
    lookbackDays: number;
  } | null>(null);

  const currentNseIndexPull = nseIndexPullByUniverse[niftyUniverse] ?? null;

  const selectedRow = useMemo(
    () => rows.find((row) => row.symbol === selectedSymbol) ?? null,
    [rows, selectedSymbol],
  );

  const selectedWeeklyRow = useMemo(
    () => weeklyRows.find((row) => row.symbol === selectedSymbol) ?? null,
    [weeklyRows, selectedSymbol],
  );

  const normalizedSelectedSymbol = useMemo(
    () => selectedSymbol.replace(/\.NS$/i, ""),
    [selectedSymbol],
  );

  const summariesForActiveSnapshot = useMemo(() => {
    if (!activeWeeklySnapshotId) {
      return [];
    }
    return aiBriefSnapshots.filter((brief) => brief.snapshotId === activeWeeklySnapshotId);
  }, [aiBriefSnapshots, activeWeeklySnapshotId]);

  const marketSummariesForActiveSnapshot = useMemo(
    () => summariesForActiveSnapshot.filter((brief) => brief.briefType === "market"),
    [summariesForActiveSnapshot],
  );

  const stockSummariesForActiveSnapshot = useMemo(
    () => summariesForActiveSnapshot.filter((brief) => brief.briefType === "stock"),
    [summariesForActiveSnapshot],
  );

  const stockSummariesForSelectedSymbol = useMemo(
    () =>
      stockSummariesForActiveSnapshot.filter(
        (brief) => brief.symbol?.toUpperCase() === normalizedSelectedSymbol.toUpperCase(),
      ),
    [stockSummariesForActiveSnapshot, normalizedSelectedSymbol],
  );

  const expandedAiBrief = useMemo(
    () => (expandedAiBriefId ? (aiBriefContentById[expandedAiBriefId] ?? null) : null),
    [expandedAiBriefId, aiBriefContentById],
  );

  function selectRowSymbol(symbol: string, options?: { preserveAiBrief?: boolean }) {
    if (!options?.preserveAiBrief) {
      setAiBriefText(null);
      setAiBriefProvider(null);
      setAiBriefError(null);
      if (expandedAiBriefId) {
        const expanded = aiBriefContentById[expandedAiBriefId];
        if (
          expanded?.briefType === "stock" &&
          expanded.symbol?.toUpperCase() !== symbol.replace(/\.NS$/i, "").toUpperCase()
        ) {
          setExpandedAiBriefId(null);
        }
      }
    }
    setSelectedSymbol(symbol);
  }

  function clearWeeklyAiBriefs() {
    setAiBriefContentById({});
    setExpandedAiBriefId(null);
    setMarketBriefError(null);
    setAiBriefError(null);
  }

  function cacheAiBrief(brief: {
    id: number;
    briefType: "market" | "stock";
    symbol: string | null;
    provider: string;
    text: string;
  }) {
    const provider = isAiAnalysisProvider(brief.provider) ? brief.provider : null;
    setAiBriefContentById((prev) => ({
      ...prev,
      [brief.id]: {
        id: brief.id,
        briefType: brief.briefType,
        symbol: brief.symbol,
        provider,
        text: brief.text,
      },
    }));
  }

  async function ensureAiBriefCached(briefId: number) {
    if (aiBriefContentById[briefId]) {
      return aiBriefContentById[briefId];
    }
    setMarketBriefError(null);
    setAiBriefError(null);
    const response = await fetch(withBasePath(`/api/weekly-mover-ai-briefs?id=${briefId}`), { cache: "no-store" });
    const data = (await response.json()) as {
      brief?: {
        id: number;
        briefType: "market" | "stock";
        symbol: string | null;
        provider: string;
        text: string;
      };
      error?: string;
    };
    if (!response.ok || !data.brief) {
      throw new Error(data.error ?? "Failed to load saved AI brief");
    }
    cacheAiBrief(data.brief);
    return {
      id: data.brief.id,
      briefType: data.brief.briefType,
      symbol: data.brief.symbol,
      provider: isAiAnalysisProvider(data.brief.provider) ? data.brief.provider : null,
      text: data.brief.text,
    } satisfies CachedAiBrief;
  }

  async function toggleAiBriefExpand(briefId: number) {
    if (expandedAiBriefId === briefId) {
      setExpandedAiBriefId(null);
      return;
    }
    try {
      const brief = await ensureAiBriefCached(briefId);
      if (brief.briefType === "stock" && brief.symbol) {
        setSelectedSymbol(brief.symbol);
        void loadDeepDive(brief.symbol);
      }
      setExpandedAiBriefId(briefId);
    } catch (fetchError) {
      setMarketBriefError(fetchError instanceof Error ? fetchError.message : "Unexpected error");
    }
  }

  async function loadSnapshots() {
    const response = await fetch(withBasePath("/api/snapshots"));
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { snapshots: SnapshotMeta[] };
    setSnapshots(data.snapshots ?? []);
  }

  async function loadWeeklySnapshots() {
    const response = await fetch(withBasePath("/api/weekly-mover-snapshots"));
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { snapshots: WeeklyMoverSnapshotMeta[] };
    setWeeklySnapshots(data.snapshots ?? []);
  }

  async function loadAiBriefSnapshots() {
    const response = await fetch(withBasePath("/api/weekly-mover-ai-briefs"));
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { briefs: WeeklyMoverAiBriefMeta[] };
    setAiBriefSnapshots(data.briefs ?? []);
  }

  async function refreshSummariesForSnapshot(snapshotId: number) {
    const response = await fetch(withBasePath(`/api/weekly-mover-ai-briefs?snapshotId=${snapshotId}`), {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { briefs: WeeklyMoverAiBriefMeta[] };
    const scoped = data.briefs ?? [];
    setAiBriefSnapshots((prev) => {
      const rest = prev.filter((brief) => brief.snapshotId !== snapshotId);
      return [...scoped, ...rest].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    });
  }

  async function syncNseIndexStatusFromServer() {
    try {
      const res = await fetch(withBasePath("/api/nifty-index/status"), { cache: "no-store" });
      if (!res.ok) {
        return;
      }
      const raw: unknown = await res.json();
      const merged = parseNseIndexStatusResponse(raw);
      if (Object.keys(merged).length > 0) {
        setNseIndexPullByUniverse((prev) => ({ ...prev, ...merged }));
      }
    } catch {
      // Non-fatal: client can still use embedded list and re-pull.
    }
  }

  async function refreshNseIndexList() {
    setIndexRefreshLoading(true);
    setIndexRefreshError(null);
    setIndexRefreshMessage(null);
    try {
      const q = new URLSearchParams({ niftyUniverse });
      const response = await fetch(withBasePath(`/api/nifty-index/refresh?${q.toString()}`), { cache: "no-store" });
      const raw: unknown = await response.json();
      if (!response.ok) {
        const err = raw as { error?: string };
        throw new Error(err.error ?? "Index refresh failed");
      }
      const { symbolsPulled, fetchedAt, niftyUniverse: u } = parseVerifiedIndexRefreshResponse(raw);
      setNseIndexPullByUniverse((prev) => ({
        ...prev,
        [u]: { symbolsPulled, fetchedAt },
      }));
      setIndexRefreshMessage(
        `NSE index updated: ${symbolsPulled} symbol${symbolsPulled === 1 ? "" : "s"} ` +
          `pulled for NIFTY ${u} (${new Date(fetchedAt).toLocaleString()}).`,
      );
    } catch (e) {
      setIndexRefreshError(e instanceof Error ? e.message : "Index refresh failed");
    } finally {
      setIndexRefreshLoading(false);
    }
  }

  async function loadScanner(options?: {
    forceRefresh?: boolean;
    snapshotId?: number;
    /** Use when the universe is changing in the same tick as the fetch (avoids stale state). */
    niftyUniverseOverride?: NiftyUniverse;
  }) {
    const universeToUse = options?.niftyUniverseOverride ?? niftyUniverse;
    if (options?.niftyUniverseOverride) {
      setNiftyUniverse(options.niftyUniverseOverride);
    }

    setLoading(true);
    setScanStatus("running");
    setError(null);
    preScanViewRef.current = { rows, scannedAt, symbolsScanned, niftyUniverse };
    setRows([]);
    setScannedAt("");
    setSymbolsScanned(0);
    try {
      const query = new URLSearchParams({
        minVolSpike: String(minVolSpike),
        breakoutOnly: String(breakoutOnly),
        limit: "40",
        lookbackDays: String(lookbackDays),
        minVolumeBuyingDays: String(minVolumeBuyingDays),
        volumeBuyingMult: String(volumeBuyingMult),
        volumeBuyingUpDayOnly: String(volumeBuyingUpDayOnly),
        goldenCrossOnly: String(goldenCrossOnly),
        goldenCrossWithinDays: String(goldenCrossWithinDays),
      });
      if (options?.forceRefresh) {
        query.set("forceRefresh", "true");
      }
      if (options?.snapshotId) {
        query.set("snapshotId", String(options.snapshotId));
      }
      if (!options?.snapshotId) {
        query.set("niftyUniverse", universeToUse);
      }

      const response = await fetch(withBasePath(`/api/scan?${query.toString()}`), { cache: "no-store" });
      const data = (await response.json()) as ScanResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to fetch scanner data");
      }
      setRows(data.results);
      setScannedAt(data.scannedAt ?? "");
      setSymbolsScanned(data.symbolsScanned);
      setHistoricalView(Boolean(data.historical));
      setActiveSnapshotId(data.snapshotId ?? null);
      if (data.niftyUniverse) {
        setNiftyUniverse(data.niftyUniverse);
      }
      if (!data.historical && data.constituentsSource === "memory" && data.niftyUniverse && data.symbolsScanned > 0) {
        setNseIndexPullByUniverse((prev) => ({
          ...prev,
          [data.niftyUniverse!]: {
            symbolsPulled: data.symbolsScanned,
            fetchedAt: data.scannedAt ?? new Date().toISOString(),
          },
        }));
      }
      if (!selectedSymbol && data.results[0]) {
        selectRowSymbol(data.results[0].symbol);
      }
      await loadSnapshots();
      setScanStatus("completed");
      setTimeout(() => {
        setScanStatus("idle");
      }, 1800);
    } catch (fetchError) {
      if (preScanViewRef.current) {
        setRows(preScanViewRef.current.rows);
        setScannedAt(preScanViewRef.current.scannedAt);
        setSymbolsScanned(preScanViewRef.current.symbolsScanned);
        setNiftyUniverse(preScanViewRef.current.niftyUniverse);
      }
      setError(fetchError instanceof Error ? fetchError.message : "Unexpected error");
      setScanStatus("idle");
    } finally {
      preScanViewRef.current = null;
      setLoading(false);
    }
  }

  async function loadWeeklyMovers(options?: {
    forceRefresh?: boolean;
    snapshotId?: number;
    niftyUniverseOverride?: NiftyUniverse;
  }) {
    const universeToUse = options?.niftyUniverseOverride ?? niftyUniverse;
    if (options?.niftyUniverseOverride) {
      setNiftyUniverse(options.niftyUniverseOverride);
    }

    setWeeklyLoading(true);
    setWeeklyScanStatus("running");
    setWeeklyError(null);
    clearWeeklyAiBriefs();
    preWeeklyScanViewRef.current = {
      rows: weeklyRows,
      scannedAt: weeklyScannedAt,
      symbolsScanned: weeklySymbolsScanned,
      niftyUniverse,
      lookbackDays: weeklyLookbackDays,
    };
    setWeeklyRows([]);
    setWeeklyScannedAt("");
    setWeeklySymbolsScanned(0);
    try {
      const query = new URLSearchParams({
        lookbackDays: String(weeklyLookbackDays),
        direction: "gainers",
        minAbsChangePct: String(weeklyMinAbsChangePct),
        limit: "40",
      });
      if (options?.forceRefresh) {
        query.set("forceRefresh", "true");
      }
      if (options?.snapshotId) {
        query.set("snapshotId", String(options.snapshotId));
      }
      if (!options?.snapshotId) {
        query.set("niftyUniverse", universeToUse);
      }

      const response = await fetch(withBasePath(`/api/weekly-movers?${query.toString()}`), { cache: "no-store" });
      const data = (await response.json()) as WeeklyMoversResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to fetch weekly movers");
      }
      setWeeklyRows(data.results ?? []);
      setWeeklyScannedAt(data.scannedAt ?? "");
      setWeeklySymbolsScanned(data.symbolsScanned ?? 0);
      setWeeklyHistoricalView(Boolean(data.historical));
      setActiveWeeklySnapshotId(data.snapshotId ?? null);
      if (data.niftyUniverse) {
        setNiftyUniverse(data.niftyUniverse);
      }
      if (data.lookbackDays) {
        setWeeklyLookbackDays(data.lookbackDays);
      }
      if (!selectedSymbol && data.results?.[0]) {
        selectRowSymbol(data.results[0].symbol);
        void loadDeepDive(data.results[0].symbol);
      }
      await loadWeeklySnapshots();
      await loadAiBriefSnapshots();
      if (data.snapshotId) {
        await refreshSummariesForSnapshot(data.snapshotId);
      }
      setWeeklyScanStatus("completed");
      setTimeout(() => setWeeklyScanStatus("idle"), 1800);
    } catch (fetchError) {
      if (preWeeklyScanViewRef.current) {
        setWeeklyRows(preWeeklyScanViewRef.current.rows);
        setWeeklyScannedAt(preWeeklyScanViewRef.current.scannedAt);
        setWeeklySymbolsScanned(preWeeklyScanViewRef.current.symbolsScanned);
        setNiftyUniverse(preWeeklyScanViewRef.current.niftyUniverse);
        setWeeklyLookbackDays(preWeeklyScanViewRef.current.lookbackDays);
      }
      setWeeklyError(fetchError instanceof Error ? fetchError.message : "Unexpected error");
      setWeeklyScanStatus("idle");
    } finally {
      preWeeklyScanViewRef.current = null;
      setWeeklyLoading(false);
    }
  }

  async function loadMarketBrief(provider: AiAnalysisProvider) {
    if (weeklyRows.length === 0) {
      return;
    }
    if (!activeWeeklySnapshotId) {
      setMarketBriefError("Run a weekly scan first so the analysis can be saved to a snapshot.");
      return;
    }
    setMarketBriefLoading(provider);
    setMarketBriefError(null);
    try {
      const response = await fetch(withBasePath("/api/market-opportunities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          weeklyMoverSnapshotId: activeWeeklySnapshotId,
          movers: weeklyRows.map((row) => ({
            symbol: row.symbol,
            periodChangePct: row.periodChangePct,
            industry: row.industry,
          })),
          lookbackDays: weeklyLookbackDays,
          niftyUniverse,
          direction: "gainers",
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response));
      }
      const data = (await response.json()) as {
        text?: string;
        aiBriefId?: number | null;
      };
      if (data.aiBriefId && data.text) {
        cacheAiBrief({
          id: data.aiBriefId,
          briefType: "market",
          symbol: null,
          provider,
          text: data.text,
        });
        setExpandedAiBriefId(data.aiBriefId);
      }
      if (activeWeeklySnapshotId) {
        await refreshSummariesForSnapshot(activeWeeklySnapshotId);
      } else {
        await loadAiBriefSnapshots();
      }
    } catch (fetchError) {
      setMarketBriefError(fetchError instanceof Error ? fetchError.message : "Unexpected error");
    } finally {
      setMarketBriefLoading(null);
    }
  }

  async function loadDeepDive(symbol: string) {
    setDeepDiveLoading(true);
    setDeepDiveError(null);
    try {
      const response = await fetch(withBasePath(`/api/stock-details?symbol=${encodeURIComponent(symbol)}`));
      if (!response.ok) {
        throw new Error("Failed to load stock details");
      }
      const data = (await response.json()) as StockDeepDive;
      setDeepDive(data);
    } catch (fetchError) {
      setDeepDive(null);
      setDeepDiveError(fetchError instanceof Error ? fetchError.message : "Unexpected error");
    } finally {
      setDeepDiveLoading(false);
    }
  }

  async function loadAiBrief(provider: AiAnalysisProvider) {
    if (!selectedSymbol) {
      return;
    }
    if (strategy === "weekly-movers" && !activeWeeklySnapshotId) {
      setAiBriefError("Run a weekly scan first so the analysis can be saved to a snapshot.");
      return;
    }
    setAiBriefLoading(provider);
    setAiBriefError(null);
    try {
      const companyName =
        deepDive && deepDive.symbol === normalizedSelectedSymbol ? deepDive.name ?? null : null;
      const weeklyRow = weeklyRows.find((r) => r.symbol === normalizedSelectedSymbol);
      const endpoint = withBasePath(provider === "gemini" ? "/api/stock-gemini" : "/api/stock-perplexity");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: normalizedSelectedSymbol,
          name: companyName,
          ...(strategy === "weekly-movers" && weeklyRow
            ? {
                strategy: "weekly-mover",
                periodChangePct: weeklyRow.periodChangePct,
                lookbackDays: weeklyRow.lookbackDays,
                weeklyMoverSnapshotId: activeWeeklySnapshotId,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response));
      }
      const data = (await response.json()) as {
        text?: string;
        aiBriefId?: number | null;
      };
      if (strategy === "weekly-movers" && data.aiBriefId && data.text) {
        cacheAiBrief({
          id: data.aiBriefId,
          briefType: "stock",
          symbol: normalizedSelectedSymbol,
          provider,
          text: data.text,
        });
        setExpandedAiBriefId(data.aiBriefId);
        if (activeWeeklySnapshotId) {
          await refreshSummariesForSnapshot(activeWeeklySnapshotId);
        }
      } else {
        setAiBriefText(data.text ?? "");
        setAiBriefProvider(provider);
      }
    } catch (fetchError) {
      if (strategy !== "weekly-movers") {
        setAiBriefText(null);
        setAiBriefProvider(null);
      }
      setAiBriefError(fetchError instanceof Error ? fetchError.message : "Unexpected error");
    } finally {
      setAiBriefLoading(null);
    }
  }

  async function loadRedditTrending() {
    setRedditLoading(true);
    setRedditError(null);
    try {
      const response = await fetch(withBasePath("/api/reddit-trending?posts=400&limit=25"));
      const data = (await response.json()) as RedditTrendingResponse;
      if (!response.ok) {
        const extra = data.hint ? ` ${data.hint}` : "";
        throw new Error(`${data.error ?? "Request failed"}${extra}`);
      }
      setRedditRankings(data.rankings ?? []);
      setRedditMeta({
        fetchedAt: data.fetchedAt ?? "",
        postsSampled: data.postsSampled ?? 0,
        subredditsUsed: data.subredditsUsed ?? "",
        sort: data.sort ?? "",
      });
    } catch (fetchError) {
      setRedditRankings([]);
      setRedditMeta(null);
      setRedditError(fetchError instanceof Error ? fetchError.message : "Unexpected error");
    } finally {
      setRedditLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await syncNseIndexStatusFromServer();

      const [snapRes, weeklySnapRes] = await Promise.all([
        fetch(withBasePath("/api/snapshots"), { cache: "no-store" }),
        fetch(withBasePath("/api/weekly-mover-snapshots"), { cache: "no-store" }),
      ]);

      if (snapRes.ok) {
        const snapData = (await snapRes.json()) as { snapshots: SnapshotMeta[] };
        const list = snapData.snapshots ?? [];
        setSnapshots(list);
        const latest = list[0];
        if (latest) {
          setSelectedSnapshotId(String(latest.id));
          void loadScanner({ snapshotId: latest.id });
        } else {
          void loadScanner();
        }
      } else {
        void loadScanner();
      }

      if (weeklySnapRes.ok) {
        const weeklyData = (await weeklySnapRes.json()) as { snapshots: WeeklyMoverSnapshotMeta[] };
        const weeklyList = weeklyData.snapshots ?? [];
        setWeeklySnapshots(weeklyList);
        void loadAiBriefSnapshots();
        const latestWeekly = weeklyList[0];
        if (latestWeekly) {
          setSelectedWeeklySnapshotId(String(latestWeekly.id));
          void loadWeeklyMovers({ snapshotId: latestWeekly.id });
        } else {
          void loadWeeklyMovers();
        }
      } else {
        void loadWeeklyMovers();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = useMemo(() => {
    if (strategy === "weekly-movers") {
      return `Top gainers · last ${weeklyLookbackDays} sessions`;
    }
    const vb =
      minVolumeBuyingDays > 0
        ? ` · Volume buying last ${lookbackDays}d (≥${minVolumeBuyingDays} session${
            minVolumeBuyingDays === 1 ? "" : "s"
          })`
        : "";
    const gc =
      goldenCrossOnly
        ? " · Golden cross today"
        : goldenCrossWithinDays > 0
          ? ` · Golden cross within ${goldenCrossWithinDays}d`
          : "";
    if (breakoutOnly) {
      return `Breakout candidates${vb}${gc}`;
    }
    if (goldenCrossOnly || goldenCrossWithinDays > 0) {
      return `Golden cross candidates${vb}`;
    }
    return `Volume spike candidates${vb}`;
  }, [
    strategy,
    weeklyLookbackDays,
    breakoutOnly,
    lookbackDays,
    minVolumeBuyingDays,
    goldenCrossOnly,
    goldenCrossWithinDays,
  ]);

  function getScreenerUrl(symbol: string): string {
    return `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
  }

  function getTradingViewUrl(symbol: string): string {
    return `https://www.tradingview.com/symbols/NSE-${encodeURIComponent(symbol)}/`;
  }

  function getNseQuoteUrl(symbol: string): string {
    return `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Indian Stock Scanner</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Yahoo Finance delayed feed · {`NIFTY ${niftyUniverse}`} ·{" "}
            {strategy === "volume"
              ? `${symbolsScanned} constituents in last volume scan`
              : weeklySymbolsScanned > 0
                ? `${weeklySymbolsScanned} constituents in last weekly scan`
                : "select a strategy and run a scan"}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <NotificationSetup />
          <DailyScanRunButton variant="secondary" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-1.5">
        <button
          type="button"
          onClick={() => setStrategy("volume")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            strategy === "volume"
              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Volume analysis
        </button>
        <button
          type="button"
          onClick={() => {
            setStrategy("weekly-movers");
            if (weeklyRows.length === 0 && !weeklyLoading) {
              void loadWeeklyMovers();
            }
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            strategy === "weekly-movers"
              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Movers analysis
        </button>
      </div>

      <section className="rounded-xl border border-orange-200/80 bg-gradient-to-br from-orange-50/90 to-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-orange-900/80">
              Reddit · trending cashtags
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-orange-950/70">
              <span className="font-medium text-orange-950">$</span>TICKER mentions in titles and self-text from a
              bundle of US + India stock subreddits (hot feed). Uses Reddit OAuth app credentials — no
              per-post billing like X; still subject to Reddit rate limits and terms.
            </p>
            {redditMeta?.fetchedAt ? (
              <p className="mt-2 text-[11px] text-orange-900/60">
                Sampled {redditMeta.postsSampled} posts · sort: {redditMeta.sort} ·{" "}
                {new Date(redditMeta.fetchedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void loadRedditTrending()}
            disabled={redditLoading}
            className="h-[42px] shrink-0 rounded-md bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {redditLoading ? "Loading…" : "Refresh Reddit ranks"}
          </button>
        </div>
        {redditLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-orange-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
            Fetching Reddit listings…
          </div>
        ) : null}
        {redditError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {redditError}
          </p>
        ) : null}
        {redditRankings.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-orange-100 bg-white">
            <table className="min-w-[360px] text-sm">
              <thead className="bg-orange-50 text-left text-orange-900/80">
                <tr>
                  <th className="px-3 py-2">Cashtag</th>
                  <th className="px-3 py-2">Mentions</th>
                  <th className="px-3 py-2">Search on Reddit</th>
                </tr>
              </thead>
              <tbody>
                {redditRankings.map((row) => (
                  <tr key={row.symbol} className="border-t border-orange-100">
                    <td className="px-3 py-2 font-medium">${row.symbol}</td>
                    <td className="px-3 py-2 tabular-nums">{row.mentions}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`https://www.reddit.com/search/?q=${encodeURIComponent(`$${row.symbol}`)}&type=link`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-orange-700 hover:underline"
                      >
                        Open <ExternalLinkIcon className="h-3.5 w-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {strategy === "volume" ? (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
        <div className="space-y-6">
          <div className="grid max-w-xl gap-3 sm:max-w-2xl">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nifty-universe" className="text-sm font-medium text-zinc-800">
                Nifty index universe
              </label>
              <p className="text-xs text-zinc-500">
                <strong>Update index from NSE</strong> downloads the current constituent list and shows
                how many names were loaded (NSE is never pulled automatically).{" "}
                <strong>Run full scan</strong> runs Yahoo for each symbol in the list in memory, or
                the embedded file if you have not updated the index in this server session, then
                writes results to SQLite.
              </p>
              <select
                id="nifty-universe"
                value={niftyUniverse}
                disabled={loading || indexRefreshLoading}
                onChange={(event) => {
                  const value = event.target.value as NiftyUniverse;
                  if (!NIFTY_UNIVERSE_OPTIONS.includes(value)) {
                    return;
                  }
                  setIndexRefreshError(null);
                  setIndexRefreshMessage(null);
                  setSelectedSnapshotId("latest");
                  void loadScanner({ niftyUniverseOverride: value });
                }}
                className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {NIFTY_UNIVERSE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    NIFTY {n}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={loading || indexRefreshLoading}
                  onClick={() => void refreshNseIndexList()}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {indexRefreshLoading ? "Loading NSE list…" : "Update index from NSE"}
                </button>
              </div>
              {currentNseIndexPull ? (
                <p className="text-xs text-zinc-600">
                  Last NSE download for {`NIFTY ${niftyUniverse}`}:{" "}
                  <span className="font-medium tabular-nums">{currentNseIndexPull.symbolsPulled}</span>{" "}
                  names · {new Date(currentNseIndexPull.fetchedAt).toLocaleString()}
                </p>
              ) : (
                <p className="text-xs text-amber-800/90">
                  No live NSE list in memory for {`NIFTY ${niftyUniverse}`} (this server has not
                  received an &quot;Update index from NSE&quot; in this process, or status has not
                  synced yet) — scans use the embedded file until you update the index.
                </p>
              )}
              {indexRefreshMessage ? (
                <p className="text-xs text-emerald-800">{indexRefreshMessage}</p>
              ) : null}
              {indexRefreshError ? (
                <p className="text-xs text-red-600" role="alert">
                  {indexRefreshError}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Scanner filters
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="min-vol-spike" className="text-sm font-medium text-zinc-800">
                    Minimum volume spike
                  </label>
                  <p className="text-xs text-zinc-500">Today&apos;s volume vs 20-day average (e.g. 2×)</p>
                  <input
                    id="min-vol-spike"
                    type="number"
                    step="0.1"
                    min="1"
                    value={minVolSpike}
                    onChange={(event) => setMinVolSpike(Number(event.target.value))}
                    className="w-full max-w-[8rem] rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:pt-6">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={breakoutOnly}
                      onChange={(event) => setBreakoutOnly(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-zinc-800">Breakout only</span>
                      <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                        Price above 20-day high with stronger volume
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-3 lg:border-l lg:border-zinc-100 lg:pl-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Volume buying (rolling window)
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="lookback-days" className="text-sm font-medium text-zinc-800">
                    Lookback (trading days)
                  </label>
                  <p className="text-xs text-zinc-500">How many recent sessions to score</p>
                  <input
                    id="lookback-days"
                    type="number"
                    min={1}
                    max={60}
                    value={lookbackDays}
                    onChange={(event) => setLookbackDays(Number(event.target.value))}
                    className="w-full max-w-[8rem] rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="min-vb-days" className="text-sm font-medium text-zinc-800">
                    Minimum hit days
                  </label>
                  <p className="text-xs text-zinc-500">0 = no filter; else require at least this many hits</p>
                  <input
                    id="min-vb-days"
                    type="number"
                    min={0}
                    max={60}
                    value={minVolumeBuyingDays}
                    onChange={(event) => setMinVolumeBuyingDays(Number(event.target.value))}
                    className="w-full max-w-[8rem] rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="vb-mult" className="text-sm font-medium text-zinc-800">
                    Volume vs 20d average
                  </label>
                  <p className="text-xs text-zinc-500">A day counts if volume ≥ this × prior 20d avg</p>
                  <input
                    id="vb-mult"
                    type="number"
                    step="0.1"
                    min={1}
                    value={volumeBuyingMult}
                    onChange={(event) => setVolumeBuyingMult(Number(event.target.value))}
                    className="w-full max-w-[8rem] rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm sm:max-w-sm">
                    <input
                      type="checkbox"
                      checked={volumeBuyingUpDayOnly}
                      onChange={(event) => setVolumeBuyingUpDayOnly(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-zinc-800">Require up day</span>
                      <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                        Close must be above previous close for a session to count
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-zinc-100 pt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Golden cross (50 / 200 SMA)
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={goldenCrossOnly}
                    onChange={(event) => setGoldenCrossOnly(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-zinc-800">Golden cross today</span>
                    <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                      50-day SMA crossed above 200-day SMA on the latest session
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="golden-cross-within" className="text-sm font-medium text-zinc-800">
                  Cross within (days)
                </label>
                <p className="text-xs text-zinc-500">0 = off; else show crosses in the last N sessions</p>
                <input
                  id="golden-cross-within"
                  type="number"
                  min={0}
                  max={60}
                  value={goldenCrossWithinDays}
                  onChange={(event) => setGoldenCrossWithinDays(Number(event.target.value))}
                  className="w-full max-w-[8rem] rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-zinc-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
              <div className="flex min-w-[12rem] flex-col gap-1.5">
                <label htmlFor="snapshot-select" className="text-sm font-medium text-zinc-800">
                  Saved snapshot
                </label>
                <p className="text-xs text-zinc-500">Load a stored scan from SQLite</p>
                <select
                  id="snapshot-select"
                  value={selectedSnapshotId}
                  onChange={(event) => setSelectedSnapshotId(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 sm:max-w-xs"
                >
                  <option value="latest">Latest (live cache)</option>
                  {snapshots.map((snapshot) => (
                    <option key={snapshot.id} value={String(snapshot.id)}>
                      #{snapshot.id} — NIFTY {snapshot.niftyUniverse} —{" "}
                      {new Date(snapshot.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  if (selectedSnapshotId === "latest") {
                    void loadScanner();
                    return;
                  }
                  const snapshotId = Number(selectedSnapshotId);
                  if (Number.isFinite(snapshotId) && snapshotId > 0) {
                    void loadScanner({ snapshotId });
                  }
                }}
                className="h-[42px] shrink-0 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Load snapshot
              </button>
              <div className="flex flex-col gap-1 text-xs text-zinc-500 sm:ml-1">
                <span>
                  Last scan:{" "}
                  <span className="font-medium text-zinc-700">
                    {scannedAt ? new Date(scannedAt).toLocaleString() : "—"}
                  </span>
                </span>
                {activeSnapshotId ? (
                  <span className="text-zinc-600">
                    {historicalView ? `Viewing snapshot #${activeSnapshotId}` : `Live snapshot #${activeSnapshotId}`}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-1 sm:max-w-xs sm:items-end">
              <span className="text-xs text-zinc-500 sm:text-right">
                Rescan all symbols (Yahoo) and save a new row in SQLite, bypassing the time cache.
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedSnapshotId("latest");
                  void loadScanner({ forceRefresh: true });
                }}
                disabled={loading || indexRefreshLoading}
                className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Scanning…" : "Run full scan"}
              </button>
            </div>
          </div>
        </div>
      </section>
      ) : (
      <section className="rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50/60 to-white p-4 shadow-sm md:p-5">
        <div className="space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-900/80">
              Movers analysis · investigation
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-teal-950/70">
              Rank NIFTY constituents by price change over the last N trading sessions. Use Perplexity
              or Gemini on a row to explain why a stock moved, or run a market brief on the full results list to
              spot emerging themes and opportunities.
            </p>
          </div>

          <div className="grid max-w-xl gap-3 sm:max-w-2xl">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="weekly-nifty-universe" className="text-sm font-medium text-zinc-800">
                Nifty index universe
              </label>
              <select
                id="weekly-nifty-universe"
                value={niftyUniverse}
                disabled={weeklyLoading || indexRefreshLoading}
                onChange={(event) => {
                  const value = event.target.value as NiftyUniverse;
                  if (!NIFTY_UNIVERSE_OPTIONS.includes(value)) {
                    return;
                  }
                  setIndexRefreshError(null);
                  setIndexRefreshMessage(null);
                  void loadWeeklyMovers({ niftyUniverseOverride: value });
                }}
                className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {NIFTY_UNIVERSE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    NIFTY {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
                <div className="flex min-w-[12rem] flex-col gap-1.5">
                  <label htmlFor="weekly-snapshot-select" className="text-sm font-medium text-zinc-800">
                    Scan snapshot
                  </label>
                  <p className="text-xs text-zinc-500">Load mover data and its saved summaries together</p>
                  <select
                    id="weekly-snapshot-select"
                    value={selectedWeeklySnapshotId}
                    onChange={(event) => setSelectedWeeklySnapshotId(event.target.value)}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 sm:max-w-md"
                  >
                    <option value="latest">Latest (live cache)</option>
                    {weeklySnapshots.map((snapshot) => (
                      <option key={snapshot.id} value={String(snapshot.id)}>
                        {formatWeeklySnapshotLabel(snapshot)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={weeklyLoading}
                  onClick={() => {
                    if (selectedWeeklySnapshotId === "latest") {
                      void loadWeeklyMovers();
                      return;
                    }
                    const snapshotId = Number(selectedWeeklySnapshotId);
                    if (Number.isFinite(snapshotId) && snapshotId > 0) {
                      void loadWeeklyMovers({ snapshotId });
                    }
                  }}
                  className="h-[42px] shrink-0 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Load snapshot
                </button>
                <div className="flex flex-col gap-1 text-xs text-zinc-500">
                  <span>
                    Last scan:{" "}
                    <span className="font-medium text-zinc-700">
                      {weeklyScannedAt ? new Date(weeklyScannedAt).toLocaleString() : "—"}
                    </span>
                  </span>
                  {activeWeeklySnapshotId ? (
                    <span className="text-teal-900/80">
                      {weeklyHistoricalView ? "Viewing" : "Live"} scan #{activeWeeklySnapshotId}
                      {summariesForActiveSnapshot.length > 0
                        ? ` · ${summariesForActiveSnapshot.length} saved summar${summariesForActiveSnapshot.length === 1 ? "y" : "ies"}`
                        : " · no summaries yet"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {activeWeeklySnapshotId ? (
              <div className="mt-4 border-t border-teal-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-800/90">
                  Summaries for scan #{activeWeeklySnapshotId}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Click a chip to expand a summary saved against this scan. Click again to collapse.
                </p>
                {summariesForActiveSnapshot.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    No summaries yet for this scan — run Analyze below to create one.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {summariesForActiveSnapshot.map((brief) => {
                      const isExpanded = expandedAiBriefId === brief.id;
                      return (
                        <button
                          key={brief.id}
                          type="button"
                          onClick={() => void toggleAiBriefExpand(brief.id)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                            isExpanded
                              ? "bg-violet-700 text-white ring-2 ring-violet-300"
                              : "border border-violet-200 bg-white text-violet-900 hover:border-violet-300 hover:bg-violet-50"
                          }`}
                        >
                          {formatAiBriefChipLabel(brief)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 border-t border-teal-100 pt-3 text-xs text-zinc-500">
                Run or load a scan first — AI summaries are always linked to a scan snapshot.
              </p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Price move filters
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="weekly-lookback" className="text-sm font-medium text-zinc-800">
                    Lookback (trading days)
                  </label>
                  <p className="text-xs text-zinc-500">Default 5 ≈ one trading week</p>
                  <input
                    id="weekly-lookback"
                    type="number"
                    min={1}
                    max={60}
                    value={weeklyLookbackDays}
                    onChange={(event) => setWeeklyLookbackDays(Number(event.target.value))}
                    className="w-full max-w-[8rem] rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="weekly-min-abs" className="text-sm font-medium text-zinc-800">
                    Min absolute move %
                  </label>
                  <p className="text-xs text-zinc-500">Filter out small moves</p>
                  <input
                    id="weekly-min-abs"
                    type="number"
                    step="0.5"
                    min={0}
                    value={weeklyMinAbsChangePct}
                    onChange={(event) => setWeeklyMinAbsChangePct(Number(event.target.value))}
                    className="w-full max-w-[8rem] rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 lg:border-l lg:border-zinc-100 lg:pl-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Market narrative (AI)
              </h3>
              <p className="text-xs text-zinc-500">
                Summarize themes behind the movers for the active scan
                {activeWeeklySnapshotId ? ` #${activeWeeklySnapshotId}` : ""}. Saved to that snapshot
                automatically.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["gemini", "perplexity"] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => void loadMarketBrief(provider)}
                    disabled={
                      marketBriefLoading !== null || weeklyRows.length === 0 || !activeWeeklySnapshotId
                    }
                    className="rounded-md border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {marketBriefLoading === provider
                      ? "Analyzing…"
                      : `Analyze (${AI_PROVIDER_LABELS[provider]})`}
                  </button>
                ))}
              </div>
              {marketBriefError ? (
                <p className="text-xs text-red-600" role="alert">
                  {marketBriefError}
                </p>
              ) : null}
              {marketSummariesForActiveSnapshot.length > 0 ? (
                <p className="text-xs text-violet-800/80">
                  {marketSummariesForActiveSnapshot.length} market summar
                  {marketSummariesForActiveSnapshot.length === 1 ? "y" : "ies"} saved for this scan — expand
                  from the chips above.
                </p>
              ) : null}
            </div>
          </div>

          {marketBriefLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2 text-sm text-violet-900">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
              Building a market brief from {AI_PROVIDER_LABELS[marketBriefLoading]}…
            </div>
          ) : null}
          {expandedAiBrief?.briefType === "market" ? (
            <div className="w-full overflow-visible rounded-xl border border-violet-100 bg-white p-4 shadow-sm ring-1 ring-violet-50">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">
                  Market opportunities ·{" "}
                  {expandedAiBrief.provider ? AI_PROVIDER_LABELS[expandedAiBrief.provider] : "AI"}
                  {activeWeeklySnapshotId ? ` · scan #${activeWeeklySnapshotId}` : ""}
                  {` · summary #${expandedAiBrief.id}`}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedAiBriefId(null)}
                  className="text-xs font-medium text-violet-700 hover:text-violet-900"
                >
                  Collapse
                </button>
              </div>
              <PerplexityMarkdown markdown={expandedAiBrief.text} className="text-sm" />
            </div>
          ) : null}

          <div className="flex flex-col gap-4 border-t border-zinc-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-xs text-zinc-500">
              Each full scan writes a new snapshot. Summaries you generate stay attached to whichever scan
              is active above.
            </p>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <span className="text-xs text-zinc-500 sm:text-right">
                Rescan all symbols (Yahoo) and save a new row in SQLite, bypassing the time cache.
              </span>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => void loadWeeklyMovers()}
                  disabled={weeklyLoading || indexRefreshLoading}
                  className="rounded-md border border-teal-300 bg-white px-4 py-2.5 text-sm font-medium text-teal-900 shadow-sm hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {weeklyLoading ? "Scanning…" : "Run weekly scan"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWeeklySnapshotId("latest");
                    void loadWeeklyMovers({ forceRefresh: true });
                  }}
                  disabled={weeklyLoading || indexRefreshLoading}
                  className="rounded-md bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {weeklyLoading ? "Scanning…" : "Run full scan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {strategy === "volume" && scanStatus === "running" && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span>
            Running full scan over the current {`NIFTY ${niftyUniverse}`} list (NSE memory or
            embedded). Results appear after every symbol in that list is processed.
          </span>
        </div>
      )}
      {strategy === "volume" && scanStatus === "completed" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Scan completed. {symbolsScanned > 0 ? `Universe for this run: ${symbolsScanned} names. ` : null}
          Snapshot written to the database; table above shows filtered results.
        </div>
      )}
      {strategy === "weekly-movers" && weeklyScanStatus === "running" && (
        <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <span>
            Computing {weeklyLookbackDays}-day price moves for every symbol in NIFTY {niftyUniverse}.
          </span>
        </div>
      )}
      {strategy === "weekly-movers" && weeklyScanStatus === "completed" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Weekly scan completed. {weeklySymbolsScanned > 0 ? `Universe for this run: ${weeklySymbolsScanned} names. ` : null}
          {weeklyRows.length} movers match your filters.
          {!weeklyHistoricalView ? " Snapshot written to the database." : null}
        </div>
      )}
      {strategy === "volume" && error && <p className="text-sm text-red-600">{error}</p>}
      {strategy === "weekly-movers" && weeklyError && (
        <p className="text-sm text-red-600">{weeklyError}</p>
      )}

      <h2 className="text-lg font-medium">{title}</h2>
      {strategy === "volume" ? (
      <div className="w-full overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-[1520px] border-separate border-spacing-0 text-sm">
          <thead className="text-left">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-zinc-200/80 bg-zinc-100 px-3 py-2 text-zinc-900 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)]">
                Symbol
              </th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Industry</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Price</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Change %</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">PE</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Industry PE</th>
              <th
                className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2"
                title="Today's session volume divided by the pre-move 20-session baseline"
              >
                {TODAY_VOLUME_VS_BASELINE_LABEL}
              </th>
              <th
                className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2"
                title="Sessions in last X days with elevated volume (see filters)"
              >
                VB days
              </th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Breakout</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">SMA 50</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">SMA 200</th>
              <th
                className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2"
                title="50-day SMA vs 200-day SMA spread"
              >
                SMA spread
              </th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Golden cross</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">Screener</th>
              <th className="border-b border-zinc-200/80 bg-zinc-100 px-3 py-2">TradingView</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr className="border-t border-zinc-200">
                <td
                  colSpan={14}
                  className="px-3 py-10 text-center text-sm text-zinc-500"
                >
                  Scan in progress: results are hidden until every symbol in the selected NIFTY{" "}
                  {niftyUniverse} list for this run has been processed on the server.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => {
                const isSelected = selectedSymbol === row.symbol;
                const stripeClass = rowIndex % 2 === 1 ? "bg-zinc-50" : "bg-white";
                const rowBg = isSelected ? "bg-sky-50" : stripeClass;
                return (
                <tr
                  key={row.symbol}
                  className={`cursor-pointer border-t border-zinc-200 ${rowBg}`}
                  onClick={() => {
                    selectRowSymbol(row.symbol);
                    void loadDeepDive(row.symbol);
                  }}
                >
                  <td
                    className={`sticky left-0 z-20 isolate whitespace-nowrap border-r border-zinc-200 px-3 py-2 font-medium shadow-[4px_0_8px_-2px_rgba(0,0,0,0.1)] [background-clip:padding-box] ${rowBg}`}
                  >
                    {row.symbol}
                  </td>
                  <td className="px-3 py-2">{row.industry ?? "—"}</td>
                  <td className="px-3 py-2">{row.currentPrice.toFixed(2)}</td>
                  <td className="px-3 py-2">{row.priceChangePct.toFixed(2)}%</td>
                  <td className="px-3 py-2">{row.pe !== null ? row.pe.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2">
                    {row.industryPe !== null ? row.industryPe.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2">{row.volSpike.toFixed(2)}x</td>
                  <td className="px-3 py-2 tabular-nums">
                    <span className="font-medium">{row.volumeBuyingDays}</span>
                    <span className="text-zinc-400"> / {row.volumeBuyingLookback}</span>
                  </td>
                  <td className="px-3 py-2">{row.breakout ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.sma50 !== null ? row.sma50.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.sma200 !== null ? row.sma200.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.smaSpreadPct !== null ? `${row.smaSpreadPct >= 0 ? "+" : ""}${row.smaSpreadPct.toFixed(2)}%` : "—"}
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
                      onClick={(event) => event.stopPropagation()}
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
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Open ${row.symbol} on TradingView`}
                    >
                      <ExternalLinkIcon />
                    </a>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      ) : (
        <WeeklyMoversResultsTable
          rows={weeklyRows}
          loading={weeklyLoading}
          lookbackDays={weeklyLookbackDays}
          selectedSymbol={selectedSymbol}
          onSelect={(symbol) => {
            selectRowSymbol(symbol);
            void loadDeepDive(symbol);
          }}
        />
      )}

      <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50 via-white to-white p-5 shadow-lg shadow-slate-200/40">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Stock deep dive</h3>
              {selectedSymbol ? (
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {selectedSymbol}
                </span>
              ) : null}
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">
                Yahoo + NSE · delayed
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Quote, liquidity, valuation, Yahoo news & peers, daily volume history, and NSE bulk/block
              rows from the official large-deals snapshot (filtered to this symbol).
            </p>
          </div>
          {selectedSymbol ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                onClick={() => void loadDeepDive(selectedSymbol)}
                disabled={deepDiveLoading}
              >
                {deepDiveLoading ? "Loading…" : "Reload details"}
              </button>
              {(["gemini", "perplexity"] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
                  onClick={() => void loadAiBrief(provider)}
                  disabled={aiBriefLoading !== null}
                >
                  {aiBriefLoading === provider
                    ? "Searching…"
                    : strategy === "weekly-movers"
                      ? `Why did it move? (${AI_PROVIDER_LABELS[provider]})`
                      : `What's happening? (${AI_PROVIDER_LABELS[provider]})`}
                </button>
              ))}
            </div>
          ) : null}
          {strategy === "weekly-movers" && activeWeeklySnapshotId && selectedSymbol ? (
            <div className="w-full rounded-lg border border-violet-100 bg-violet-50/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">
                Saved for {selectedSymbol} · scan #{activeWeeklySnapshotId}
              </p>
              {stockSummariesForSelectedSymbol.length === 0 ? (
                <p className="mt-1 text-xs text-zinc-500">
                  No saved move rationale yet — use Why did it move? above.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {stockSummariesForSelectedSymbol.map((brief) => {
                    const isExpanded = expandedAiBriefId === brief.id;
                    return (
                      <button
                        key={brief.id}
                        type="button"
                        onClick={() => void toggleAiBriefExpand(brief.id)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                          isExpanded
                            ? "bg-violet-700 text-white ring-2 ring-violet-300"
                            : "border border-violet-200 bg-white text-violet-900 hover:border-violet-300 hover:bg-violet-50"
                        }`}
                      >
                        {formatAiBriefChipLabel(brief)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {deepDiveLoading && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-sm text-blue-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Fetching Yahoo data and NSE deal snapshot…
          </div>
        )}
        {deepDiveError && <p className="mb-3 text-sm text-red-600">{deepDiveError}</p>}

        {aiBriefLoading ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2 text-sm text-violet-900">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
            Fetching a live web summary from {AI_PROVIDER_LABELS[aiBriefLoading]}…
          </div>
        ) : null}
        {aiBriefError ? (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {aiBriefError}
          </p>
        ) : null}
        {strategy === "weekly-movers" && expandedAiBrief?.briefType === "stock" ? (
          <div className="mb-5 w-full overflow-visible rounded-xl border border-violet-100 bg-white p-4 shadow-sm ring-1 ring-violet-50">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">
                {expandedAiBrief.provider ? AI_PROVIDER_LABELS[expandedAiBrief.provider] : "AI"} · move
                rationale
                {activeWeeklySnapshotId ? ` · scan #${activeWeeklySnapshotId}` : ""}
                {` · summary #${expandedAiBrief.id}`}
              </div>
              <button
                type="button"
                onClick={() => setExpandedAiBriefId(null)}
                className="text-xs font-medium text-violet-700 hover:text-violet-900"
              >
                Collapse
              </button>
            </div>
            <PerplexityMarkdown markdown={expandedAiBrief.text} className="text-sm" />
          </div>
        ) : null}
        {strategy === "volume" && aiBriefText ? (
          <div className="mb-5 w-full overflow-visible rounded-xl border border-violet-100 bg-white p-4 shadow-sm ring-1 ring-violet-50">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">
              {aiBriefProvider ? AI_PROVIDER_LABELS[aiBriefProvider] : "AI"} · what&apos;s happening
            </div>
            <PerplexityMarkdown markdown={aiBriefText} className="text-sm" />
          </div>
        ) : null}

        {selectedRow && strategy === "volume" && (
          <div className="mb-5 grid gap-2 rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/40 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-900/90">
              From this scan
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <div className="text-[11px] font-medium text-amber-800/80">
                  {TODAY_VOLUME_VS_BASELINE_LABEL}
                </div>
                <div className="text-lg font-bold tabular-nums text-amber-950">
                  {selectedRow.volSpike.toFixed(2)}x
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-amber-800/80">Volume buying (last {selectedRow.volumeBuyingLookback}d)</div>
                <div className="text-lg font-bold tabular-nums text-amber-950">
                  {selectedRow.volumeBuyingDays}{" "}
                  <span className="text-sm font-normal text-amber-900/80">
                    hits · ≥{selectedRow.volumeBuyingMult}×20d
                    {selectedRow.volumeBuyingUpDayOnly ? " · up days" : ""}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-amber-800/80">
                  {BASELINE_VOLUME_LABEL} / today
                </div>
                <div className="text-sm font-semibold tabular-nums text-amber-950">
                  {formatInt(selectedRow.avgVolume20)} / {formatInt(selectedRow.currentVolume)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-amber-800/80">20d high close</div>
                <div className="text-sm font-semibold tabular-nums text-amber-950">
                  {formatDec(selectedRow.highestClose20)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-amber-800/80">Breakout flag</div>
                <div className="text-sm font-semibold text-amber-950">
                  {selectedRow.breakout ? "Yes" : "No"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-amber-800/80">50 / 200 SMA</div>
                <div className="text-sm font-semibold tabular-nums text-amber-950">
                  {selectedRow.sma50 !== null ? formatDec(selectedRow.sma50) : "—"} /{" "}
                  {selectedRow.sma200 !== null ? formatDec(selectedRow.sma200) : "—"}
                </div>
                <div className="text-xs text-amber-900/80">
                  {selectedRow.goldenCross
                    ? "Golden cross today"
                    : selectedRow.daysSinceGoldenCross !== null
                      ? `Cross ${selectedRow.daysSinceGoldenCross}d ago`
                      : "No recent cross"}
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedWeeklyRow && strategy === "weekly-movers" && (
          <div className="mb-5 grid gap-2 rounded-xl border border-teal-200/90 bg-gradient-to-r from-teal-50 to-emerald-50/40 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-teal-900/90">
              From this weekly scan
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <div className="text-[11px] font-medium text-teal-800/80">
                  {selectedWeeklyRow.lookbackDays}d move
                </div>
                <div
                  className={`text-lg font-bold tabular-nums ${
                    selectedWeeklyRow.periodChangePct >= 0 ? "text-emerald-800" : "text-rose-800"
                  }`}
                >
                  {formatPct(selectedWeeklyRow.periodChangePct)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-teal-800/80">Today</div>
                <div className="text-lg font-bold tabular-nums text-teal-950">
                  {formatPct(selectedWeeklyRow.dayChangePct)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-teal-800/80">Period high / low</div>
                <div className="text-sm font-semibold tabular-nums text-teal-950">
                  {formatDec(selectedWeeklyRow.periodHigh)} / {formatDec(selectedWeeklyRow.periodLow)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-teal-800/80">
                  {periodAvgVolumeChangeLabel(selectedWeeklyRow.lookbackDays)}
                </div>
                <div className="text-sm font-semibold tabular-nums text-teal-950">
                  {selectedWeeklyRow.volumeChangePct !== null
                    ? formatPct(selectedWeeklyRow.volumeChangePct)
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-teal-800/80">
                  {TODAY_VOLUME_VS_BASELINE_LABEL}
                </div>
                <div className="text-sm font-semibold tabular-nums text-teal-950">
                  {selectedWeeklyRow.volSpikeToday.toFixed(2)}×
                </div>
              </div>
            </div>
          </div>
        )}

        {deepDive && deepDive.symbol === selectedSymbol.replace(/\.NS$/i, "") && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    {deepDive.name ?? deepDive.symbol}
                  </p>
                  <p className="text-xs text-slate-500">
                    {deepDive.ticker}
                    {deepDive.exchange ? ` · ${deepDive.exchange}` : ""}
                    {deepDive.currency ? ` · ${deepDive.currency}` : ""}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {deepDive.quoteSource ?? "Quote"} · {deepDive.marketState ?? "—"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-md">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-white/70">
                    Last price
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{formatDec(deepDive.price)}</div>
                  <div className="mt-1 text-xs text-white/80">
                    Day {formatPct(deepDive.dayChangePct)} · Prev {formatDec(deepDive.previousClose)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/90 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Liquidity
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                    {deepDive.volumeVsAvg3Mo !== null ? `${deepDive.volumeVsAvg3Mo.toFixed(2)}x` : "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">vs 3-month average volume</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Market cap
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                    {formatInt(deepDive.marketCap)}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">52w {formatDec(deepDive.fiftyTwoWeekLow)} – {formatDec(deepDive.fiftyTwoWeekHigh)}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Valuation
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                    {formatDec(deepDive.trailingPe)}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Trailing PE · Fwd {formatDec(deepDive.forwardPe)} · P/B {formatDec(deepDive.priceToBook)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-5">
              <div className="space-y-4 xl:col-span-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-xs font-semibold text-slate-700">Session volume</div>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                      <li className="flex justify-between gap-2">
                        <span>Today</span>
                        <span className="font-medium tabular-nums text-slate-900">
                          {formatInt(deepDive.regularMarketVolume)}
                        </span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span>3-mo avg / day</span>
                        <span className="tabular-nums">{formatInt(deepDive.averageDailyVolume3Month)}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span>10-day avg / day</span>
                        <span className="tabular-nums">{formatInt(deepDive.averageDailyVolume10Day)}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span>Bid / Ask</span>
                        <span className="tabular-nums">
                          {formatDec(deepDive.bid)} / {formatDec(deepDive.ask)}
                        </span>
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="text-xs font-semibold text-slate-700">Positioning</div>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                      <li className="flex justify-between gap-2">
                        <span>Beta</span>
                        <span className="tabular-nums">{formatDec(deepDive.beta)}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span>PEG</span>
                        <span className="tabular-nums">{formatDec(deepDive.pegRatio)}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span>Institutional</span>
                        <span className="tabular-nums">
                          {deepDive.heldPercentInstitutions !== null
                            ? `${(deepDive.heldPercentInstitutions * 100).toFixed(1)}%`
                            : "—"}
                        </span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span>Insiders</span>
                        <span className="tabular-nums">
                          {deepDive.heldPercentInsiders !== null
                            ? `${(deepDive.heldPercentInsiders * 100).toFixed(1)}%`
                            : "—"}
                        </span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span>Short ratio</span>
                        <span className="tabular-nums">{formatDec(deepDive.shortRatio)}</span>
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:col-span-2">
                    <div className="text-xs font-semibold text-slate-700">Share structure</div>
                    <ul className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <li>
                        Outstanding:{" "}
                        <span className="font-medium tabular-nums text-slate-900">
                          {formatInt(deepDive.sharesOutstanding)}
                        </span>
                      </li>
                      <li>
                        Float:{" "}
                        <span className="font-medium tabular-nums text-slate-900">
                          {formatInt(deepDive.floatShares)}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-800">Daily volume &amp; range</h4>
                  <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 shadow-inner">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-left text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Close</th>
                          <th className="px-3 py-2 font-semibold">Volume</th>
                          <th className="px-3 py-2 font-semibold">High</th>
                          <th className="px-3 py-2 font-semibold">Low</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...deepDive.recentDays].reverse().map((day) => (
                          <tr key={day.date} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/50">
                            <td className="px-3 py-2 font-medium text-slate-800">{day.date}</td>
                            <td className="px-3 py-2 tabular-nums">{formatDec(day.close)}</td>
                            <td className="px-3 py-2 font-medium tabular-nums text-slate-900">
                              {formatInt(day.volume)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{formatDec(day.high)}</td>
                            <td className="px-3 py-2 tabular-nums">{formatDec(day.low)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {deepDive.peers.length > 0 && (
                  <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                    <h4 className="mb-2 text-sm font-semibold text-slate-800">Similar tickers (Yahoo)</h4>
                    <ul className="flex flex-wrap gap-2">
                      {deepDive.peers.map((peer) => (
                        <li
                          key={peer.symbol}
                          className="rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-xs font-medium text-indigo-900"
                        >
                          {peer.symbol}
                          {peer.score !== null ? (
                            <span className="text-indigo-600"> · {(peer.score * 100).toFixed(0)}%</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-sm font-semibold text-slate-800">Headlines</h4>
                  {deepDive.news.length === 0 ? (
                    <p className="text-xs text-slate-500">No news returned for this query.</p>
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {deepDive.news.map((article) => (
                        <li key={article.link} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <a
                            href={article.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-indigo-700 hover:underline"
                          >
                            {article.title}
                          </a>
                          <div className="text-xs text-slate-500">
                            {article.publisher}
                            {article.publishedAt
                              ? ` · ${new Date(article.publishedAt).toLocaleString()}`
                              : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="space-y-4 xl:col-span-2">
                <div className="rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white p-4 shadow-sm ring-1 ring-indigo-100">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-indigo-950">NSE bulk &amp; block deals</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-indigo-900/70">
                        Live snapshot from NSE large-deals feed, filtered to{" "}
                        <span className="font-semibold">{deepDive.symbol}</span>. Dates shown are as
                        reported by NSE in this snapshot (bulk and block can differ by session).
                      </p>
                    </div>
                    {deepDive.nseAsOnDate ? (
                      <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-800 ring-1 ring-indigo-100">
                        As on {deepDive.nseAsOnDate}
                      </span>
                    ) : null}
                  </div>

                  {deepDive.nseDealsError ? (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      NSE deals: {deepDive.nseDealsError}. You can still open the{" "}
                      <a
                        className="font-medium text-amber-950 underline"
                        href="https://www.nseindia.com/market-data/large-deals"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        NSE large deals
                      </a>{" "}
                      page directly.
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    <NseDealTable title="Bulk deals" rows={deepDive.nseBulkDeals} kindLabel="bulk" />
                    <NseDealTable title="Block deals" rows={deepDive.nseBlockDeals} kindLabel="block" />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-indigo-100 pt-3">
                    <a
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
                      href={getNseQuoteUrl(deepDive.symbol)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      NSE quote <ExternalLinkIcon className="h-3.5 w-3.5 opacity-90" />
                    </a>
                    <a
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                      href="https://www.nseindia.com/market-data/bulk-deals"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      All bulk deals <ExternalLinkIcon className="h-3.5 w-3.5 opacity-90" />
                    </a>
                    <a
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                      href="https://www.nseindia.com/market-data/block-deals"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      All block deals <ExternalLinkIcon className="h-3.5 w-3.5 opacity-90" />
                    </a>
                    <a
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                      href={getScreenerUrl(deepDive.symbol)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Screener <ExternalLinkIcon className="h-3.5 w-3.5 opacity-90" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!deepDiveLoading && !deepDive && selectedSymbol && !deepDiveError && (
          <p className="text-sm text-slate-600">
            Select a row in the table to load volume, fundamentals, NSE deals, and news below.
          </p>
        )}
      </section>
    </main>
  );
}

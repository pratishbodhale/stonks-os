const NSE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type NseDealRow = {
  date: string;
  kind: "bulk" | "block";
  symbol: string;
  name: string;
  clientName: string;
  buySell: string;
  qty: number | null;
  weightedAvgPrice: number | null;
  remarks: string | null;
};

type NseSnapshotRow = {
  date?: string;
  symbol?: string;
  name?: string;
  clientName?: string;
  buySell?: string;
  qty?: string | number;
  watp?: string | number;
  remarks?: string | null;
};

function parseQty(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bootstrapCookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    const parts = headers.getSetCookie().map((cookie) => cookie.split(";")[0]?.trim()).filter(Boolean);
    return parts.join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(",").map((c) => c.split(";")[0].trim()).join("; ") : "";
}

function mapRow(row: NseSnapshotRow, kind: "bulk" | "block"): NseDealRow {
  return {
    date: row.date ?? "",
    kind,
    symbol: String(row.symbol ?? ""),
    name: String(row.name ?? ""),
    clientName: String(row.clientName ?? ""),
    buySell: String(row.buySell ?? ""),
    qty: parseQty(row.qty),
    weightedAvgPrice: parsePrice(row.watp),
    remarks: row.remarks != null && row.remarks !== "-" ? String(row.remarks) : null,
  };
}

function filterAndSort(rows: NseDealRow[], symbol: string, limit: number): NseDealRow[] {
  const sym = symbol.toUpperCase().replace(/\.NS$/i, "");
  return rows
    .filter((row) => row.symbol.toUpperCase() === sym)
    .sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0))
    .slice(0, limit);
}

export async function fetchNseDealsForSymbol(symbol: string): Promise<{
  asOnDate: string | null;
  bulk: NseDealRow[];
  block: NseDealRow[];
  error: string | null;
}> {
  try {
    const init = await fetch("https://www.nseindia.com/", {
      headers: {
        "User-Agent": NSE_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const cookies = bootstrapCookieHeader(init);

    const response = await fetch("https://www.nseindia.com/api/snapshot-capital-market-largedeal", {
      headers: {
        "User-Agent": NSE_USER_AGENT,
        Cookie: cookies,
        Referer: "https://www.nseindia.com/market-data/large-deals",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        asOnDate: null,
        bulk: [],
        block: [],
        error: `NSE returned ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      as_on_date?: string;
      BULK_DEALS_DATA?: NseSnapshotRow[];
      BLOCK_DEALS_DATA?: NseSnapshotRow[];
    };

    const bulkRaw = Array.isArray(payload.BULK_DEALS_DATA) ? payload.BULK_DEALS_DATA : [];
    const blockRaw = Array.isArray(payload.BLOCK_DEALS_DATA) ? payload.BLOCK_DEALS_DATA : [];

    const bulk = filterAndSort(
      bulkRaw.map((row) => mapRow(row, "bulk")),
      symbol,
      30,
    );
    const block = filterAndSort(
      blockRaw.map((row) => mapRow(row, "block")),
      symbol,
      30,
    );

    return {
      asOnDate: payload.as_on_date ?? null,
      bulk,
      block,
      error: null,
    };
  } catch (error) {
    return {
      asOnDate: null,
      bulk: [],
      block: [],
      error: error instanceof Error ? error.message : "NSE deals fetch failed",
    };
  }
}

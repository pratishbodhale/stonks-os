import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

export type YahooSeries = {
  closes: number[];
  volumes: number[];
};

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

export const yahooClient = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export function toYahooTicker(symbol: string): string {
  return symbol.includes(".") ? symbol : `${symbol}.NS`;
}

export async function fetchYahooSeries(symbol: string): Promise<YahooSeries | null> {
  const url = `${YAHOO_URL}/${symbol}.NS?range=2y&interval=1d`;
  const response = await fetch(url, {
    next: { revalidate: 300 },
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as YahooChartResponse;
  const quote = data.chart?.result?.[0]?.indicators?.quote?.[0];
  if (!quote?.close || !quote?.volume) {
    return null;
  }

  const closes = quote.close.filter((value): value is number => Number.isFinite(value));
  const volumes = quote.volume.filter((value): value is number => Number.isFinite(value));
  if (closes.length < 25 || volumes.length < 25) {
    return null;
  }

  return { closes, volumes };
}

function pickPe(result: QuoteSummaryResult): number | null {
  const trailing = result.summaryDetail?.trailingPE;
  if (typeof trailing === "number" && Number.isFinite(trailing)) {
    return trailing;
  }
  const financialPe = result.financialData?.peRatio;
  if (typeof financialPe === "number" && Number.isFinite(financialPe)) {
    return financialPe;
  }
  const forward = result.summaryDetail?.forwardPE;
  if (typeof forward === "number" && Number.isFinite(forward)) {
    return forward;
  }
  return null;
}

function pickIndustry(result: QuoteSummaryResult): string | null {
  const fromProfile =
    result.summaryProfile?.industry?.trim() ||
    result.summaryProfile?.industryDisp?.trim() ||
    "";
  if (fromProfile) {
    return fromProfile;
  }
  const fromAsset =
    result.assetProfile?.industry?.trim() ||
    result.assetProfile?.industryDisp?.trim() ||
    "";
  return fromAsset || null;
}

export async function fetchYahooFundamentals(
  symbol: string,
): Promise<{ pe: number | null; industry: string | null }> {
  const ticker = toYahooTicker(symbol);
  try {
    const result = await yahooClient.quoteSummary(ticker, {
      modules: ["summaryProfile", "summaryDetail", "financialData", "assetProfile"],
    });
    return {
      pe: pickPe(result),
      industry: pickIndustry(result),
    };
  } catch {
    return { pe: null, industry: null };
  }
}

import { fetchNseDealsForSymbol } from "@/lib/nse-large-deals";
import type { NseDealRow } from "@/lib/nse-large-deals";
import { yahooClient, toYahooTicker } from "@/lib/yahoo";
import type { DefaultKeyStatistics, SummaryDetail } from "yahoo-finance2/modules/quoteSummary-iface";

export type StockDeepDiveNewsItem = {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string | null;
};

export type StockDeepDiveVolumeDay = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

export type StockDeepDivePeer = {
  symbol: string;
  score: number | null;
};

export type StockDeepDive = {
  symbol: string;
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  marketState: string | null;
  quoteSource: string | null;
  price: number | null;
  previousClose: number | null;
  dayChangePct: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  regularMarketVolume: number | null;
  averageDailyVolume3Month: number | null;
  averageDailyVolume10Day: number | null;
  volumeVsAvg3Mo: number | null;
  bid: number | null;
  ask: number | null;
  beta: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  heldPercentInstitutions: number | null;
  heldPercentInsiders: number | null;
  shortRatio: number | null;
  recentDays: StockDeepDiveVolumeDay[];
  news: StockDeepDiveNewsItem[];
  peers: StockDeepDivePeer[];
  /** NSE snapshot date for bulk/block tables (delayed; intraday snapshot). */
  nseAsOnDate: string | null;
  nseBulkDeals: NseDealRow[];
  nseBlockDeals: NseDealRow[];
  nseDealsError: string | null;
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchStockDeepDive(symbol: string): Promise<StockDeepDive> {
  const ticker = toYahooTicker(symbol.trim().toUpperCase());
  const empty = (base: string): StockDeepDive => ({
    symbol: base,
    ticker,
    name: null,
    exchange: null,
    currency: null,
    marketState: null,
    quoteSource: null,
    price: null,
    previousClose: null,
    dayChangePct: null,
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    regularMarketVolume: null,
    averageDailyVolume3Month: null,
    averageDailyVolume10Day: null,
    volumeVsAvg3Mo: null,
    bid: null,
    ask: null,
    beta: null,
    trailingPe: null,
    forwardPe: null,
    pegRatio: null,
    priceToBook: null,
    sharesOutstanding: null,
    floatShares: null,
    heldPercentInstitutions: null,
    heldPercentInsiders: null,
    shortRatio: null,
    recentDays: [],
    news: [],
    peers: [],
    nseAsOnDate: null,
    nseBulkDeals: [],
    nseBlockDeals: [],
    nseDealsError: null,
  });

  const base = symbol.trim().toUpperCase().replace(/\.NS$/i, "");

  try {
    const period1 = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const settled = await Promise.allSettled([
      yahooClient.quote(ticker),
      yahooClient.chart(ticker, { period1, interval: "1d" }),
      yahooClient.quoteSummary(ticker, { modules: ["defaultKeyStatistics", "summaryDetail"] }),
      yahooClient.search(`${base} stock India`, { newsCount: 10, quotesCount: 0 }),
      yahooClient.recommendationsBySymbol(ticker),
      fetchNseDealsForSymbol(base),
    ]);

    const quoteResult = settled[0].status === "fulfilled" ? settled[0].value : null;
    const chartResult = settled[1].status === "fulfilled" ? settled[1].value : null;
    type SummarySlice = {
      defaultKeyStatistics?: DefaultKeyStatistics;
      summaryDetail?: SummaryDetail;
    };
    const summaryResult: SummarySlice =
      settled[2].status === "fulfilled" ? settled[2].value : {};
    const searchResult =
      settled[3].status === "fulfilled" ? settled[3].value : { news: [] };
    const recResult = settled[4].status === "fulfilled" ? settled[4].value : null;
    const nseResult =
      settled[5].status === "fulfilled"
        ? settled[5].value
        : {
            asOnDate: null as string | null,
            bulk: [] as NseDealRow[],
            block: [] as NseDealRow[],
            error:
              settled[5].status === "rejected"
                ? String(settled[5].reason instanceof Error ? settled[5].reason.message : settled[5].reason)
                : "NSE deals unavailable",
          };

    if (!quoteResult) {
      return empty(base);
    }

    const q = quoteResult as Record<string, unknown>;
    const price = num(q.regularMarketPrice);
    const prev = num(q.regularMarketPreviousClose ?? q.previousClose);
    const dayChg = num(q.regularMarketChangePercent);
    const vol = num(q.regularMarketVolume);
    const avg3 = num(q.averageDailyVolume3Month);
    const volVsAvg3 = vol !== null && avg3 !== null && avg3 > 0 ? vol / avg3 : null;

    const chart = (chartResult ?? { quotes: [] }) as { quotes?: Array<Record<string, unknown>> };
    const rawQuotes = Array.isArray(chart.quotes) ? chart.quotes : [];
    const recentDays: StockDeepDiveVolumeDay[] = rawQuotes
      .filter((row) => row.date instanceof Date && row.volume != null)
      .slice(-15)
      .map((row) => ({
        date: formatDate(row.date as Date),
        open: num(row.open),
        high: num(row.high),
        low: num(row.low),
        close: num(row.close),
        volume: num(row.volume),
      }));

    const dks = summaryResult.defaultKeyStatistics;
    const sd = summaryResult.summaryDetail;

    const news: StockDeepDiveNewsItem[] = (searchResult.news ?? [])
      .slice(0, 10)
      .map((article) => ({
        title: article.title,
        publisher: article.publisher,
        link: article.link,
        publishedAt:
          article.providerPublishTime instanceof Date
            ? article.providerPublishTime.toISOString()
            : null,
      }));

    let peers: StockDeepDivePeer[] = [];
    if (recResult && typeof recResult === "object") {
      const block = Array.isArray(recResult) ? recResult[0] : recResult;
      if (block && typeof block === "object" && "recommendedSymbols" in block) {
        const list = (block as { recommendedSymbols?: Array<{ symbol?: string; score?: number }> })
          .recommendedSymbols;
        if (Array.isArray(list)) {
          peers = list.slice(0, 8).map((item) => ({
            symbol: String(item.symbol ?? "").replace(/\.NS$/i, ""),
            score: typeof item.score === "number" ? item.score : null,
          }));
        }
      }
    }

    return {
      symbol: base,
      ticker,
      name: (q.longName as string) || (q.shortName as string) || null,
      exchange: (q.fullExchangeName as string) || (q.exchange as string) || null,
      currency: (q.currency as string) || null,
      marketState: (q.marketState as string) || null,
      quoteSource: (q.quoteSourceName as string) || null,
      price,
      previousClose: prev,
      dayChangePct: dayChg,
      marketCap: num(q.marketCap),
      fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
      regularMarketVolume: vol,
      averageDailyVolume3Month: avg3,
      averageDailyVolume10Day: num(q.averageDailyVolume10Day),
      volumeVsAvg3Mo: volVsAvg3,
      bid: num(q.bid),
      ask: num(q.ask),
      beta: num(dks?.beta ?? sd?.beta),
      trailingPe: num(sd?.trailingPE),
      forwardPe: num(dks?.forwardPE ?? sd?.forwardPE),
      pegRatio: num(dks?.pegRatio),
      priceToBook: num(dks?.priceToBook),
      sharesOutstanding: num(dks?.sharesOutstanding),
      floatShares: num(dks?.floatShares),
      heldPercentInstitutions: num(dks?.heldPercentInstitutions),
      heldPercentInsiders: num(dks?.heldPercentInsiders),
      shortRatio: num(dks?.shortRatio),
      recentDays,
      news,
      peers,
      nseAsOnDate: nseResult.asOnDate,
      nseBulkDeals: nseResult.bulk,
      nseBlockDeals: nseResult.block,
      nseDealsError: nseResult.error,
    };
  } catch {
    return empty(base);
  }
}

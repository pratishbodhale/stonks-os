export type StockBriefInput = {
  symbol: string;
  name?: string | null;
  isWeeklyMover?: boolean;
  periodChangePct?: number;
  lookbackDays?: number;
};

export type MarketBriefMover = {
  symbol: string;
  periodChangePct: number;
  industry?: string | null;
};

export type MarketBriefInput = {
  movers: MarketBriefMover[];
  lookbackDays: number;
  niftyUniverse: string;
  direction: string;
};

const STOCK_BRIEF_SYSTEM =
  "You are a concise markets assistant. Ground answers in web search when possible; note uncertainty when sources conflict or are missing.";

const MARKET_BRIEF_SYSTEM =
  "You are a concise Indian markets analyst. Ground answers in web search; note uncertainty when sources conflict.";

export function buildStockBriefPrompt(input: StockBriefInput): {
  system: string;
  user: string;
  searchRecency: "week" | "month";
} {
  const name = input.name?.trim();
  const companyLine = name ? `Company / issuer name (if helpful): ${name}.` : "";
  const lookbackDays = input.lookbackDays ?? 5;
  const moveLine =
    typeof input.periodChangePct === "number" && Number.isFinite(input.periodChangePct)
      ? `The stock moved ${input.periodChangePct >= 0 ? "+" : ""}${input.periodChangePct.toFixed(2)}% over the last ${lookbackDays} trading sessions in our scan.`
      : "";

  const user = input.isWeeklyMover
    ? `You are explaining why an Indian stock had a large recent price move for an NSE-listed equities trader.

Stock ticker: ${input.symbol}. ${companyLine}
${moveLine}

Using current web sources, explain the rationale behind this move in clear prose (short sections or bullets). Cover: earnings, guidance, orders, sector tailwinds/headwinds, policy, bulk/block deal chatter, analyst actions, and peer read-through. Separate confirmed catalysts from speculation. Prefer India / NSE context. If the move lacks a clear narrative in sources, say that and note possible technical or flow-driven explanations.

End with one sentence: this is informational only and not financial advice.`
    : `You are summarizing recent, market-relevant developments for an Indian equities trader (NSE-listed names).

Stock ticker: ${input.symbol}. ${companyLine}

Using current web sources, explain what is happening with this stock lately in clear prose (short sections or bullets). Cover: notable news, earnings or corporate actions if any, sector or regulatory context, and any widely reported drivers of price or volume. Prefer India / NSE context when relevant. If recent coverage is thin, say that plainly.

End with one sentence: this is informational only and not financial advice.`;

  return {
    system: STOCK_BRIEF_SYSTEM,
    user,
    searchRecency: input.isWeeklyMover ? "week" : "month",
  };
}

export function buildMarketBriefPrompt(input: MarketBriefInput): { system: string; user: string } {
  const moverLines = input.movers
    .slice(0, 25)
    .map((m) => {
      const ind = m.industry ? ` (${m.industry})` : "";
      const sign = m.periodChangePct >= 0 ? "+" : "";
      return `- ${m.symbol}${ind}: ${sign}${m.periodChangePct.toFixed(2)}%`;
    })
    .join("\n");

  const user = `You are helping an Indian equities trader (NSE-listed names) understand what moved in the market recently and where new opportunities may be emerging.

Universe: NIFTY ${input.niftyUniverse} constituents.
Lookback: last ${input.lookbackDays} trading sessions (~1 week).
Filter: ${input.direction}.

Top movers in this scan:
${moverLines}

Using current web sources, write a concise market brief for an Indian trader:

1. **What drove the big moves** — group by theme (sector, policy, earnings, global cues, etc.) and explain the main narratives behind the gainers and losers above.
2. **Emerging opportunities** — sectors or themes gaining momentum, second-order plays, or setups worth watching next week (not buy/sell calls — observation only).
3. **Risks & caveats** — what could reverse these moves or where news may be priced in.

Prefer India / NSE context. If coverage is thin, say so. End with one sentence: informational only, not financial advice.`;

  return { system: MARKET_BRIEF_SYSTEM, user };
}

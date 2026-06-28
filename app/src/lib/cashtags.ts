/** Normalized cashtag token from social text (without leading $). */
export type CashtagCount = {
  symbol: string;
  mentions: number;
};

/** Words that often appear as fake cashtags — exclude from rankings. */
const CASHTAG_STOPWORDS = new Set([
  "AND",
  "FOR",
  "YOU",
  "THE",
  "NOT",
  "ARE",
  "ITS",
  "CAN",
  "CEO",
  "IMO",
  "LOL",
  "USA",
  "USD",
  "EUR",
  "GBP",
  "ADHD",
]);

/**
 * Extract cashtags like `$AAPL` or `$RELIANCE` from text.
 * Uses letter-only symbols (2–15 chars), uppercase for aggregation.
 */
export function extractCashtags(text: string): string[] {
  const upper = text.toUpperCase();
  const re = /\$([A-Z]{2,15})\b/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(upper)) !== null) {
    const sym = match[1];
    if (!CASHTAG_STOPWORDS.has(sym)) {
      found.push(sym);
    }
  }
  return found;
}

export function aggregateCashtagCounts(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const sym of extractCashtags(text)) {
      counts.set(sym, (counts.get(sym) ?? 0) + 1);
    }
  }
  return counts;
}

export function countsToSortedRankings(counts: Map<string, number>, limit: number): CashtagCount[] {
  return [...counts.entries()]
    .map(([symbol, mentions]) => ({ symbol, mentions }))
    .sort((a, b) => b.mentions - a.mentions || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, limit));
}

# Shared Library

## Purpose

Business logic, data access, external API clients, and canonical types. API routes and pages import from here rather than embedding logic.

## Module dependency graph

```
types.ts ─────────────────────────────────────────┐
db.ts ◄── snapshots, FCM tokens, daily runs,    │
         nifty index cache                       │
                                                 ▼
nifty-constituents.ts ◄── embedded JSON + in-memory NSE lists
         ▲
nifty-index-server.ts (server-only) ── hydrates from db, persists NSE refresh
         │
yahoo.ts ──► signals.ts ──► scanSymbols / buildSignal
         │         │
         │         └── SMA, golden cross, volume buying, breakout
         │
stock-deep-dive.ts ──► nse-large-deals.ts
volume-baseline.ts ── pre-move 20-session volume average (excludes lookback window)
weekly-movers.ts ──► weekly-mover-sort.ts
daily-volume-scan.ts ── volume spike filters and constants
daily-scan.ts ── multi-strategy cron orchestration
market-brief.ts ── shared Perplexity/Gemini market brief generation
market-hours.ts ── IST trading day / post-close
firebase-admin.ts ──► db (tokens), stock-links
firebase-client.ts ── web config (client-safe)
cashtags.ts ── Reddit cashtag parsing
stock-links.ts ── Screener, TradingView, run URLs
strip-thinking-tags.ts ── Perplexity response cleanup
```

## File responsibilities

| Module | Responsibility |
|--------|----------------|
| `types.ts` | `SymbolSnapshot`, `ScanResult`, `SocialNote` — canonical data shapes |
| `db.ts` | SQLite (`data/scanner.db`): snapshots, snapshot_rows, weekly_mover_snapshots, weekly_mover_snapshot_rows, weekly_mover_ai_briefs, fcm_tokens, daily_scan_runs, nifty_index_cache; schema migrations via `ensureColumnExists` |
| `yahoo.ts` | Chart fetch (raw HTTP) + `quoteSummary` via yahoo-finance2; `toYahooTicker()` appends `.NS` |
| `signals.ts` | Signal engine: vol spike, breakout, volume-buying days, SMA 50/200, golden cross; `scanSymbols()` with concurrency=20 |
| `nifty-constituents.ts` | NIFTY 50/200/500 embedded JSON + NSE CSV fetch + in-process `symbolListMemory` |
| `nifty-index-server.ts` | **Server-only** (`import "server-only"`): DB hydrate, persist NSE refresh, stale refresh (30-day for NIFTY 500) |
| `daily-volume-scan.ts` | Volume spike constants/filters; `DAILY_VOLUME_SPIKE_THRESHOLD=5`, `DAILY_SCAN_UNIVERSE="500"` |
| `daily-scan.ts` | Multi-strategy cron orchestration (volume + weekly movers + AI market brief); idempotent per IST date |
| `market-brief.ts` | Shared market brief generation via Perplexity/Gemini; persists to `weekly_mover_ai_briefs` |
| `weekly-movers.ts` | Weekly price-move scan; lookback window, gainers/losers filters; `scanWeeklyMovers()` |
| `weekly-mover-sort.ts` | Shared sort comparators for weekly mover table columns |
| `volume-baseline.ts` | Pre-move 20-session volume average; excludes recent lookback window from baseline |
| `market-hours.ts` | `formatIstDateKey`, `isNseTradingDay`, `isAfterNseMarketClose` |
| `stock-deep-dive.ts` | Rich per-symbol view: quote, chart, fundamentals, news, peers, NSE deals |
| `nse-large-deals.ts` | NSE cookie bootstrap + large-deals API; filter by symbol |
| `firebase-admin.ts` | FCM multicast; prune invalid tokens |
| `firebase-client.ts` | Public Firebase web config + VAPID key (client-safe) |
| `cashtags.ts` | `$TICKER` extraction and ranking for Reddit |
| `stock-links.ts` | External URL builders (Screener, TradingView, run detail) |
| `strip-thinking-tags.ts` | Remove `` blocks from LLM output |
| `stock-analysis-prompts.ts` | Shared prompts for Perplexity/Gemini stock & market briefs |
| `perplexity.ts` | Perplexity Sonar client |
| `gemini.ts` | Gemini generateContent client with Google Search grounding |
| `embedded-nifty-{50,200,500}.json` | Offline fallback constituent lists |

## Scan pipeline

1. `getIndexSymbolsForScan(universe)` → memory NSE list or embedded JSON
2. `scanSymbols(symbols, volumeBuyingOpts)` → parallel Yahoo fetches (batch concurrency 20 manual / 15 cron)
3. `buildSignal()` computes per-symbol metrics; post-pass fills `industryPe` averages
4. `saveSnapshot()` writes **full universe** to SQLite (all symbols, not just filtered)
5. API route applies client filters and returns top `limit` rows sorted by `volumeBuyingDays` → `volSpike` → `priceChangePct`

## Weekly movers pipeline

1. `getIndexSymbolsForScan(universe)` → same constituent resolution as volume scan
2. `scanWeeklyMovers(symbols, lookbackDays)` → parallel Yahoo fetches
3. `saveWeeklyMoverSnapshot()` writes **full universe** to `weekly_mover_snapshots` / `weekly_mover_snapshot_rows`
4. API route applies direction (`gainers`|`losers`|`both`) and `minAbsChangePct` filters
5. AI briefs (`market-brief.ts`, `stock-analysis-prompts.ts`) persist to `weekly_mover_ai_briefs` when snapshot ID provided

## Daily evaluation pipeline (`daily-scan.ts`)

1. Gate on IST trading day, post-close, idempotency (unless overridden)
2. Refresh NSE index if stale (30-day interval for NIFTY 500)
3. Parallel: volume scan + weekly movers (concurrency 15) on NIFTY 500
4. Record `daily_scan_runs` linking both snapshot IDs with spike/gainer counts
5. Generate AI market brief if gainers exist
6. Cron route sends FCM `daily_scan` notification with top spikes and gainers

## Conventions

- **`nifty-index-server.ts` is server-only** — never import from client components
- **Embedded JSON fallbacks** when NSE lists are not refreshed in the current process
- **SQLite WAL mode**; `data/` directory auto-created by `db.ts`
- **Indian tickers**: bare symbols in app code; always `.NS` at the Yahoo boundary
- **DB migrations**: add columns via `ensureColumnExists` try/catch pattern in `db.ts`
- New signal metrics belong in `signals.ts` and `types.ts`; persist new columns in `db.ts` snapshot_rows mapping

## Related docs

- API layer: `src/app/api/AGENTS.md`
- Database file: `data/AGENTS.md`

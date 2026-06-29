# API Routes

## Purpose

HTTP layer for scanning, persistence, external integrations, and scheduled jobs. Routes should stay thin — delegate business logic to `src/lib/`.

## Route reference

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/scan` | GET | Core scanner: Yahoo scan → filter → SQLite snapshot; 10-min in-memory cache per universe |
| `/api/snapshots` | GET | List last 50 volume-scan snapshot metadata rows |
| `/api/weekly-movers` | GET | Weekly price-move scan → filter → SQLite snapshot; 10-min in-memory cache per universe |
| `/api/weekly-mover-snapshots` | GET | List last 50 weekly-mover snapshot metadata rows |
| `/api/weekly-mover-ai-briefs` | GET | List or fetch saved weekly-mover AI briefs (`?id=`, `?snapshotId=`, `?briefType=`, `?symbol=`) |
| `/api/nifty-index/refresh` | GET | Pull NSE CSV → memory + SQLite `nifty_index_cache` |
| `/api/nifty-index/status` | GET | Which universes have hydrated NSE constituent lists |
| `/api/stock-details` | GET | `?symbol=` → full `StockDeepDive` (Yahoo + NSE deals) |
| `/api/stock-perplexity` | POST | `{ symbol, name?, strategy? }` → Perplexity Sonar brief; persists to `weekly_mover_ai_briefs` when `strategy=weekly-mover` + snapshot ID |
| `/api/stock-gemini` | POST | `{ symbol, name?, strategy? }` → Gemini brief; same persistence rules as Perplexity |
| `/api/market-opportunities` | POST | `{ movers, provider?, weeklyMoverSnapshotId?, ... }` → market brief via Perplexity or Gemini; persists when `weeklyMoverSnapshotId` set |
| `/api/reddit-trending` | GET | Cashtag rankings from Reddit OAuth multireddit |
| `/api/fcm-token` | POST | `{ token }` → persist FCM device token |
| `/api/daily-scan/run` | POST | Manual NIFTY 500 daily scan from UI (`force` + `skipMarketCheck` default true; push by default) |
| `/api/cron/daily-volume-scan` | GET | Manual/ops trigger for NIFTY 500 scan + FCM push (`maxDuration=300`); scheduled runs use in-process cron |
| `/api/notes` | GET/POST | JSON-file CRUD for `SocialNote` — **no UI consumer** |

## `/api/scan` query parameters

**Filters:** `minVolSpike`, `breakoutOnly`, `lookbackDays`, `minVolumeBuyingDays`, `volumeBuyingMult`, `volumeBuyingUpDayOnly`, `goldenCrossOnly`, `goldenCrossWithinDays`, `limit`

**Control:** `forceRefresh`, `snapshotId`, `niftyUniverse` (50|200|500, default 200)

**Behavior:**
- Per-universe in-memory cache (`cacheByUniverse`), 10-minute window; invalidates when volume-buying params change
- `snapshotId` → historical mode: read SQLite only, no Yahoo fetch
- Saves full universe to SQLite; API applies client filters and returns top `limit` rows

## `/api/weekly-movers` query parameters

**Filters:** `lookbackDays`, `direction` (gainers|losers|both), `minAbsChangePct`, `limit`

**Control:** `forceRefresh`, `snapshotId`, `niftyUniverse` (50|200|500, default 200)

**Behavior:** Same snapshot pattern as `/api/scan` — full universe persisted to `weekly_mover_snapshots` / `weekly_mover_snapshot_rows`; client filters applied on read.

## `/api/daily-scan/run`

- **POST** — trigger from UI; no cron auth required
- Body/query: `force` (default `true`), `skipMarketCheck` (default `true`), `sendNotification` (default `true`), `includeAiAnalysis` (default `true`), `aiProvider` (`perplexity`|`gemini`, optional)
- Flow: `executeDailyScanJob()` — volume + weekly movers + AI market brief; push when `sendNotification=true` (default)

## `/api/cron/daily-volume-scan`

- Auth: `Authorization: Bearer ${CRON_SECRET}` (unauthenticated in dev if `CRON_SECRET` unset)
- Scheduled runs: in-process cron (`daily-scan-scheduler.ts`) at 16:30 IST weekdays — not Vercel
- Skips: non-trading day, before NSE close (15:30 IST), already ran today (IST date key)
- Overrides: `?force=true`, `?skipMarketCheck=true`
- Flow: `runDailyScan()` (volume + weekly movers + AI market brief) → `sendDailyScanNotification()`

## Error handling

- JSON errors: `{ error: string }` with appropriate HTTP status
- Missing integration env vars → **503** (Perplexity, Gemini, Reddit)
- Most routes: `export const dynamic = "force-dynamic"`

## Conventions

- Import from `@/lib/*` — do not embed scan logic, Yahoo calls, or DB queries in route files
- Scan route holds **module-level in-memory cache** that survives across requests in the same server process; consider cache invalidation when changing scan behavior
- Cron route must respect `market-hours.ts` gating unless override query params are used

## Related docs

- Scan pipeline: `src/lib/AGENTS.md` (`signals.ts`, `yahoo.ts`, `db.ts`)
- Firebase push: `src/lib/firebase-admin.ts`
- Daily cron orchestration: `src/lib/daily-scan.ts`

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# StonksOS — Indian Stock Scanner

Monorepo location: **`app/`** inside [StonksOS](../README.md). All paths below are relative to `app/`. User-facing setup: [README.md](./README.md).

Next.js 16 full-stack app for Indian equity market analysis. Two interactive scanner strategies (volume + movers), automated daily evaluations on NIFTY 500, AI briefs, Firebase push, and Reddit trending. Yahoo Finance supplies market data; NSE supplies index constituents and bulk/block deals; SQLite persists scan history.

## Product surface

| Area | Routes / entry points |
|------|----------------------|
| **Scanner dashboard** | `/` — strategy tabs, scans, deep dive, AI briefs, Reddit sidebar |
| **Daily run history** | `/runs` — last 60 IST dates with links to both snapshot types |
| **Volume run detail** | `/runs/[snapshotId]` — spikes ≥5× (daily threshold) |
| **Movers run detail** | `/runs/weekly/[snapshotId]` — gainers ≥3% + AI market brief |
| **Scheduled job** | In-process cron (`daily-scan-scheduler.ts`) — weekdays 16:30 IST; also `GET /api/cron/daily-volume-scan` for manual triggers |
| **Manual daily job** | `/api/daily-scan/run` (UI button) |

**Branding:** layout metadata uses **StonksOS**; home H1 is **Indian Stock Scanner**. Nav: **Scanner** | **Daily runs** (`SiteHeader`).

## Analysis strategies

### Volume analysis
Signal engine (`signals.ts`): vol spike vs pre-move 20-session baseline (`volume-baseline.ts`), breakout, volume-buying days, SMA 50/200, golden cross. Manual scans default NIFTY **200**; daily cron uses **500** with **5×** spike threshold.

### Movers analysis
Weekly price-move scan (`weekly-movers.ts`): period change %, volume context, PE. UI defaults to **gainers**, 5-day lookback, 3% min move. Daily cron uses same thresholds. AI market briefs (`market-brief.ts`) and per-stock move rationale briefs persist to `weekly_mover_ai_briefs`.

## Stack

- **Next.js 16.2** (App Router) + **React 19**
- **Tailwind CSS v4**
- **better-sqlite3** — local persistence in `data/scanner.db`
- **yahoo-finance2** — quotes and fundamentals
- **Firebase** — web push (client + service worker + admin)
- **Perplexity / Gemini** — optional AI briefs
- **Reddit OAuth** — optional trending cashtags

## Folder map

| Path | Role |
|------|------|
| `src/app/` | Pages and API routes — see `src/app/AGENTS.md` |
| `src/app/api/` | HTTP layer — see `src/app/api/AGENTS.md` |
| `src/lib/` | Business logic, data access, external clients — see `src/lib/AGENTS.md` |
| `src/components/` | Shared UI — see `src/components/AGENTS.md` |
| `public/` | Static assets and FCM service worker — see `public/AGENTS.md` |
| `data/` | SQLite database — see `data/AGENTS.md` |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATA_DIR` | Directory for SQLite DB and JSON sidecars (default: `data/` under cwd; Docker default: `/app/data`) |
| `DATABASE_PATH` | Full path to SQLite file (default: `$DATA_DIR/scanner.db`) |
| `CRON_SECRET` | Bearer token for manual `GET /api/cron/daily-volume-scan` (open in dev if unset) |
| `DAILY_SCAN_CRON_ENABLED` | Enable in-process scheduler (`true`/`false`; default: on in production, off in dev) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_CREDENTIALS` | Server-side FCM |
| `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Client FCM (defaults baked in) |
| `NEXT_PUBLIC_APP_URL` | Absolute URLs in push notifications |
| `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` | Stock and market briefs (Perplexity Sonar) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Stock and market briefs (Gemini + Google Search grounding) |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Reddit trending cashtags |

## Scheduled jobs

The server starts an in-process scheduler (`daily-scan-scheduler.ts` via `instrumentation.ts`) on weekdays at **16:30 IST** when `DAILY_SCAN_CRON_ENABLED` is on (default in production). Orchestrated by `executeDailyScanJob()` in `daily-scan.ts`:

- Gates: NSE trading day, post-close (15:30 IST), idempotency per IST date (overridable via `?force=true`, `?skipMarketCheck=true`)
- Scans NIFTY 500: volume signals + weekly movers in parallel
- Persists both snapshot types; records `daily_scan_runs` with spike/gainer counts
- Generates AI market brief when gainers exist
- Sends FCM push (`type: daily_scan`) with top spikes and gainers

## Conventions

- Path alias: `@/*` → `./src/*`
- Indian tickers are bare symbols (`RELIANCE`); Yahoo layer appends `.NS`
- IST market logic lives in `src/lib/market-hours.ts`
- Delegate logic to `src/lib/` — keep routes and pages thin
- Never commit `firebase-credentials.json`, `.env*`, or other secrets
- Manual dashboard scans default NIFTY **200**; automated daily cron uses **500**
- Home page default strategy is **movers** (`weekly-movers`)

## Git commits

When creating commits for the StonksOS monorepo:

- **Never commit secrets** — exclude `.env`, `.env.*`, `firebase-credentials.json`, API keys, tokens, service-account JSON, and any file containing credentials or personal data.
- Before `git add`, review `git status` and `git diff`; unstaged paths that look like env files, credential dumps, or archives (e.g. `*.zip`) should stay out of the commit unless explicitly requested.
- Do not commit local SQLite WAL sidecars (`scanner.db-wal`, `scanner.db-shm`) or other ephemeral runtime artifacts unless the user explicitly asks to version database state.
- If the user asks to commit and a staged file might contain secrets, warn them and omit it from the commit.

## Legacy / gaps

- `/api/notes` and `SocialNote` type exist but have no UI consumer
- `FcmRegistration.tsx` is unused; `NotificationSetup` is the active FCM path
- `page.tsx` defines an inline `ExternalLinkIcon` instead of importing from `components/`
- `PLAN.md` describes an earlier V1 scope (NIFTY 200 only); the app now supports 50/200/500 with daily cron on 500
- Interactive movers UI only exposes **gainers**; API supports losers/both
- `runDailyVolumeScan()` is a deprecated wrapper around `runDailyScan()`

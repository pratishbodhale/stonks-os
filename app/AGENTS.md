<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Indian Volume Scanner

Monorepo location: **`app/`** inside [StonksOS](../README.md). All paths below are relative to `app/`. User-facing setup: [README.md](./README.md).

Next.js 16 full-stack app that scans Indian equities (NIFTY 50/200/500) for volume spikes, breakouts, golden crosses, and related signals. Yahoo Finance supplies market data; NSE supplies index constituents and bulk/block deals; SQLite persists scan history; Firebase delivers push notifications; Perplexity and Reddit are optional enrichments.

## Stack

- **Next.js 16.2** (App Router) + **React 19**
- **Tailwind CSS v4**
- **better-sqlite3** — local persistence in `data/scanner.db`
- **yahoo-finance2** — quotes and fundamentals
- **Firebase** — web push (client + service worker + admin)

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
| `CRON_SECRET` | Bearer token for `/api/cron/daily-volume-scan` (open in dev if unset) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_CREDENTIALS` | Server-side FCM |
| `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Client FCM (defaults baked in) |
| `NEXT_PUBLIC_APP_URL` | Absolute URLs in push notifications |
| `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` | Stock brief API (Perplexity Sonar) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Stock brief API (Gemini + Google Search grounding) |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Reddit trending cashtags |

## Scheduled jobs

`vercel.json` runs `/api/cron/daily-volume-scan` at `0 11 * * 1-5` (11:00 UTC ≈ 16:30 IST on weekdays). The route gates on NSE trading days, post-close time, and idempotency per IST date. Each run executes volume analysis and weekly movers (NIFTY 500).

## Conventions

- Path alias: `@/*` → `./src/*`
- Indian tickers are bare symbols (`RELIANCE`); Yahoo layer appends `.NS`
- IST market logic lives in `src/lib/market-hours.ts`
- Delegate logic to `src/lib/` — keep routes and pages thin
- Never commit `firebase-credentials.json`, `.env*`, or other secrets

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

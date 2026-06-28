# Indian Volume Scanner

Next.js full-stack app that scans Indian equities (NIFTY 50/200/500) for volume spikes, breakouts, golden crosses, and related signals. Yahoo Finance supplies market data; NSE supplies index constituents and bulk/block deals; SQLite persists scan history; Firebase delivers push notifications; Perplexity and Reddit are optional enrichments.

Part of the [StonksOS](../README.md) monorepo — run all commands below from **`app/`**.

For architecture, conventions, and agent context, see [AGENTS.md](./AGENTS.md).

## Prerequisites

- Node.js 20+
- Optional: Firebase service account JSON, Perplexity/Gemini/Reddit API keys (see environment variables below)

## Development (port 3000)

From **`app/`**:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create `app/.env.local` (never commit secrets):

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

`vercel.json` runs `/api/cron/daily-volume-scan` at `0 11 * * 1-5` (11:00 UTC ≈ 16:30 IST on weekdays). The route gates on NSE trading days, post-close time, and idempotency per IST date.

## Production

```bash
npm run build
npm start
```

Deploy on Vercel with the cron schedule in `vercel.json`, or run on any Node host with a persistent filesystem for `data/scanner.db`.

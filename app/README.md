# StonksOS — Indian Stock Scanner

Next.js full-stack app for Indian equity market analysis: interactive **volume** and **movers** scanners, automated **daily evaluations** after NSE close, AI market/stock briefs, push notifications, and Reddit trending cashtags. Covers NIFTY 50/200/500.

Part of the [StonksOS](../README.md) monorepo — run all commands below from **`app/`**.

For architecture, conventions, and agent context, see [AGENTS.md](./AGENTS.md).

## Features

### Scanner dashboard (`/`)

Two analysis strategies, switchable via tabs (default: **Movers analysis**):

| Strategy | What it finds |
|----------|---------------|
| **Volume analysis** | Volume spikes vs a pre-move 20-session baseline, breakouts (price > 20d high + elevated volume), sustained volume-buying days, SMA 50/200 golden crosses |
| **Movers analysis** | Price movers over a configurable lookback (default 5 sessions); filters by min absolute move %; sortable results table |

Shared capabilities on both strategies:

- NIFTY universe selector (50 / 200 / 500) with NSE index refresh
- Saved snapshot picker — reload historical scans from SQLite
- **Stock deep dive** on row click: Yahoo quote/fundamentals/news/peers, NSE bulk/block deals
- **AI briefs** (Perplexity or Gemini): “What's happening?” for volume context, “Why did it move?” for movers; market narrative for top movers
- **Reddit trending** sidebar — cashtag mention counts across Indian + global investing subreddits
- **Enable notifications** — Firebase web push opt-in
- **Run daily scan** — trigger the full automated NIFTY 500 evaluation manually

### Daily runs (`/runs`)

History of automated post-close evaluations (last 60 IST dates). Each run records:

- Volume analysis snapshot (spikes ≥ **5×** baseline for the daily job)
- Weekly movers snapshot (gainers ≥ **3%** over **5** sessions for the daily job)
- Optional AI market brief when gainers exist

Links from each run:

- `/runs/[snapshotId]` — volume spike results table
- `/runs/weekly/[snapshotId]` — weekly gainer results + saved AI market brief

### Automated daily evaluation

`vercel.json` cron hits `/api/cron/daily-volume-scan` at `0 11 * * 1-5` (11:00 UTC ≈ 16:30 IST, weekdays).

Each successful run (NIFTY **500**, after 15:30 IST, once per IST date):

1. Refreshes NSE index constituents if stale
2. Parallel Yahoo scans: volume signals + weekly movers
3. Persists full universes to SQLite
4. Generates an AI **market brief** when gainers exist (Perplexity preferred, else Gemini)
5. Sends Firebase push notification summarizing top spikes and gainers

Manual trigger: **Run daily scan** button or `POST /api/daily-scan/run` (no push by default).

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
| `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` | Stock and market briefs (Perplexity Sonar) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Stock and market briefs (Gemini + Google Search grounding) |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Reddit trending cashtags |

## Data

SQLite database at `data/scanner.db` stores scan snapshots, daily run history, AI briefs, FCM tokens, and cached NSE index constituents. See [`data/AGENTS.md`](data/AGENTS.md) for the schema.

## Production

```bash
npm run build
npm start
```

Deploy on Vercel with the cron schedule in `vercel.json`, or run on any Node host with a persistent filesystem for `data/scanner.db`.

## External services

| Service | Used for |
|---------|----------|
| Yahoo Finance | Quotes, OHLCV, fundamentals, news, peers |
| NSE | Index constituent CSV; bulk/block large deals |
| Perplexity / Gemini | Web-grounded AI briefs |
| Reddit | Trending `$TICKER` cashtags |
| Firebase Cloud Messaging | Web push notifications |

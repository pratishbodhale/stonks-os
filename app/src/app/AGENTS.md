# App Router — Pages & Layout

## Purpose

App Router entry for StonksOS Indian Stock Scanner: interactive two-strategy dashboard, daily-run history, and per-run detail views for volume and movers analysis.

## Pages

| Route | Component | Rendering | Role |
|-------|-----------|-----------|------|
| `/` | `page.tsx` | Client (`"use client"`) | Main dashboard — strategy tabs, scans, deep dive, AI briefs, Reddit trending |
| `/runs` | `runs/page.tsx` | Server | Lists last 60 daily scan runs from SQLite; links to both snapshot types |
| `/runs/[snapshotId]` | `runs/[snapshotId]/page.tsx` | Server | Volume analysis results (≥5× spikes) via `RunResultsTable` |
| `/runs/weekly/[snapshotId]` | `runs/weekly/[snapshotId]/page.tsx` | Server | Movers analysis results (≥3% gainers) + AI market brief via `RunWeeklyMoversTable` |

## Layout & navigation

- `layout.tsx` — root layout, Geist fonts, metadata template `%s · StonksOS`
- `SiteHeader.tsx` — nav: **Scanner** (`/`) | **Daily runs** (`/runs`, `/runs/*`)
- `globals.css` — Tailwind v4 base styles

## Data access patterns

| Page | How it loads data |
|------|-------------------|
| `/` | `fetch` to API routes (`/api/scan`, `/api/weekly-movers`, `/api/snapshots`, `/api/weekly-mover-snapshots`, `/api/weekly-mover-ai-briefs`, `/api/market-opportunities`, `/api/nifty-index/*`, `/api/stock-details`, `/api/stock-perplexity`, `/api/stock-gemini`, `/api/reddit-trending`) |
| `/runs`, `/runs/[id]`, `/runs/weekly/[id]` | Direct imports from `@/lib/db` at render time (no API layer) |

## `page.tsx` structure

The home page (~2400 lines) is a self-contained client dashboard. Default strategy: **Movers analysis** (`weekly-movers`).

### Global header actions
- `NotificationSetup` — FCM opt-in
- `DailyScanRunButton` — manual NIFTY 500 daily evaluation (no push by default)

### Strategy tabs
1. **Volume analysis** — vol spike, breakout, volume-buying days, golden cross filters; inline results table
2. **Movers analysis** — lookback days, min abs move %; `WeeklyMoversResultsTable`; AI market narrative

### Always visible
- **Reddit · trending cashtags** — `/api/reddit-trending`

### Stock deep dive (shared)
- Triggered by row click in either strategy
- `/api/stock-details` for fundamentals, news, NSE deals
- Perplexity/Gemini briefs with strategy-specific prompts; movers briefs persist when `strategy=weekly-mover`

Formatting helpers (`formatInt`, `formatPct`, etc.) and an inline `ExternalLinkIcon` live in `page.tsx`. Prefer extracting to `src/components/` for new work.

## Conventions

- **Server components by default** — only add `"use client"` when using hooks, browser APIs, or interactive state
- **Next.js 16 params**: dynamic route params are a `Promise` — `params: Promise<{ snapshotId: string }>`
- **Runs pages** read DB directly; do not add API indirection unless you need client-side fetching
- New pages should follow the runs pattern (server + DB) or home pattern (client + fetch) based on interactivity needs

## Related docs

- API routes: `src/app/api/AGENTS.md`
- Shared logic: `src/lib/AGENTS.md`
- UI components: `src/components/AGENTS.md`

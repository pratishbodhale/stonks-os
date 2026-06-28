# App Router — Pages & Layout

## Purpose

App Router entry for the Indian Volume Scanner: interactive dashboard, daily-run history, and per-run detail views.

## Pages

| Route | Component | Rendering | Role |
|-------|-----------|-----------|------|
| `/` | `page.tsx` | Client (`"use client"`) | Main scanner dashboard — filters, results table, stock deep dive, Reddit trending, Perplexity briefs |
| `/runs` | `runs/page.tsx` | Server | Lists last 60 daily scan runs from SQLite |
| `/runs/[snapshotId]` | `runs/[snapshotId]/page.tsx` | Server | Shows volume spikes (≥5×) for a snapshot via `RunResultsTable` |

## Layout & styles

- `layout.tsx` — root layout, Geist fonts, metadata ("Indian Volume Scanner")
- `globals.css` — Tailwind v4 base styles

## Data access patterns

| Page | How it loads data |
|------|-------------------|
| `/` | `fetch` to API routes (`/api/scan`, `/api/snapshots`, `/api/nifty-index/*`, `/api/stock-details`, `/api/stock-perplexity`, `/api/reddit-trending`) |
| `/runs`, `/runs/[id]` | Direct imports from `@/lib/db` at render time (no API layer) |

## `page.tsx` structure

The home page (~1500 lines) is a self-contained client dashboard:

- NIFTY universe selector (50 / 200 / 500) with NSE index refresh/status
- Scan filters: vol spike threshold, breakout, volume-buying days, golden cross
- Results table with row selection → deep-dive panel (fundamentals, chart, NSE deals, news)
- Optional Perplexity web summary and Reddit cashtag trending sidebar
- `NotificationSetup` for push notification opt-in

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

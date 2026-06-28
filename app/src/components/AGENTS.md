# Components

## Purpose

Reusable UI extracted from the main dashboard and runs pages. Keep components focused; the home page (`src/app/page.tsx`) still holds most dashboard logic inline (volume results table, strategy state, deep dive panel).

## Components

| Component | Client? | Used by | Role |
|-----------|---------|---------|------|
| `SiteHeader.tsx` | No | `layout.tsx` | Top nav: Scanner \| Daily runs |
| `NotificationSetup.tsx` | Yes | `page.tsx` | Opt-in FCM: permission prompt, service worker registration, token POST to `/api/fcm-token`, foreground `onMessage` handler |
| `DailyScanRunButton.tsx` | Yes | `page.tsx`, `runs/page.tsx` | Manual daily scan trigger via `POST /api/daily-scan/run` with loading/error state |
| `WeeklyMoversResultsTable.tsx` | Yes | `page.tsx` | Interactive movers table on dashboard (sortable, row selection) |
| `RunWeeklyMoversTable.tsx` | No | `runs/weekly/[snapshotId]/page.tsx` | Read-only movers table for daily run detail page |
| `WeeklyMoverSortHeader.tsx` | No | `WeeklyMoversResultsTable`, `RunWeeklyMoversTable` | Sortable column header cells |
| `RunResultsTable.tsx` | No | `runs/[snapshotId]/page.tsx` | Read-only volume spike table with Screener/TradingView links |
| `PerplexityMarkdown.tsx` | No | `page.tsx`, run detail pages | `react-markdown` + GFM with `stripThinkingTags` styling for AI briefs |
| `ExternalLinkIcon.tsx` | No | `RunResultsTable` | SVG external-link icon |
| `FcmRegistration.tsx` | Yes | **Unused** | Auto-register on mount — superseded by `NotificationSetup` |

## Conventions

- Mark `"use client"` only when using hooks or browser APIs (`NotificationSetup`, `DailyScanRunButton`, `WeeklyMoversResultsTable`)
- Use `stock-links.ts` for external URLs — do not duplicate Screener/TradingView URL builders
- Wide tables: sticky first column, `tabular-nums` for numeric columns (see `RunResultsTable`, `WeeklyMoversResultsTable`)
- Prefer importing `ExternalLinkIcon` from here rather than duplicating inline in `page.tsx`

## Adding new components

- Extract from `page.tsx` when a piece of UI is reused or independently testable
- Server-safe presentation components (tables, markdown, icons) should not be client components
- FCM-related UI changes go through `NotificationSetup`, not `FcmRegistration`

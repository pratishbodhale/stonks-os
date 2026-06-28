# Components

## Purpose

Reusable UI extracted from the main dashboard and runs pages. Keep components focused; the home page (`src/app/page.tsx`) still holds most dashboard logic inline.

## Components

| Component | Client? | Used by | Role |
|-----------|---------|---------|------|
| `NotificationSetup.tsx` | Yes | `page.tsx` | Opt-in FCM: permission prompt, service worker registration, token POST to `/api/fcm-token`, foreground `onMessage` handler |
| `FcmRegistration.tsx` | Yes | **Unused** | Auto-register on mount — superseded by `NotificationSetup` |
| `RunResultsTable.tsx` | No | `runs/[snapshotId]/page.tsx` | Read-only spike table with Screener/TradingView links |
| `ExternalLinkIcon.tsx` | No | `RunResultsTable` | SVG external-link icon |
| `PerplexityMarkdown.tsx` | No | `page.tsx` | `react-markdown` + GFM with `stripThinkingTags` styling |

## Conventions

- Mark `"use client"` only when using hooks or browser APIs (`NotificationSetup`)
- Use `stock-links.ts` for external URLs — do not duplicate Screener/TradingView URL builders
- Wide tables: sticky first column, `tabular-nums` for numeric columns (see `RunResultsTable`)
- Prefer importing `ExternalLinkIcon` from here rather than duplicating inline in `page.tsx`

## Adding new components

- Extract from `page.tsx` when a piece of UI is reused or independently testable
- Server-safe presentation components (tables, markdown, icons) should not be client components
- FCM-related UI changes go through `NotificationSetup`, not `FcmRegistration`

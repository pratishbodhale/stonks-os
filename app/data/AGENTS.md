# Data Directory

## Purpose

Local persistence directory created at runtime by `src/lib/db.ts`. Holds the SQLite database and optional JSON sidecar files.

## Files

| Path | Role |
|------|------|
| `scanner.db` (+ `-wal`, `-shm`) | SQLite: scan snapshots, rows, AI briefs, FCM tokens, daily runs, NSE index cache |
| `social-notes.json` | Created by `/api/notes` if used (not in repo by default) |

Paths are resolved by `src/lib/data-path.ts`: `DATA_DIR` (default `data/` under cwd) and optional `DATABASE_PATH`.

## Schema (via `db.ts`)

| Table | Contents |
|-------|----------|
| `snapshots` | Volume-scan metadata (`nifty_universe`, `symbols_scanned`, `created_at`) |
| `snapshot_rows` | Per-symbol volume-scan metrics (vol spike, breakout, SMA, golden cross, volume buying, etc.) |
| `weekly_mover_snapshots` | Weekly-mover scan metadata (`nifty_universe`, `lookback_days`, `symbols_scanned`, `created_at`) |
| `weekly_mover_snapshot_rows` | Per-symbol weekly-mover metrics (period change %, volume, PE, etc.) |
| `weekly_mover_ai_briefs` | Saved AI briefs (`brief_type`: `market` \| `stock`; `provider`, `model`, `text`); unique per snapshot+type+symbol+provider |
| `daily_scan_runs` | One row per IST date (`run_date` UNIQUE): links volume + weekly mover snapshots, spike count, gainer count |
| `fcm_tokens` | Device tokens for push notifications |
| `nifty_index_cache` | Persisted NSE constituent lists per universe (50/200/500) |

## Conventions

- DB path: `getDatabasePath()` in `src/lib/data-path.ts` — `DATA_DIR` env or `data/` under cwd; override file with `DATABASE_PATH`
- WAL journal mode — `-wal` and `-shm` files appear during active use; do not commit these sidecars
- Do not manually edit the DB while the dev server is running
- **Deployment caveat**: SQLite is file-based; works on persistent Node runtime but is not ideal for ephemeral serverless without an external database
- Schema changes: add columns through `ensureColumnExists` in `db.ts`, not raw SQL migrations

## Related docs

- DB access layer: `src/lib/AGENTS.md` (`db.ts`)
- Notes API (JSON file, separate from SQLite): `src/app/api/AGENTS.md`

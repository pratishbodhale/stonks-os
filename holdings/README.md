# Mutual fund holdings

Fetches MF holdings via Kite Connect (`kite.mf_holdings()`), stores snapshots in SQLite, and serves a small dashboard.

## Prerequisites

- Repository root `.env` with `API_KEY` and `API_SECRET` (same as the main Kite tool).
- A valid Kite session token: run `python kite.py` once from the **repository root** so `.access_token` is created (browser login on port 8008).

## Backend (port 8010)

From the **repository root** (`stonks-os/`):

```bash
pip install -r holdings/requirements.txt
uvicorn holdings.backend.main:app --reload --port 8010
```

Or:

```bash
python -m holdings.backend
```

Optional environment variables:

- `HOLDINGS_DB_PATH` — path to the SQLite file (default: `holdings/data/mf_holdings.db`).
- `HOLDINGS_CORS_ORIGINS` — comma-separated origins (default: `http://localhost:5173`).
- `HOLDINGS_EXPENSE_RATIOS_PATH` — JSON file mapping fund **ISIN** (`tradingsymbol`) to total expense ratio in **percent per year** (e.g. `0.52` for 0.52% p.a.). Default path: `holdings/data/expense_ratios.json`. Kite’s `mf/instruments` dump does not include TER today; this file (or any future CSV column Kite adds) is used to fill the **Expense ratio** column. Copy `holdings/data/expense_ratios.example.json` as a starting point.
- `HOLDINGS_COMPARE_CACHE_TTL_SECONDS` — freshness window (seconds) for `POST /api/mf/compare` when reading `mfapi_cache`. Default **86400** (one day); values are clamped between 60 and 86400.

## Frontend

From `holdings/frontend/`:

```bash
npm install
npm run dev
```

Vite proxies `/api` to the holdings API on **port 8010** by default. If the API runs on another port (e.g. `8011`), set:

```bash
HOLDINGS_API_PORT=8011 npm run dev
```

## Port already in use (`[Errno 48] Address already in use`)

Something else is still bound to that port (often another `uvicorn` you started earlier). Free it, then start again:

```bash
# see what is using 8010
lsof -iTCP:8010 -sTCP:LISTEN

# stop it (replace PID with the number from lsof)
kill <PID>
```

Or use a free port for the API and point the frontend at it as above, e.g. `uvicorn holdings.backend.main:app --reload --port 8011` and `HOLDINGS_API_PORT=8011 npm run dev`.

Use **Create snapshot from Kite** to pull live holdings into the database; **Reload from DB** reads the latest snapshot without calling Kite.

## API

- `GET /api/health`
- `GET /api/mf/latest` — latest snapshot from SQLite (or JSON `null`)
- `POST /api/mf/snapshot` — fetch from Kite and persist
- `GET /api/mf/snapshots?limit=50`
- `GET /api/mf/snapshots/{id}`
- `GET /api/mf/mfapi-details?isin=INF...&fund_name=...` — **Primary:** [mf.captnemo.in](https://mf.captnemo.in/) `/kuvera/:isin` (Kuvera JSON: TER, AUM, trailing returns). **Fallback:** [MFapi.in](https://mfapi.in/) search by `fund_name` + ISIN check, then NAV-history returns if Captnemo has no plan for that ISIN. Optional `refresh=true` bypasses cache.
- `POST /api/mf/compare` — JSON body `{ "holdings": [ { "isin", "fund_name", "weight_pct?", "invested_value?", "current_value?", "expense_ratio_snapshot?" } ], "refresh?": false }` (1–40 rows). Returns a flat `rows` array for the **Compare** tab table; per-row errors do not fail the whole request. Uses the same SQLite cache with TTL `HOLDINGS_COMPARE_CACHE_TTL_SECONDS` (default **86400**, maximum **86400** = one day). Set `refresh: true` to bypass cache.

Cache: unified responses are stored in SQLite (`mfapi_cache` table) for `MFAPI_CACHE_TTL_SECONDS` (default 21600 = 6 hours) on `GET /api/mf/mfapi-details`. The compare endpoint uses the longer TTL above when deciding if a cached row is still fresh. Optional: `MFAPI_BASE_URL`, `CAPTNEMO_BASE_URL` (defaults shown in the links above).

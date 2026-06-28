# StonksOS - Stock Trading Toolkit

A collection of tools for stock market automation and data management.

## Repository layout

| Path | Tool |
|------|------|
| `kite.py`, `api_server.py`, `nse_selenium_scraper.py` | Root-level Python tools (Kite holdings, NSE scraper, HTTP API) |
| [`holdings/`](holdings/README.md) | Mutual fund holdings dashboard (Kite + SQLite + React) |
| [`app/`](app/README.md) | Indian Volume Scanner (Next.js — NIFTY volume spikes, breakouts, push alerts) |

## Tools

## 1. Fetch Stock Holdings from Kite
Fetches your stock holdings from Kite (Zerodha) with automated OAuth authentication. This tool solves the authentication challenge and provides clean access to your holdings data.

Includes a reference implementation that syncs holdings to MongoDB with historical tracking - easily adapt this to store data anywhere (PostgreSQL, CSV, S3, etc.) or use it directly in your trading algorithms.

**Why this tool?**
- **Automated OAuth flow** - Handles browser login + 2FA with automatic token capture via local web server (port 8008)
- **Token caching** - Stores access tokens locally, no re-authentication needed until expiry
- **Clean API access** - Simple functions to fetch holdings data for use in your automations
- **Modular code** - Copy just the authentication logic, or extend the storage implementation for your needs

**How it works:**
1. Opens browser for Kite login (one-time authentication)
2. Automatically captures the OAuth token via local server
3. Fetches holdings data from Kite API
4. (Optional) Syncs to MongoDB with enable/disable tracking

**Setup:**
1. Create a Kite Connect app at https://developers.kite.trade/
2. Set redirect URL to: `http://localhost:8008`
3. Add your API credentials to `.env` file (see Setup section below)

**Documentation:** https://kite.trade/docs/connect/v3/user/

**MongoDB Schema (Reference Implementation):**
```javascript
{
  "tradingsymbol": "TATASTEEL",  // Stock symbol
  "enabled": true,                // Current tracking status
  "history": [                    // Historical enable/disable events
    {
      "enabled_at": ISODate("2024-01-15T10:30:00Z"),
      "disabled_at": ISODate("2024-02-20T15:45:00Z")
    },
    {
      "enabled_at": ISODate("2024-03-01T09:15:00Z"),
      "disabled_at": null  // Currently active
    }
  ]
}
```

The schema tracks:
- **tradingsymbol**: Stock identifier from your holdings
- **enabled**: Boolean flag indicating if stock is currently in your portfolio
- **history**: Array of enable/disable events with timestamps (useful for tracking portfolio changes over time)

### Setup

1. Install dependencies:
```bash
pip install -r requirements.scraper.txt
```

2. Create a `.env` file in the root directory with the following variables:
```env
## KITE API keys (Required) - Get these from https://developers.kite.trade/
API_KEY=your_kite_api_key
API_SECRET=your_kite_api_secret

## MongoDB credentials (Optional) - Only needed if using the MongoDB sync feature
MONGO_URI=your_mongodb_connection_string
MONGO_DB_NAME=your_database_name
MONGO_DB_COLLECTION_NAME=your_collection_name
```

#### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | Yes | Your Kite Connect API key |
| `API_SECRET` | Yes | Your Kite Connect API secret |
| `MONGO_URI` | No | MongoDB connection string (only if using MongoDB sync) |
| `MONGO_DB_NAME` | No | MongoDB database name |
| `MONGO_DB_COLLECTION_NAME` | No | MongoDB collection name for storing holdings |

### Usage

```bash
python kite.py
```

This will:
- Authenticate with Kite (opens browser for login)
- Fetch your current holdings from Kite API
- (If configured) Sync holdings to MongoDB with tracking history

### Notes

- Access token is cached in `.access_token` file
- First run will open a browser for Kite login
- Subsequent runs will use cached token until it expires

## 2. NSE Announcements Scraper
Automated scraper for downloading corporate filings and announcements from NSE India website. Uses undetected-chromedriver to bypass bot detection and download CSV files containing company announcements.

**Why this tool?**
- **Bot detection bypass** - Uses undetected-chromedriver to reliably access NSE India
- **Automated downloads** - Automatically searches for company and downloads announcement CSV
- **Docker support** - True headless mode via Docker container
- **Cross-platform** - Works on macOS, Linux, Windows
- **Simple CLI** - Just provide the ticker symbol and get the data
- **Error handling** - Takes screenshots on errors for debugging

**How it works:**
1. Launches Chrome browser in a virtual display (Docker) or visible window (local)
2. Navigates to NSE India corporate filings page
3. Searches for the specified ticker symbol in the autocomplete
4. Clicks download button to get CSV file with all announcements
5. Saves CSV to `./downloads/` directory

### Quick Start (Docker - Recommended)

Docker provides true headless mode that works everywhere:

```bash
# Build the Docker image (one time)
docker-compose build

# Run the scraper (truly invisible)
docker-compose run --rm nse-scraper TATASTEEL --headless

# Check downloads
ls -lh downloads/

# Or use the helper script
./run_scraper.sh TATASTEEL --headless
```

### Local Usage (macOS/Linux/Windows)

```bash
# Install dependencies
pip install -r requirements.scraper.txt

# Download announcements - browser will be visible
python nse_selenium_scraper.py TATASTEEL

# Headless mode (Linux only, browser visible on macOS/Windows)
python nse_selenium_scraper.py TATASTEEL --headless
```

### The Headless Challenge & Solution

NSE India blocks Chrome's native `--headless` mode through sophisticated bot detection. Here's what we tried and what works:

**❌ What Doesn't Work:**
- Chrome's `--headless` flag alone → NSE detects and blocks it
- Stealth arguments (`--disable-blink-features`) → Still detected
- PyVirtualDisplay on macOS → macOS Chrome uses native windows, ignores X11

**✅ What Works:**

1. **Docker with Linux + Xvfb (Best Solution)**
   - Runs Chrome in a real Linux container
   - Uses Xvfb (X Virtual Frame Buffer) for invisible display
   - Chrome runs normally but renders to virtual display

2. **Visible Browser (macOS/Windows Local)**
   - Browser window appears but scraping works reliably


### Technical Details

**Architecture:**
```
┌─────────────────────────────────────────┐
│  Host (macOS/Windows/Linux)             │
│  ┌───────────────────────────────────┐  │
│  │  Docker Container (Linux/AMD64)   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Xvfb (Virtual Display :99) │  │  │
│  │  │  ┌───────────────────────┐  │  │  │
│  │  │  │  Chrome Browser       │  │  │  │
│  │  │  │  (thinks it's real)   │  │  │  │
│  │  │  └───────────────────────┘  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Downloads: /app/downloads        │  │
│  │  (mounted to host ./downloads/)   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 3. NSE Scraper HTTP API Server

HTTP API server that provides a RESTful interface to the NSE scraper. Spawns Docker containers on demand and returns downloaded CSV files.

**Why this tool?**
- **RESTful API** - Simple HTTP endpoints for programmatic access
- **Docker orchestration** - Automatically manages Docker containers
- **File management** - Downloads and serves CSV files via HTTP

**How it works:**
1. Receive HTTP request with ticker symbol
2. Spawn Docker container to run NSE scraper
3. Monitor downloads directory for new CSV file
4. Return CSV file as HTTP response

**Quick Start:**

```bash
# Install dependencies
pip install -r requirements.scraper.txt

# Build Docker image (one time)
docker-compose build

# Start the API server
python api_server.py

# Make a request (in another terminal)
curl -X POST http://localhost:8000/scrape/TATASTEEL -o tatasteel.csv
```

**API Endpoints:**
- `POST /scrape/{ticker}` - Scrape announcements and download CSV
- `GET /scrape/{ticker}/info` - Get file info without downloading
- `GET /health` - Health check endpoint
- `GET /` - API information and usage examples

**Interactive Documentation:**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

**Example Usage:**

```bash
# Download announcements for a ticker
curl -X POST http://localhost:8000/scrape/TATASTEEL -o tatasteel.csv

# Get file information
curl http://localhost:8000/scrape/RELIANCE/info

# Health check
curl http://localhost:8000/health
```

## 4. Mutual Fund Holdings

Fetches MF holdings via Kite Connect, stores snapshots in SQLite, and serves a React dashboard with fund comparison and equity overlap analysis.

**Documentation:** [`holdings/README.md`](holdings/README.md)

**Quick start** (from repository root):

```bash
pip install -r holdings/requirements.txt
uvicorn holdings.backend.main:app --reload --port 8010
```

In another terminal:

```bash
cd holdings/frontend && npm install && npm run dev
```

Requires root `.env` with Kite API credentials and a valid `.access_token` (run `python kite.py` once).

## 5. Indian Volume Scanner

Next.js app that scans NIFTY 50/200/500 for volume spikes, breakouts, golden crosses, and weekly movers. Persists scan history in SQLite, sends Firebase push notifications on daily cron runs, and optionally enriches with Perplexity/Gemini briefs and Reddit trending cashtags.

**Documentation:** [`app/README.md`](app/README.md) · Agent/architecture reference: [`app/AGENTS.md`](app/AGENTS.md)

**Quick start** (from `app/`):

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `app/.env.local` from your prior deployment or see `app/README.md` for optional API keys (Firebase, Perplexity, Gemini, Reddit).

**Scheduled scan:** `app/vercel.json` triggers `/api/cron/daily-volume-scan` on weekdays at 11:00 UTC (~16:30 IST).


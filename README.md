# StonksOS - Stock Trading Toolkit

A collection of tools for stock market automation and data management.

## Tools

### 1. Fetch Stock Holdings from Kite
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

### 2. NSE Announcements Scraper
Automated scraper for downloading corporate filings and announcements from NSE India website. Uses undetected-chromedriver to bypass bot detection and download CSV files containing company announcements.

**Why this tool?**
- **Bot detection bypass** - Uses undetected-chromedriver to reliably access NSE India
- **Automated downloads** - Automatically searches for company and downloads announcement CSV
- **Simple CLI** - Just provide the ticker symbol and get the data
- **Error handling** - Takes screenshots on errors for debugging

**How it works:**
1. Launches Chrome browser (visible or headless)
2. Navigates to NSE India corporate filings page
3. Searches for the specified ticker symbol in the autocomplete
4. Clicks download button to get CSV file with all announcements
5. Saves CSV to `./downloads/` directory

**Usage:**
```bash
# Download announcements for a stock (visible browser)
python nse_selenium_scraper.py TATASTEEL

# Run in headless mode (may not work due to NSE bot detection)
python nse_selenium_scraper.py TATASTEEL --headless
```

**Output:**
- CSV file containing corporate announcements (date, subject, description, attachments)
- Saved to `./downloads/` directory
- Error screenshots saved if scraping fails

**Technical details:**
- Uses `undetected-chromedriver` to bypass Cloudflare/bot detection
- Waits for dynamic content to load before interacting
- Automatically finds latest downloaded file
- URL: https://www.nseindia.com/companies-listing/corporate-filings-announcements

**Note:** NSE India has aggressive bot detection. Headless mode may not work reliably. Visible browser mode is recommended.


## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | Yes | Your Kite Connect API key |
| `API_SECRET` | Yes | Your Kite Connect API secret |
| `MONGO_URI` | No | MongoDB connection string (only if using MongoDB sync) |
| `MONGO_DB_NAME` | No | MongoDB database name |
| `MONGO_DB_COLLECTION_NAME` | No | MongoDB collection name for storing holdings |

## Usage

### Fetch Kite Holdings

```bash
python kite.py
```

This will:
- Authenticate with Kite (opens browser for login)
- Fetch your current holdings from Kite API
- (If configured) Sync holdings to MongoDB with tracking history

### NSE Scrapers

The repository also includes NSE data scrapers:
- `nse_selenium_scraper.py` - NSE Selenium-based stock announcements scraper

## Notes

- Access token is cached in `.access_token` file
- First run will open a browser for Kite login
- Subsequent runs will use cached token until it expires
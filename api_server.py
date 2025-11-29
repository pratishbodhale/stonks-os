"""
NSE Scraper HTTP API Server

This server provides an HTTP API to trigger NSE announcements scraping via Docker container
and returns the downloaded CSV file.

Endpoints:
    POST /scrape/{ticker} - Scrape announcements for a ticker and return CSV file
    GET /health - Health check endpoint

Example usage:
    curl -X POST http://localhost:8000/scrape/TATASTEEL -o tatasteel.csv
"""

from fastapi import FastAPI, HTTPException, Path
from fastapi.responses import FileResponse, JSONResponse
import subprocess
import os
import time
from pathlib import Path as FilePath
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NSE Scraper API",
    description="HTTP API to scrape NSE announcements using Docker container",
    version="1.0.0"
)

# Configuration
DOWNLOADS_DIR = FilePath("./downloads").absolute()
SCRAPE_TIMEOUT = 300  # 5 minutes timeout for scraping
POLL_INTERVAL = 2  # Check for file every 2 seconds


def ensure_downloads_dir():
    """Create downloads directory if it doesn't exist"""
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloads directory: {DOWNLOADS_DIR}")


def get_latest_csv_file(before_time: float = None) -> FilePath | None:
    """
    Get the latest CSV file from downloads directory.

    Args:
        before_time: Only return files created after this timestamp

    Returns:
        Path to the latest CSV file or None if no file found
    """
    csv_files = list(DOWNLOADS_DIR.glob("*.csv"))

    if before_time:
        # Filter files created after the given timestamp
        csv_files = [f for f in csv_files if f.stat().st_mtime > before_time]

    if not csv_files:
        return None

    # Return the most recently modified file
    return max(csv_files, key=lambda p: p.stat().st_mtime)


def run_docker_scraper(ticker: str) -> dict:
    """
    Run the NSE scraper in a Docker container.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dictionary with success status and file path or error message
    """
    ensure_downloads_dir()

    # Get timestamp before running scraper to identify new files
    start_time = time.time()

    logger.info(f"Starting scraper for ticker: {ticker}")

    try:
        # Run docker-compose command
        cmd = [
            "docker-compose",
            "run",
            "--rm",
            "nse-scraper",
            ticker.upper(),
            "--headless"
        ]

        logger.info(f"Running command: {' '.join(cmd)}")

        # Run the command and capture output
        result = subprocess.run(
            cmd,
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True,
            text=True,
            timeout=SCRAPE_TIMEOUT
        )

        logger.info(f"Docker command completed with return code: {result.returncode}")

        if result.returncode != 0:
            logger.error(f"Scraper failed with stderr: {result.stderr}")
            return {
                "success": False,
                "error": f"Scraper failed: {result.stderr}",
                "stdout": result.stdout,
                "stderr": result.stderr
            }

        # Wait a bit for file system to sync
        time.sleep(1)

        # Look for the newly created CSV file
        max_wait = 30  # Wait up to 30 seconds for file to appear
        elapsed = 0

        while elapsed < max_wait:
            csv_file = get_latest_csv_file(before_time=start_time)

            if csv_file and csv_file.exists():
                logger.info(f"Found downloaded file: {csv_file}")
                return {
                    "success": True,
                    "file_path": str(csv_file),
                    "file_name": csv_file.name,
                    "file_size": csv_file.stat().st_size
                }

            time.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

        logger.error("No CSV file found after scraping")
        return {
            "success": False,
            "error": "Scraping completed but no CSV file was found",
            "stdout": result.stdout
        }

    except subprocess.TimeoutExpired:
        logger.error(f"Scraper timeout after {SCRAPE_TIMEOUT} seconds")
        return {
            "success": False,
            "error": f"Scraping timeout after {SCRAPE_TIMEOUT} seconds"
        }
    except Exception as e:
        logger.exception(f"Unexpected error during scraping: {e}")
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "NSE Scraper API",
        "version": "1.0.0",
        "endpoints": {
            "scrape": "POST /scrape/{ticker} - Scrape announcements for a ticker",
            "health": "GET /health - Health check"
        },
        "example": "curl -X POST http://localhost:8000/scrape/TATASTEEL -o tatasteel.csv"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "downloads_dir": str(DOWNLOADS_DIR),
        "downloads_dir_exists": DOWNLOADS_DIR.exists()
    }


@app.post("/scrape/{ticker}")
async def scrape_ticker(
    ticker: str = Path(..., description="Stock ticker symbol (e.g., TATASTEEL)", min_length=1)
):
    """
    Scrape NSE announcements for a given ticker symbol.

    This endpoint:
    1. Spawns a Docker container to run the NSE scraper
    2. Waits for the CSV file to be downloaded
    3. Returns the CSV file as a downloadable response

    Args:
        ticker: Stock ticker symbol (e.g., TATASTEEL)

    Returns:
        CSV file with announcements data

    Raises:
        HTTPException: If scraping fails or times out
    """
    logger.info(f"Received scrape request for ticker: {ticker}")

    # Validate ticker (basic validation)
    if not ticker.replace("&", "").isalnum():
        raise HTTPException(
            status_code=400,
            detail="Invalid ticker symbol. Must contain only alphanumeric characters and &"
        )

    # Run the scraper
    result = run_docker_scraper(ticker)

    if not result["success"]:
        logger.error(f"Scraping failed for {ticker}: {result.get('error')}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": result.get("error", "Unknown error"),
                "stdout": result.get("stdout"),
                "stderr": result.get("stderr")
            }
        )

    # Return the CSV file
    file_path = result["file_path"]

    logger.info(f"Returning file: {file_path}")

    return FileResponse(
        path=file_path,
        media_type="text/csv",
        filename=f"{ticker.upper()}_announcements_{datetime.now().strftime('%Y%m%d')}.csv",
        headers={
            "Content-Disposition": f'attachment; filename="{ticker.upper()}_announcements.csv"'
        }
    )


@app.get("/scrape/{ticker}/info")
async def scrape_ticker_info(
    ticker: str = Path(..., description="Stock ticker symbol (e.g., TATASTEEL)", min_length=1)
):
    """
    Scrape NSE announcements and return file info (without downloading).

    This is useful for checking if data is available and file details.

    Args:
        ticker: Stock ticker symbol

    Returns:
        JSON with file information and download URL
    """
    logger.info(f"Received info request for ticker: {ticker}")

    # Validate ticker
    if not ticker.replace("&", "").isalnum():
        raise HTTPException(
            status_code=400,
            detail="Invalid ticker symbol"
        )

    # Run the scraper
    result = run_docker_scraper(ticker)

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Unknown error")
        )

    file_path = FilePath(result["file_path"])

    return JSONResponse(content={
        "success": True,
        "ticker": ticker.upper(),
        "file_name": result["file_name"],
        "file_size": result["file_size"],
        "file_size_mb": round(result["file_size"] / (1024 * 1024), 2),
        "download_url": f"/scrape/{ticker}",
        "timestamp": datetime.now().isoformat()
    })


if __name__ == "__main__":
    import uvicorn

    logger.info("Starting NSE Scraper API Server...")
    ensure_downloads_dir()

    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
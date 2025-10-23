import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
from pathlib import Path
import sys
import os


# Try to import pyvirtualdisplay for headless mode
try:
    from pyvirtualdisplay import Display
    HAS_VIRTUAL_DISPLAY = True
except ImportError:
    HAS_VIRTUAL_DISPLAY = False


def scrape_nse_announcements(ticker: str, headless: bool = False, download_dir: str = './downloads'):
    """
    Scrapes NSE India corporate filings using undetected-chromedriver.

    Args:
        ticker: Stock ticker symbol (e.g., 'TATASTEEL')
        headless: Run in headless mode (default: False)
                 Note: On macOS, the browser window will still be visible
                 True headless only works on Linux with Xvfb
        download_dir: Directory where downloads will be saved

    Returns:
        Path to downloaded file or None if failed
    """
    # Create download directory
    download_path = Path(download_dir).absolute()
    download_path.mkdir(parents=True, exist_ok=True)

    # Initialize virtual display for headless mode
    display = None
    if headless:
        if not HAS_VIRTUAL_DISPLAY:
            print("Warning: pyvirtualdisplay not available. Headless mode may fail.")
            print("Install with: pip install pyvirtualdisplay")
            print("And ensure xvfb is installed (brew install xquartz on macOS)")
        else:
            print("Starting virtual display for headless mode...")
            try:
                # Use Xvfb backend explicitly with visible=0 for truly invisible display
                display = Display(visible=False, size=(1920, 1080), backend='xvfb')
                display.start()
                print(f"Virtual display started successfully (DISPLAY={display.display})")

                # Ensure the DISPLAY environment variable is set for Chrome
                os.environ['DISPLAY'] = f':{display.display}'
                print(f"Set DISPLAY environment variable to: {os.environ['DISPLAY']}")
            except Exception as e:
                print(f"Warning: Could not start virtual display: {e}")
                print("Continuing without virtual display...")
                display = None

    # Set up Chrome options
    options = uc.ChromeOptions()

    # Note: When using virtual display, we don't use --headless flag
    # The browser runs normally but on a virtual display
    if headless and not display:
        # Fallback to headless mode if virtual display failed
        print("Using Chrome headless mode (less reliable for NSE)")
        options.add_argument('--headless=new')

        # Additional stealth options for headless mode
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-software-rasterizer')
        options.add_argument('--disable-extensions')
        options.add_argument('--dns-prefetch-disable')
        options.add_argument('--disable-features=VizDisplayCompositor')

        # Set a realistic window size
        options.add_argument('--window-size=1920,1080')

        # Set a realistic user agent
        options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

    # Set download preferences
    prefs = {
        "download.default_directory": str(download_path),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    }
    options.add_experimental_option("prefs", prefs)

    driver = None

    try:
        print("Starting undetected Chrome browser...")

        # Initialize undetected chromedriver with additional stealth settings
        driver = uc.Chrome(
            options=options,
            version_main=None,
            use_subprocess=True,  # Use subprocess to avoid detection
            suppress_welcome=True  # Suppress welcome screen
        )

        # Small delay after driver initialization
        time.sleep(2)

        # Maximize window for better element visibility (skip in headless)
        if not headless:
            driver.maximize_window()

        print("Navigating to corporate filings page...")

        # Navigate directly to corporate filings page
        url = "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
        driver.get(url)

        # Wait for page to fully load
        print("Waiting for page to load...")
        time.sleep(8)  # Increased wait time for page to fully load

        print(f"Looking for company dropdown to select {ticker}...")

        # Wait for page to be interactive - increased timeout
        wait = WebDriverWait(driver, 5)

        # Wait for the body to be present
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))

        # Additional wait for JavaScript to initialize
        time.sleep(3)

        # Find the company autocomplete input field
        print("Looking for company autocomplete input...")
        company_input = wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "input.companyAutoComplete"))
        )
        print("Found company input field")

        # Click and clear the input
        company_input.click()
        time.sleep(0.5)
        company_input.clear()
        time.sleep(0.5)

        # Type the ticker symbol
        print(f"Typing ticker: {ticker}")
        company_input.send_keys(ticker)

        # Wait for autocomplete dropdown to appear
        print("Waiting for autocomplete dropdown...")
        time.sleep(2)

        # Wait for the dropdown menu to be visible
        wait.until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, ".tt-menu.tt-open"))
        )
        print("Dropdown menu appeared")

        # Find and click the first autocomplete suggestion
        print("Looking for autocomplete suggestion...")
        autocomplete_option = wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, ".tt-suggestion.tt-selectable"))
        )

        option_text = autocomplete_option.text
        print(f"Found option: {option_text}")

        # Click the option
        autocomplete_option.click()
        print(f"Selected: {option_text}")

        print(f"Waiting 5 seconds for {ticker} data to load...")
        time.sleep(5)  # Wait for data to load and table to update

        print("Looking for Download CSV button...")

        # Find and click the Download CSV button
        download_button = wait.until(
            EC.element_to_be_clickable((By.ID, "CFanncEquity-download"))
        )
        print("Found download button")

        # Click the download button
        download_button.click()
        print("Clicked download button")

        # Wait for download to complete
        print("Waiting for download to complete...")
        time.sleep(10)

        # Check if file was downloaded
        downloaded_files = list(download_path.glob("*.csv"))
        if downloaded_files:
            # Get the most recently downloaded file
            latest_file = max(downloaded_files, key=lambda p: p.stat().st_mtime)
            print(f"Download successful: {latest_file}")
            return str(latest_file)
        else:
            print("No CSV file found in download directory")
            return None

    except Exception as e:
        print(f"Error occurred: {e}")
        if driver:
            try:
                screenshot_path = download_path / f"error_{ticker}.png"
                driver.save_screenshot(str(screenshot_path))
                print(f"Error screenshot saved to: {screenshot_path}")
            except:
                pass
        return None

    finally:
        if driver:
            print("Closing browser...")
            time.sleep(2)
            driver.quit()

        # Stop virtual display if it was started
        if display:
            print("Stopping virtual display...")
            try:
                display.stop()
            except Exception as e:
                print(f"Error stopping display: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python nse_selenium_scraper.py <TICKER> [--headless]")
        print("Example: python nse_selenium_scraper.py TATASTEEL")
        print("Example: python nse_selenium_scraper.py TATASTEEL --headless")
        sys.exit(1)

    ticker_symbol = sys.argv[1].upper()
    headless_mode = '--headless' in sys.argv

    if headless_mode:
        import platform
        if platform.system() == 'Darwin':  # macOS
            print("")
            print("=" * 70)
            print("NOTE: Running on macOS")
            print("=" * 70)
            print("Chrome will be VISIBLE on macOS (even with --headless flag)")
            print("macOS Chrome uses native windows, not X11 virtual displays.")
            print("")
            print("For truly invisible headless mode, use one of these options:")
            print("  1. Run without --headless flag (recommended for macOS)")
            print("  2. Deploy to a Linux server where Xvfb works")
            print("  3. Use Docker with Linux image")
            print("")
            print("See NSE_SCRAPER_README.md for details")
            print("=" * 70)
            print("")

    result = scrape_nse_announcements(ticker_symbol, headless=headless_mode)

    if result:
        print(f"\nSuccess! CSV downloaded to: {result}")
    else:
        print(f"\nFailed to download data for {ticker_symbol}")

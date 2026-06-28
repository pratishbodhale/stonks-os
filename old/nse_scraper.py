import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


async def scrape_nse_announcements(ticker: str, download_dir: str = './downloads', headless: bool = True):
    """
    Scrapes corporate filings and announcements from NSE India for a given ticker.

    Args:
        ticker: The stock ticker symbol (e.g., 'TATASTEEL')
        download_dir: Directory where CSV file will be downloaded (default: './downloads')
        headless: Run browser in headless mode (default: True)

    Returns:
        Path to the downloaded CSV file if successful, None otherwise
    """
    # Create download directory if it doesn't exist
    download_path = Path(download_dir).absolute()
    download_path.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        # Launch browser with additional args to avoid detection
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        )

        # Create context with download path and realistic settings
        context = await browser.new_context(
            accept_downloads=True,
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport={'width': 1920, 'height': 1080},
            locale='en-US',
            timezone_id='Asia/Kolkata',
            extra_http_headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
            }
        )

        page = await context.new_page()

        # Add script to override navigator.webdriver
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)

        try:
            # First visit homepage to establish cookies and session
            print(f"Visiting NSE India homepage to establish session...")
            await page.goto('https://www.nseindia.com/', timeout=60000)
            await page.wait_for_timeout(3000)

            print(f"Navigating to NSE India corporate filings page...")

            # Navigate to the page
            url = "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
            await page.goto(url, wait_until='domcontentloaded', timeout=60000)

            # Wait a bit for the page to fully load
            await page.wait_for_timeout(5000)

            print(f"Selecting ticker: {ticker}")

            # Try multiple strategies to find and interact with the dropdown
            # Strategy 1: Look for dropdown by common selectors
            dropdown_selectors = [
                'select[name="symbol"]',
                'select#symbol',
                'input[placeholder*="Company"]',
                'input[placeholder*="Symbol"]',
                '#companySelect',
                '.company-select'
            ]

            dropdown_found = False
            for selector in dropdown_selectors:
                try:
                    await page.wait_for_selector(selector, timeout=5000)
                    print(f"Found dropdown with selector: {selector}")

                    # Check if it's a select element or input
                    element_type = await page.eval_on_selector(selector, 'el => el.tagName.toLowerCase()')

                    if element_type == 'select':
                        # Standard select dropdown
                        await page.select_option(selector, label=ticker)
                    else:
                        # Input field (likely autocomplete)
                        await page.click(selector)
                        await page.fill(selector, ticker)
                        await page.wait_for_timeout(2000)
                        # Press Enter or click the option
                        await page.keyboard.press('Enter')

                    dropdown_found = True
                    break
                except:
                    continue

            # Strategy 2: If standard selectors don't work, try finding by text
            if not dropdown_found:
                print("Trying alternative approach - looking for dropdown by text...")
                # Wait for any dropdown to be visible
                await page.wait_for_timeout(3000)

                # Try to click on anything that says "Company" or "Symbol"
                company_label_selectors = [
                    '//label[contains(text(), "Company")]',
                    '//label[contains(text(), "Symbol")]',
                    '//div[contains(text(), "Select Company")]'
                ]

                for selector in company_label_selectors:
                    try:
                        # Find the associated input/select
                        await page.click(selector)
                        await page.wait_for_timeout(1000)

                        # Type the ticker
                        await page.keyboard.type(ticker)
                        await page.wait_for_timeout(2000)

                        # Try to select from dropdown
                        option_xpath = f'//li[contains(text(), "{ticker}")]|//option[contains(text(), "{ticker}")]'
                        await page.click(option_xpath)
                        dropdown_found = True
                        break
                    except:
                        continue

            if not dropdown_found:
                raise Exception(f"Could not find or interact with company dropdown for ticker: {ticker}")

            print(f"Ticker {ticker} selected successfully")

            # Wait for the table to update with the selected company data
            await page.wait_for_timeout(3000)

            print("Clicking Download CSV button...")

            # Find and click the Download CSV button
            # Set up download promise before clicking
            async with page.expect_download() as download_info:
                # Try different possible selectors for the download button
                download_button_selectors = [
                    'button:has-text("Download CSV")',
                    'a:has-text("Download CSV")',
                    'button[title*="Download"]',
                    'a[title*="Download"]'
                ]

                button_clicked = False
                for selector in download_button_selectors:
                    try:
                        await page.click(selector, timeout=5000)
                        button_clicked = True
                        break
                    except:
                        continue

                if not button_clicked:
                    raise Exception("Could not find Download CSV button")

            # Wait for download to complete
            download = await download_info.value

            # Save the file
            download_file_path = download_path / f"{ticker}_announcements.csv"
            await download.save_as(download_file_path)

            print(f"CSV downloaded successfully to: {download_file_path}")

            return str(download_file_path)

        except PlaywrightTimeoutError as e:
            print(f"Timeout error: {e}")
            print("Page might be taking too long to load or element not found")
            return None

        except Exception as e:
            print(f"Error occurred: {e}")
            # Take a screenshot for debugging if page is still open
            try:
                if not page.is_closed():
                    screenshot_path = download_path / f"error_{ticker}.png"
                    await page.screenshot(path=str(screenshot_path))
                    print(f"Screenshot saved to: {screenshot_path}")
            except:
                pass
            return None

        finally:
            try:
                await browser.close()
            except:
                pass


async def main(ticker: str, headless: bool = True):
    """
    Main function to run the scraper.

    Args:
        ticker: The stock ticker symbol (e.g., 'TATASTEEL')
        headless: Run browser in headless mode (default: True)
    """
    result = await scrape_nse_announcements(ticker, headless=headless)

    if result:
        print(f"\nSuccess! Data downloaded for {ticker}")
        print(f"File location: {result}")
    else:
        print(f"\nFailed to download data for {ticker}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python nse_scraper.py <TICKER> [--headed]")
        print("Example: python nse_scraper.py TATASTEEL")
        print("Example: python nse_scraper.py TATASTEEL --headed  (to see browser)")
        sys.exit(1)

    ticker_symbol = sys.argv[1].upper()

    # Check if --headed flag is provided
    headless_mode = True
    if '--headed' in sys.argv:
        headless_mode = False
        print("Running in headed mode (browser will be visible)")

    asyncio.run(main(ticker_symbol, headless=headless_mode))

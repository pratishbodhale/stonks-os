import requests
import json
import csv
from pathlib import Path
from datetime import datetime
import time


class NSEScraper:
    """
    Scraper for NSE India corporate announcements using their API.
    """

    def __init__(self):
        self.base_url = "https://www.nseindia.com"
        self.session = requests.Session()
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://www.nseindia.com/',
        }
        self.session.headers.update(self.headers)

    def establish_session(self):
        """
        Visit NSE homepage to get cookies and establish session.
        """
        try:
            print("Establishing session with NSE India...")
            response = self.session.get(
                f"{self.base_url}/",
                headers=self.headers,
                timeout=30
            )
            response.raise_for_status()
            print(f"Session established. Cookies: {len(self.session.cookies)}")
            return True
        except Exception as e:
            print(f"Failed to establish session: {e}")
            return False

    def get_announcements(self, symbol: str, index: str = "equities"):
        """
        Fetch corporate announcements for a given symbol.

        Args:
            symbol: Stock symbol (e.g., 'TATASTEEL')
            index: Market index type (default: 'equities')

        Returns:
            List of announcements or None if failed
        """
        try:
            # API endpoint for corporate announcements
            api_url = f"{self.base_url}/api/corporates-corporateActions"

            params = {
                'index': index,
                'symbol': symbol
            }

            print(f"Fetching announcements for {symbol}...")

            response = self.session.get(
                api_url,
                params=params,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                return data
            else:
                print(f"Failed to fetch data. Status code: {response.status_code}")
                print(f"Response: {response.text[:500]}")
                return None

        except Exception as e:
            print(f"Error fetching announcements: {e}")
            return None

    def get_corporate_info(self, symbol: str):
        """
        Fetch corporate information and announcements.

        Args:
            symbol: Stock symbol (e.g., 'TATASTEEL')

        Returns:
            Dict containing corporate data
        """
        try:
            # Try the corporate info API
            api_url = f"{self.base_url}/api/quote-equity"

            params = {'symbol': symbol}

            print(f"Fetching corporate info for {symbol}...")

            response = self.session.get(
                api_url,
                params=params,
                timeout=30
            )

            if response.status_code == 200:
                return response.json()
            else:
                print(f"Status code: {response.status_code}")
                return None

        except Exception as e:
            print(f"Error: {e}")
            return None

    def save_to_csv(self, data, symbol, output_dir='./downloads'):
        """
        Save announcement data to CSV file.

        Args:
            data: Data to save
            symbol: Stock symbol
            output_dir: Directory to save CSV (default: './downloads')

        Returns:
            Path to saved file or None
        """
        try:
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = output_path / f"{symbol}_announcements_{timestamp}.csv"

            # If data is a list of dicts
            if isinstance(data, list) and len(data) > 0:
                with open(filename, 'w', newline='', encoding='utf-8') as f:
                    if isinstance(data[0], dict):
                        writer = csv.DictWriter(f, fieldnames=data[0].keys())
                        writer.writeheader()
                        writer.writerows(data)
                    else:
                        writer = csv.writer(f)
                        writer.writerows(data)

                print(f"Data saved to: {filename}")
                return str(filename)

            # If data is a dict, save as JSON for now
            elif isinstance(data, dict):
                json_filename = output_path / f"{symbol}_data_{timestamp}.json"
                with open(json_filename, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)

                print(f"Data saved as JSON to: {json_filename}")
                return str(json_filename)

            else:
                print("No valid data to save")
                return None

        except Exception as e:
            print(f"Error saving to CSV: {e}")
            return None


def scrape_nse_announcements(ticker: str):
    """
    Main function to scrape NSE announcements for a ticker.

    Args:
        ticker: Stock ticker symbol (e.g., 'TATASTEEL')

    Returns:
        Path to saved file or None
    """
    scraper = NSEScraper()

    # Establish session first
    if not scraper.establish_session():
        print("Failed to establish session. Trying anyway...")

    # Small delay to mimic human behavior
    time.sleep(2)

    # Try to get announcements
    announcements = scraper.get_announcements(ticker)

    if announcements:
        print(f"Retrieved announcement data for {ticker}")
        print(f"Data structure: {type(announcements)}")

        # Save to file
        result = scraper.save_to_csv(announcements, ticker)
        return result
    else:
        # Try alternative API
        print("Trying alternative API endpoint...")
        corp_info = scraper.get_corporate_info(ticker)

        if corp_info:
            print(f"Retrieved corporate info for {ticker}")
            result = scraper.save_to_csv(corp_info, ticker)
            return result
        else:
            print(f"Failed to retrieve data for {ticker}")
            return None


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python nse_api_scraper.py <TICKER>")
        print("Example: python nse_api_scraper.py TATASTEEL")
        sys.exit(1)

    ticker_symbol = sys.argv[1].upper()

    print(f"Starting NSE scraper for {ticker_symbol}...")
    result = scrape_nse_announcements(ticker_symbol)

    if result:
        print(f"\nSuccess! Data saved to: {result}")
    else:
        print(f"\nFailed to scrape data for {ticker_symbol}")
        print("\nNote: NSE India has strict rate limiting and anti-bot measures.")
        print("You may need to:")
        print("1. Wait a few minutes and try again")
        print("2. Use a VPN or different IP address")
        print("3. Access the website manually first in a browser")

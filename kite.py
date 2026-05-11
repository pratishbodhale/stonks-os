import logging
import os
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading

from kiteconnect import KiteConnect
from kiteconnect.exceptions import KiteException
import webbrowser
from dotenv import load_dotenv
from pymongo import MongoClient

TOKEN_FILE = ".access_token"
PORT = 8008

# Global variable to store the captured request token
captured_request_token = None

class CallbackHandler(BaseHTTPRequestHandler):
    """HTTP request handler to capture the request token from Kite callback"""

    def do_GET(self):
        global captured_request_token

        # Parse the URL and query parameters
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)

        # Extract request_token from query parameters
        if 'request_token' in query_params:
            captured_request_token = query_params['request_token'][0]

            # Send success response to browser
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()

            success_html = """
            <html>
            <head><title>Login Successful</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: green;">Login Successful!</h1>
                <p>Request token captured successfully.</p>
                <p>You can close this window now.</p>
            </body>
            </html>
            """
            self.wfile.write(success_html.encode())
            print(f"\nRequest token captured: {captured_request_token}")
        else:
            # Send error response
            self.send_response(400)
            self.send_header('Content-type', 'text/html')
            self.end_headers()

            error_html = """
            <html>
            <head><title>Error</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: red;">Error</h1>
                <p>Request token not found in callback URL.</p>
            </body>
            </html>
            """
            self.wfile.write(error_html.encode())

    def log_message(self, format, *args):
        # Suppress default logging
        pass


def save_access_token(token):
    """Save access token to local file"""
    with open(TOKEN_FILE, 'w') as f:
        f.write(token)
    print(f"Access token saved to {TOKEN_FILE}")


def load_access_token():
    """Load access token from local file"""
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'r') as f:
            token = f.read().strip()
        if token:
            print(f"Loaded access token from {TOKEN_FILE}")
            return token
    return None


def get_access_token(api_key, api_secret):
    """Get new access token via login flow with automatic token capture"""
    global captured_request_token
    captured_request_token = None

    kite = KiteConnect(api_key=api_key)
    url = kite.login_url()

    # Start HTTP server in a separate thread
    server = HTTPServer(('localhost', PORT), CallbackHandler)
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    print(f"\nStarting local server on http://localhost:{PORT}")
    print("Opening browser for Kite login...")
    print("Waiting for login callback...\n")

    # Open browser with login URL
    webbrowser.open(url)

    # Wait for the callback to capture the request token
    server_thread.join(timeout=120)  # Wait up to 2 minutes for login

    # Shutdown the server
    server.server_close()

    if not captured_request_token:
        raise Exception("Failed to capture request token. Login timeout or callback not received.")

    # Generate session with captured token
    print("Generating session with captured token...")
    data = kite.generate_session(captured_request_token, api_secret=api_secret)
    access_token = data["access_token"]
    kite.set_access_token(access_token)
    print(f"New access token: {access_token}")

    # Save token to file
    save_access_token(access_token)

    return access_token


def fetch_holdings(api_key, api_secret, access_token):
    """
    Fetch holdings from Kite API.
    Retry with new token if authentication fails.

    Args:
        api_key: Kite API key
        api_secret: Kite API secret
        access_token: Current access token

    Returns:
        list: List of holdings dictionaries
    """
    kite = KiteConnect(api_key=api_key)
    kite.set_access_token(access_token)

    try:
        # Get holdings
        holdings = kite.holdings()
        print(f"Retrieved {len(holdings)} holdings")
        return holdings
    except KiteException as e:
        print(f"Error fetching holdings: {e}")
        print("Access token may be invalid. Attempting to get new token...")

        # Get new access token and retry
        new_token = get_access_token(api_key, api_secret)
        kite.set_access_token(new_token)

        # Retry fetching holdings
        holdings = kite.holdings()
        print(f"Retrieved {len(holdings)} holdings with new token")
        return holdings


def fetch_mf_holdings(api_key, api_secret, access_token):
    """
    Fetch mutual fund holdings from Kite API (Coin / DEMAT MF units).
    Retry with new token if authentication fails.

    Args:
        api_key: Kite API key
        api_secret: Kite API secret
        access_token: Current access token

    Returns:
        list: List of MF holding dicts (see Kite mf/holdings docs)
    """
    kite = KiteConnect(api_key=api_key)
    kite.set_access_token(access_token)

    try:
        mf_holdings = kite.mf_holdings()
        print(f"Retrieved {len(mf_holdings)} mutual fund holdings")
        return mf_holdings
    except KiteException as e:
        print(f"Error fetching MF holdings: {e}")
        print("Access token may be invalid. Attempting to get new token...")

        new_token = get_access_token(api_key, api_secret)
        kite.set_access_token(new_token)

        mf_holdings = kite.mf_holdings()
        print(f"Retrieved {len(mf_holdings)} mutual fund holdings with new token")
        return mf_holdings


def fetch_mf_instruments(api_key, api_secret, access_token):
    """
    Fetch mutual fund instrument master (CSV parsed to list of dicts).
    Same token retry behaviour as fetch_mf_holdings.
    """
    kite = KiteConnect(api_key=api_key)
    kite.set_access_token(access_token)

    try:
        instruments = kite.mf_instruments()
        print(f"Retrieved {len(instruments)} mutual fund instruments")
        return instruments
    except KiteException as e:
        print(f"Error fetching MF instruments: {e}")
        print("Access token may be invalid. Attempting to get new token...")

        new_token = get_access_token(api_key, api_secret)
        kite.set_access_token(new_token)

        instruments = kite.mf_instruments()
        print(f"Retrieved {len(instruments)} mutual fund instruments with new token")
        return instruments


def sync_holdings_to_mongo(holdings, mongo_uri, db_name="misc", collection_name="track_ticks"):
    """
    Sync holdings to MongoDB, tracking enabled/disabled status and history.

    Args:
        holdings: List of holdings dictionaries from Kite API
        mongo_uri: MongoDB connection URI
        db_name: Database name (default: "misc")
        collection_name: Collection name (default: "track_ticks")

    Returns:
        dict: Summary statistics (added, disabled, unchanged counts)
    """
    # Connect to MongoDB
    client = MongoClient(mongo_uri)
    db = client[db_name]
    collection = db[collection_name]

    # Get current timestamp
    current_time = datetime.datetime.now(datetime.UTC)

    # Extract tradingsymbols from current holdings
    current_symbols = {holding["tradingsymbol"] for holding in holdings}
    print(f"Current holdings: {current_symbols}")

    # Fetch all existing holdings from database
    existing_holdings = list(collection.find({}))
    existing_symbols = {doc["tradingsymbol"]: doc for doc in existing_holdings}
    print(f"Existing holdings in DB: {set(existing_symbols.keys())}")

    # Track statistics
    added_count = 0
    disabled_count = 0
    unchanged_count = 0

    # Process current holdings - add new or skip if already enabled
    for symbol in current_symbols:
        if symbol not in existing_symbols:
            # New holding - insert with enabled=True
            new_doc = {
                "tradingsymbol": symbol,
                "enabled": True,
                "history": [{"enabled_at": current_time, "disabled_at": None}]
            }
            collection.insert_one(new_doc)
            print(f"Added new holding: {symbol}")
            added_count += 1
        else:
            # Existing holding
            existing_doc = existing_symbols[symbol]
            if existing_doc.get("enabled", False):
                # Already enabled - skip
                print(f"Holding already enabled: {symbol}")
                unchanged_count += 1
            else:
                # Re-enable the holding
                # Add new entry to history and set enabled=True
                collection.update_one(
                    {"tradingsymbol": symbol},
                    {
                        "$set": {"enabled": True},
                        "$push": {"history": {"enabled_at": current_time, "disabled_at": None}}
                    }
                )
                print(f"Re-enabled holding: {symbol}")
                added_count += 1

    # Disable holdings that are in DB but not in current list
    symbols_to_disable = set(existing_symbols.keys()) - current_symbols
    for symbol in symbols_to_disable:
        existing_doc = existing_symbols[symbol]
        if existing_doc.get("enabled", False):
            # Update the last history entry's disabled_at and set enabled=False
            history = existing_doc.get("history", [])
            if history and history[-1].get("disabled_at") is None:
                history[-1]["disabled_at"] = current_time

            collection.update_one(
                {"tradingsymbol": symbol},
                {
                    "$set": {
                        "enabled": False,
                        "history": history
                    }
                }
            )
            print(f"Disabled holding: {symbol}")
            disabled_count += 1

    print(f"\nSummary:")
    print(f"  - Added/Re-enabled: {added_count}")
    print(f"  - Disabled: {disabled_count}")
    print(f"  - Unchanged: {unchanged_count}")

    client.close()

    return {
        "added": added_count,
        "disabled": disabled_count,
        "unchanged": unchanged_count
    }


if __name__ == "__main__":
    load_dotenv()

    # Add this to your .env file
    api_key = os.getenv("API_KEY")
    api_secret = os.getenv("API_SECRET")
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("MONGO_DB_NAME")
    collection_name = os.getenv("MONGO_DB_COLLECTION_NAME")

    # Try to load cached access token
    access_token = load_access_token()

    # If no cached token, get new one
    if not access_token:
        print("No cached token found. Getting new access token...")
        access_token = get_access_token(api_key, api_secret)

    # Fetch holdings from Kite API (will automatically retry with new token if needed)
    holdings = fetch_holdings(api_key, api_secret, access_token)

    # Sync to MongoDB if credentials are provided, otherwise just print holdings
    if mongo_uri and db_name and collection_name:
        print("\nMongoDB credentials found. Syncing holdings to database...")
        sync_holdings_to_mongo(holdings, mongo_uri, db_name, collection_name)
    else:
        print("\nNo MongoDB credentials found. Printing holdings:")
        print("\nHoldings:")
        print("-" * 80)
        for holding in holdings:
            print(f"Symbol: {holding.get('tradingsymbol', 'N/A')}")
            print(f"  Quantity: {holding.get('quantity', 0)}")
            print(f"  Average Price: ₹{holding.get('average_price', 0):.2f}")
            print(f"  Last Price: ₹{holding.get('last_price', 0):.2f}")
            print(f"  P&L: ₹{holding.get('pnl', 0):.2f}")
            print("-" * 80)


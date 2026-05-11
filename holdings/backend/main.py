import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

load_dotenv(_REPO_ROOT / ".env")

import logging

import kite  # noqa: E402 — after sys.path and dotenv

from holdings.backend.db import (
    get_connection,
    get_db_path,
    get_latest_snapshot,
    get_snapshot_detail,
    insert_snapshot,
    list_snapshots,
)
from holdings.backend.mf_expense import build_expense_map, load_expense_overrides
from holdings.backend.fund_details_service import get_fund_details
from holdings.backend.mfapi_client import MFAPIError

logger = logging.getLogger(__name__)

app = FastAPI(
    title="MF Holdings",
    description="Mutual fund holdings snapshots from Kite Connect",
    version="1.0.0",
)

_origins = os.environ.get("HOLDINGS_CORS_ORIGINS", "http://localhost:5173")
_cors_list = [o.strip() for o in _origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "db": str(get_db_path())}


def _kite_credentials():
    api_key = os.getenv("API_KEY")
    api_secret = os.getenv("API_SECRET")
    if not api_key or not api_secret:
        raise HTTPException(
            status_code=503,
            detail="API_KEY and API_SECRET must be set in the repository .env file.",
        )
    return api_key, api_secret


@app.get("/api/mf/latest")
def mf_latest():
    with get_connection() as conn:
        snap = get_latest_snapshot(conn)
    if not snap:
        return None
    return snap


@app.get("/api/mf/snapshots")
def mf_snapshots(limit: int = 50):
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")
    with get_connection() as conn:
        return list_snapshots(conn, limit=limit)


@app.get("/api/mf/snapshots/{snapshot_id}")
def mf_snapshot_by_id(snapshot_id: int):
    with get_connection() as conn:
        snap = get_snapshot_detail(conn, snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap


@app.get("/api/mf/mfapi-details")
def mf_mfapi_details(
    isin: str = Query(..., min_length=8, description="Fund ISIN (Kite tradingsymbol)"),
    fund_name: str = Query(
        ...,
        min_length=2,
        description="Scheme name from Kite holdings (used for MFapi.in search)",
    ),
    refresh: bool = Query(
        False,
        description="Bypass cache and refetch (Captnemo primary, MFapi.in fallback)",
    ),
):
    """Scheme facts: primary mf.captnemo.in (TER, AUM, returns); fallback MFapi.in from NAV."""
    with get_connection() as conn:
        try:
            return get_fund_details(
                conn,
                isin,
                fund_name,
                bypass_cache=refresh,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except LookupError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except MFAPIError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/api/mf/snapshot")
def mf_create_snapshot():
    api_key, api_secret = _kite_credentials()
    access_token = kite.load_access_token()
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="No access token. Run `python kite.py` from the repository root to log in.",
        )

    try:
        rows = kite.fetch_mf_holdings(api_key, api_secret, access_token)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Kite API error: {e!s}",
        ) from e

    try:
        instruments = kite.fetch_mf_instruments(api_key, api_secret, access_token)
    except Exception as e:
        logger.warning("MF instruments fetch failed (expense ratios may be empty): %s", e)
        instruments = []

    overrides = load_expense_overrides(_REPO_ROOT)
    expense_map = build_expense_map(instruments, overrides)

    with get_connection() as conn:
        sid = insert_snapshot(conn, rows, expense_map)
        snap = get_snapshot_detail(conn, sid)

    return snap

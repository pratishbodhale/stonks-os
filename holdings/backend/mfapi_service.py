"""Resolve MFapi.in scheme by ISIN + fund name; cache JSON in SQLite."""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

import sqlite3

from holdings.backend import mfapi_client as mf

logger = logging.getLogger(__name__)


def _cache_ttl_seconds() -> int:
    return int(os.environ.get("MFAPI_CACHE_TTL_SECONDS", "21600"))


def _parse_iso_utc(s: str) -> datetime:
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def _cache_fresh(fetched_at: str, ttl: int) -> bool:
    try:
        t = _parse_iso_utc(fetched_at)
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    age = datetime.now(timezone.utc) - t
    return age.total_seconds() < ttl


def fetch_mfapi_scheme_payload(isin_u: str, fund_name: str) -> dict[str, Any]:
    """
    Resolve scheme via MFapi.in search + ISIN check; fetch NAV history; build payload.
    Does not read or write SQLite cache.
    """
    fn = (fund_name or "").strip()
    if not fn:
        raise ValueError("fund_name is required for MFapi.in search")

    resolved = mf.resolve_scheme_code(isin_u, fn)
    if not resolved:
        raise LookupError(
            "No MFapi.in scheme matched this ISIN. Try a fresh snapshot or check the fund name.",
        )
    scheme_code, _ = resolved

    latest = mf.fetch_latest(scheme_code)
    history_end = date.today()
    history_start = history_end - timedelta(days=365 * 6 + 90)
    try:
        history = mf.fetch_nav_history(scheme_code, history_start, history_end)
    except mf.MFAPIError as e:
        logger.warning("MFapi NAV history failed, retrying shorter window: %s", e)
        history_start = history_end - timedelta(days=800)
        history = mf.fetch_nav_history(scheme_code, history_start, history_end)

    return mf.build_details_payload(
        isin_u,
        fn,
        scheme_code,
        latest,
        history,
        history_start,
        history_end,
    )


def get_mfapi_scheme_details(
    conn: sqlite3.Connection,
    isin: str,
    fund_name: str,
    *,
    bypass_cache: bool = False,
) -> dict[str, Any]:
    """
    MFapi.in-only fetch (no SQLite cache — use fund_details_service.get_fund_details for caching).
    `conn` and `bypass_cache` are kept for backward compatibility.
    """
    del conn, bypass_cache
    isin_u = isin.strip().upper()
    if not isin_u or not isin_u.startswith("INF"):
        raise ValueError("Invalid or missing ISIN")

    fn = (fund_name or "").strip()
    if not fn:
        raise ValueError("fund_name is required for MFapi.in search")

    payload = fetch_mfapi_scheme_payload(isin_u, fn)
    payload["cached"] = False
    return payload

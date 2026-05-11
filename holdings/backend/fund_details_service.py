"""Fund facts: primary [mf.captnemo.in](https://mf.captnemo.in/) (Kuvera JSON), fallback MFapi.in."""

from __future__ import annotations

import logging
from typing import Any

import sqlite3

from holdings.backend import captnemo_client as cn
from holdings.backend.db import get_mfapi_cache, set_mfapi_cache
from holdings.backend.mfapi_client import MFAPIError
from holdings.backend.mfapi_service import (
    _cache_fresh,
    _cache_ttl_seconds,
    fetch_mfapi_scheme_payload,
)

logger = logging.getLogger(__name__)

CAPTNEMO_DISCLAIMER = (
    "Data via mf.captnemo.in (Kuvera-backed). AUM is converted from provider units "
    "(treated as ₹ lakh → ÷100 for ₹ crore); verify with the AMC if needed. "
    "Not investment advice."
)


def _normalize_legacy_cache(row: dict[str, Any]) -> dict[str, Any] | None:
    """Older cache stored flat MFapi payloads without wrapper keys."""
    if row.get("primary_source"):
        return None
    if row.get("captnemo") is not None or isinstance(row.get("mfapi"), dict):
        return None
    if "scheme_code" not in row and "meta" not in row:
        return None
    return {
        "isin": row.get("isin", ""),
        "fund_name_query": row.get("fund_name_query", ""),
        "primary_source": "mfapi.in",
        "fallback_used": False,
        "captnemo": None,
        "mfapi": row,
        "disclaimer": row.get("disclaimer", ""),
        "cached": row.get("cached", False),
    }


def get_fund_details(
    conn: sqlite3.Connection,
    isin: str,
    fund_name: str,
    *,
    bypass_cache: bool = False,
) -> dict[str, Any]:
    isin_u = isin.strip().upper()
    if not isin_u or not isin_u.startswith("INF"):
        raise ValueError("Invalid or missing ISIN")

    fn = (fund_name or "").strip()
    if not fn:
        raise ValueError("fund_name is required when MFapi.in fallback may be needed")

    ttl = _cache_ttl_seconds()
    if not bypass_cache:
        cached = get_mfapi_cache(conn, isin_u)
        if cached:
            payload, fetched_at = cached
            if _cache_fresh(fetched_at, ttl):
                legacy = _normalize_legacy_cache(payload)
                out = legacy if legacy is not None else dict(payload)
                out["cached"] = True
                return out

    # Primary: mf.captnemo.in
    try:
        rows = cn.fetch_kuvera_by_isin(isin_u)
        row = cn.pick_plan_row(rows, isin_u)
    except cn.CaptnemoError as e:
        logger.warning("Captnemo primary failed: %s", e)
        row = None

    if row:
        block = cn.build_captnemo_block(row, isin_u, fn)
        out = {
            "isin": isin_u,
            "fund_name_query": fn,
            "primary_source": "captnemo",
            "fallback_used": False,
            "captnemo": block,
            "mfapi": None,
            "disclaimer": CAPTNEMO_DISCLAIMER,
            "cached": False,
        }
        set_mfapi_cache(conn, isin_u, out)
        return out

    # Fallback: MFapi.in
    mf_payload = fetch_mfapi_scheme_payload(isin_u, fn)

    out = {
        "isin": isin_u,
        "fund_name_query": fn,
        "primary_source": "mfapi.in",
        "fallback_used": True,
        "captnemo": None,
        "mfapi": mf_payload,
        "disclaimer": mf_payload.get("disclaimer", ""),
        "cached": False,
    }
    set_mfapi_cache(conn, isin_u, out)
    return out

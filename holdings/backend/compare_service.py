"""Batch compare holdings: fund details with configurable cache TTL (default 1 day, max 1 day)."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import sqlite3

from holdings.backend.fund_details_service import get_fund_details
from holdings.backend.mfapi_client import MFAPIError

logger = logging.getLogger(__name__)

_COMPARE_MAX = 40


def _compare_cache_ttl_seconds() -> int:
    """TTL for treating SQLite mfapi_cache as fresh in compare flows; capped at 86400 (1 day)."""
    raw = int(os.environ.get("HOLDINGS_COMPARE_CACHE_TTL_SECONDS", "86400"))
    return max(60, min(raw, 86400))


def _mf_meta(mf: dict[str, Any] | None) -> dict[str, Any]:
    if not mf or not isinstance(mf.get("meta"), dict):
        return {}
    return mf["meta"]


def _normalize_compare_row(holding: dict[str, Any], detail: dict[str, Any]) -> dict[str, Any]:
    cap = detail.get("captnemo") if isinstance(detail.get("captnemo"), dict) else {}
    mf = detail.get("mfapi") if isinstance(detail.get("mfapi"), dict) else {}
    meta = _mf_meta(mf if mf else None)

    ter = cap.get("expense_ratio_pct")
    if ter is None:
        ter = holding.get("expense_ratio_snapshot")

    ret1 = cap.get("return_1y_pct")
    if ret1 is None and mf:
        ret1 = mf.get("return_1y_total_pct")
        if ret1 is None:
            ret1 = mf.get("return_1y_cagr_pct")

    ret3 = cap.get("return_3y_pct")
    if ret3 is None and mf:
        ret3 = mf.get("return_3y_cagr_pct")

    ret5 = cap.get("return_5y_pct")
    if ret5 is None and mf:
        ret5 = mf.get("return_5y_cagr_pct")

    cat = cap.get("fund_category") or cap.get("category")
    if not cat:
        cat = meta.get("scheme_category")

    amc = cap.get("fund_house")
    if not amc:
        amc = meta.get("fund_house")

    aum = cap.get("aum_crore_est")

    nav = cap.get("nav")
    nav_date = cap.get("nav_date")
    if nav is None and mf:
        nav = mf.get("latest_nav")
        nav_date = mf.get("latest_nav_date")

    return {
        "isin": detail.get("isin", holding.get("isin", "")),
        "fund_name": holding.get("fund_name") or "",
        "weight_pct": holding.get("weight_pct"),
        "invested_value": holding.get("invested_value"),
        "current_value": holding.get("current_value"),
        "expense_ratio_snapshot": holding.get("expense_ratio_snapshot"),
        "primary_source": detail.get("primary_source"),
        "fallback_used": bool(detail.get("fallback_used")),
        "cached_detail": bool(detail.get("cached")),
        "ter_pct": ter,
        "aum_crore_est": aum,
        "category": cat,
        "amc": amc,
        "return_1y_pct": ret1,
        "return_3y_pct": ret3,
        "return_5y_pct": ret5,
        "nav": nav,
        "nav_date": nav_date,
        "error": None,
    }


def _error_row(holding: dict[str, Any], isin_u: str, err: str) -> dict[str, Any]:
    return {
        "isin": isin_u,
        "fund_name": (holding.get("fund_name") or "").strip(),
        "weight_pct": holding.get("weight_pct"),
        "invested_value": holding.get("invested_value"),
        "current_value": holding.get("current_value"),
        "expense_ratio_snapshot": holding.get("expense_ratio_snapshot"),
        "primary_source": None,
        "fallback_used": None,
        "cached_detail": None,
        "ter_pct": holding.get("expense_ratio_snapshot"),
        "aum_crore_est": None,
        "category": None,
        "amc": None,
        "return_1y_pct": None,
        "return_3y_pct": None,
        "return_5y_pct": None,
        "nav": None,
        "nav_date": None,
        "error": err,
    }


def run_compare(
    conn: sqlite3.Connection,
    holdings: list[dict[str, Any]],
    *,
    refresh: bool,
) -> dict[str, Any]:
    if len(holdings) > _COMPARE_MAX:
        raise ValueError(f"At most {_COMPARE_MAX} funds per compare request")

    ttl = _compare_cache_ttl_seconds()
    rows_out: list[dict[str, Any]] = []

    for h in holdings:
        isin_raw = (h.get("isin") or "").strip()
        isin_u = isin_raw.upper()
        fund_name = (h.get("fund_name") or "").strip()

        if not isin_u or not isin_u.startswith("INF"):
            rows_out.append(_error_row(h, isin_u or isin_raw, "Invalid or missing ISIN"))
            continue
        if not fund_name:
            rows_out.append(
                _error_row(h, isin_u, "fund_name is required for external lookup"),
            )
            continue

        try:
            detail = get_fund_details(
                conn,
                isin_u,
                fund_name,
                bypass_cache=refresh,
                cache_ttl_seconds=ttl,
            )
            rows_out.append(_normalize_compare_row(h, detail))
        except (ValueError, LookupError) as e:
            rows_out.append(_error_row(h, isin_u, str(e)))
        except MFAPIError as e:
            logger.warning("Compare MFapi error for %s: %s", isin_u, e)
            rows_out.append(_error_row(h, isin_u, str(e)))
        except Exception as e:
            logger.exception("Compare unexpected error for %s", isin_u)
            rows_out.append(_error_row(h, isin_u, str(e)))

    return {
        "rows": rows_out,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "cache_ttl_seconds": ttl,
    }

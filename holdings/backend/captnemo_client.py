"""https://mf.captnemo.in — ISIN-based mutual fund metadata (proxies to Kuvera JSON)."""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_BASE = "https://mf.captnemo.in"
USER_AGENT = "stonks-os-holdings/1.0"


class CaptnemoError(Exception):
    """mf.captnemo.in / upstream returned an error or invalid JSON."""


def _base_url() -> str:
    return os.environ.get("CAPTNEMO_BASE_URL", DEFAULT_BASE).rstrip("/")


def fetch_kuvera_by_isin(isin: str, *, attempts: int = 2) -> list[dict[str, Any]]:
    """
    GET /kuvera/:isin — returns a JSON list of plan objects (often one element).
    Follows redirects (e.g. to api.kuvera.in).
    """
    path = "/kuvera/" + urllib.parse.quote(isin.strip().upper())
    url = f"{_base_url()}{path}"
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                method="GET",
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            if raw.lstrip().startswith("<"):
                raise CaptnemoError("Captnemo returned HTML instead of JSON")
            data = json.loads(raw)
            if not isinstance(data, list):
                raise CaptnemoError("Unexpected Captnemo response (not a list)")
            return data
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, CaptnemoError) as e:
            last_err = e
            logger.warning("Captnemo request failed (%s/%s): %s", i + 1, attempts, e)
            time.sleep(0.35 * (i + 1))
    raise CaptnemoError(f"Captnemo failed after {attempts} tries: {last_err!s}") from last_err


def pick_plan_row(rows: list[dict[str, Any]], isin_u: str) -> dict[str, Any] | None:
    """Prefer row whose ISIN matches (case-insensitive)."""
    for row in rows:
        if str(row.get("ISIN", "")).strip().upper() == isin_u:
            return row
    return rows[0] if rows else None


def aum_lakhs_to_crore_inr(aum: Any) -> float | None:
    """
    Kuvera `aum` is commonly reported in INR lakhs; convert to crore for display.
    (1 crore INR = 100 lakh INR.)
    """
    if aum is None:
        return None
    try:
        lakhs = float(aum)
    except (TypeError, ValueError):
        return None
    return lakhs / 100.0


def expense_ratio_pct(row: dict[str, Any]) -> float | None:
    er = row.get("expense_ratio")
    if er is None or er == "":
        return None
    try:
        return float(er)
    except (TypeError, ValueError):
        return None


def nav_latest(row: dict[str, Any]) -> tuple[float | None, str | None]:
    nav = row.get("nav")
    if isinstance(nav, dict):
        try:
            v = float(nav.get("nav"))
        except (TypeError, ValueError):
            v = None
        return v, str(nav.get("date") or "").strip() or None
    return None, None


def returns_block(row: dict[str, Any]) -> dict[str, Any]:
    r = row.get("returns")
    return r if isinstance(r, dict) else {}


def float_or_none(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def build_captnemo_block(row: dict[str, Any], isin_u: str, fund_name_query: str) -> dict[str, Any]:
    rb = returns_block(row)
    nav_v, nav_d = nav_latest(row)
    return {
        "name": row.get("name"),
        "code": row.get("code"),
        "fund_house": row.get("fund_house"),
        "fund_name": row.get("fund_name"),
        "fund_category": row.get("fund_category") or row.get("category"),
        "category": row.get("category"),
        "expense_ratio_pct": expense_ratio_pct(row),
        "expense_ratio_date": row.get("expense_ratio_date"),
        "aum_crore_est": aum_lakhs_to_crore_inr(row.get("aum")),
        "return_1y_pct": float_or_none(rb.get("year_1")),
        "return_3y_pct": float_or_none(rb.get("year_3")),
        "return_5y_pct": float_or_none(rb.get("year_5")),
        "return_inception_pct": float_or_none(rb.get("inception")),
        "returns_as_of": rb.get("date"),
        "nav": nav_v,
        "nav_date": nav_d,
        "volatility": float_or_none(row.get("volatility")),
        "detail_info": row.get("detail_info"),
        "isin": isin_u,
        "fund_name_query": fund_name_query,
    }

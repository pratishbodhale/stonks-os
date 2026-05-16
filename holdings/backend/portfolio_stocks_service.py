"""Aggregate underlying equity names across MF holdings using mfdata.in (optional third-party)."""

from __future__ import annotations

import logging
import os
import time
import urllib.parse
from collections import defaultdict
from typing import Any

from holdings.backend.mfdata_portfolio_client import MfdataError, base_url, get_json, unwrap_success

logger = logging.getLogger(__name__)

_DEFAULT_MAX_FUNDS = 20
_REQUEST_GAP_SEC = 0.45


def _max_funds() -> int:
    try:
        n = int(os.environ.get("HOLDINGS_STOCK_OVERLAP_MAX_FUNDS", str(_DEFAULT_MAX_FUNDS)))
    except ValueError:
        n = _DEFAULT_MAX_FUNDS
    return max(1, min(n, 40))


def _search_schemes(query: str) -> list[dict[str, Any]]:
    q = (query or "").strip()
    if not q:
        return []
    path = "/api/v1/search?q=" + urllib.parse.quote(q)
    raw = get_json(path)
    data = unwrap_success(raw)
    if not isinstance(data, list):
        return []
    return [x for x in data if isinstance(x, dict)]


def _scheme_detail(scheme_code: int) -> dict[str, Any] | None:
    path = f"/api/v1/schemes/{scheme_code}"
    raw = get_json(path)
    data = unwrap_success(raw)
    return data if isinstance(data, dict) else None


def _family_equity_holdings(family_id: int, month: str | None = None) -> tuple[list[dict[str, Any]], str | None]:
    qs = f"/api/v1/families/{family_id}/holdings?holding_type=equity"
    if month:
        qs += "&month=" + urllib.parse.quote(month, safe="")
    raw = get_json(qs)
    data = unwrap_success(raw)
    if not isinstance(data, dict):
        return [], None
    month_out = data.get("month")
    if isinstance(month_out, str):
        m = month_out
    else:
        m = None
    eq = data.get("equity")
    if not isinstance(eq, list):
        return [], m
    return [h for h in eq if isinstance(h, dict)], m


def _pick_scheme_code(isin_u: str, fund_name: str) -> tuple[int | None, str | None]:
    """Return (scheme_code, match_note) or (None, error)."""
    hits = _search_schemes(isin_u)
    if not hits and fund_name:
        hits = _search_schemes(fund_name[:100])
    if not hits:
        return None, "No mfdata.in search match for this ISIN or fund name."

    for h in hits:
        code = h.get("scheme_code")
        if code is None:
            continue
        try:
            return int(code), None
        except (TypeError, ValueError):
            continue
    return None, "mfdata.in search returned no usable scheme_code."


def run_portfolio_stock_overlap(
    positions: list[dict[str, Any]],
    total_current: float,
) -> dict[str, Any]:
    """
    For each MF position (by ISIN), resolve AMFI scheme → family_id → latest equity
    holdings, then compute synthetic portfolio weight per stock:

        effective_pct += (user_fund_weight_pct) * (stock_weight_pct_in_fund / 100)

    user_fund_weight_pct = 100 * current_value / total_current
    """
    if total_current <= 0:
        raise ValueError("total_current must be positive")

    max_n = _max_funds()
    rows_in = sorted(
        [p for p in positions if float(p.get("current_value") or 0) > 0],
        key=lambda p: float(p.get("current_value") or 0),
        reverse=True,
    )[:max_n]

    funds_out: list[dict[str, Any]] = []
    # stock_key (upper name) -> list of contribution dicts
    agg: dict[str, list[dict[str, Any]]] = defaultdict(list)
    display_name: dict[str, str] = {}
    sector_by_key: dict[str, str | None] = {}
    global_month: str | None = None

    for p in rows_in:
        isin = str(p.get("tradingsymbol") or "").strip().upper()
        fname = str(p.get("fund") or isin).strip()
        cur = float(p.get("current_value") or 0)
        user_w_pct = 100.0 * cur / float(total_current)

        fund_entry: dict[str, Any] = {
            "isin": isin,
            "fund_name": fname,
            "scheme_code": None,
            "family_id": None,
            "user_weight_pct": round(user_w_pct, 4),
            "current_value": cur,
            "equities_loaded": 0,
            "holdings_month": None,
            "error": None,
        }

        if not isin.startswith("INF"):
            fund_entry["error"] = "Not a mutual fund ISIN (expected INF…)."
            funds_out.append(fund_entry)
            continue

        try:
            time.sleep(_REQUEST_GAP_SEC)
            scode, err = _pick_scheme_code(isin, fname)
            if scode is None:
                fund_entry["error"] = err or "Scheme not found."
                funds_out.append(fund_entry)
                continue
            fund_entry["scheme_code"] = scode

            time.sleep(_REQUEST_GAP_SEC)
            detail = _scheme_detail(scode)
            if not detail:
                fund_entry["error"] = "Scheme detail empty."
                funds_out.append(fund_entry)
                continue
            fid = detail.get("family_id")
            if fid is None:
                fund_entry["error"] = "No family_id on scheme (cannot load holdings)."
                funds_out.append(fund_entry)
                continue
            try:
                family_id = int(fid)
            except (TypeError, ValueError):
                fund_entry["error"] = "Invalid family_id."
                funds_out.append(fund_entry)
                continue
            fund_entry["family_id"] = family_id

            time.sleep(_REQUEST_GAP_SEC)
            equities, month = _family_equity_holdings(family_id)
            if global_month is None and month:
                global_month = month
            fund_entry["holdings_month"] = month
            fund_entry["equities_loaded"] = len(equities)

            for h in equities:
                name = str(h.get("name") or "").strip()
                if not name:
                    continue
                key = name.upper()
                display_name.setdefault(key, name)
                if key not in sector_by_key:
                    sec = h.get("sector")
                    sector_by_key[key] = str(sec).strip() if sec else None
                try:
                    w_fund = float(h.get("weight_pct") or 0)
                except (TypeError, ValueError):
                    w_fund = 0.0
                contrib = user_w_pct * (w_fund / 100.0)
                agg[key].append(
                    {
                        "fund_name": fname,
                        "isin": isin,
                        "weight_in_fund_pct": round(w_fund, 4),
                        "contribution_pct": round(contrib, 6),
                    },
                )
        except MfdataError as e:
            logger.warning("mfdata error for %s: %s", isin, e)
            fund_entry["error"] = str(e)
        except Exception as e:
            logger.exception("Unexpected overlap error for %s", isin)
            fund_entry["error"] = str(e)

        funds_out.append(fund_entry)

    aggregated: list[dict[str, Any]] = []
    for key, contribs in agg.items():
        total_eff = sum(c.get("contribution_pct") or 0 for c in contribs)
        aggregated.append(
            {
                "name": display_name.get(key, key),
                "sector": sector_by_key.get(key),
                "effective_portfolio_pct": round(total_eff, 4),
                "contributions": sorted(
                    contribs,
                    key=lambda c: -(c.get("contribution_pct") or 0),
                ),
            },
        )
    aggregated.sort(key=lambda r: -(r.get("effective_portfolio_pct") or 0))

    return {
        "source": "mfdata.in",
        "base_url": base_url(),
        "holdings_month": global_month,
        "total_current": float(total_current),
        "funds_analyzed": len(rows_in),
        "funds": funds_out,
        "aggregated_equity": aggregated,
        "disclaimer": (
            "Underlying weights come from mfdata.in monthly portfolio disclosure (equity "
            "slice). Synthetic % = your allocation to each fund × that stock’s weight "
            "inside the fund. Debt, hybrids, and international sleeves are incomplete "
            "here; verify with AMC factsheets. Not investment advice."
        ),
    }

"""HTTP client for https://api.mfapi.in — search, latest NAV, NAV history."""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_BASE = "https://api.mfapi.in"
USER_AGENT = "stonks-os-holdings/1.0 (https://github.com/)"


class MFAPIError(Exception):
    """MFapi.in returned an error or non-JSON body."""


def _base_url() -> str:
    return os.environ.get("MFAPI_BASE_URL", DEFAULT_BASE).rstrip("/")


def http_json(method: str, path: str, *, attempts: int = 2) -> Any:
    url = f"{_base_url()}{path}"
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                method=method,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            if raw.lstrip().startswith("<"):
                raise MFAPIError(f"MFapi.in returned HTML (upstream error) for {path[:80]}")
            return json.loads(raw)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last_err = e
            logger.warning("MFapi request failed (%s/%s): %s", i + 1, attempts, e)
            time.sleep(0.4 * (i + 1))
    raise MFAPIError(f"MFapi.in request failed after {attempts} tries: {last_err!s}") from last_err


def search_schemes(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []
    q = urllib.parse.quote(query.strip())
    data = http_json("GET", f"/mf/search?q={q}")
    if not isinstance(data, list):
        return []
    return data


def fetch_latest(scheme_code: int) -> dict[str, Any]:
    data = http_json("GET", f"/mf/{scheme_code}/latest")
    if not isinstance(data, dict):
        raise MFAPIError("Unexpected latest NAV response shape")
    return data


def fetch_nav_history(
    scheme_code: int,
    start: date,
    end: date,
) -> dict[str, Any]:
    qs = urllib.parse.urlencode(
        {
            "startDate": start.strftime("%d-%m-%Y"),
            "endDate": end.strftime("%d-%m-%Y"),
        }
    )
    data = http_json("GET", f"/mf/{scheme_code}?{qs}")
    if not isinstance(data, dict):
        raise MFAPIError("Unexpected NAV history response shape")
    return data


def meta_isin_matches(meta: dict[str, Any], isin: str) -> bool:
    want = isin.strip().upper()
    for key in ("isin_growth", "isin_div_reinvestment"):
        v = meta.get(key)
        if v and str(v).strip().upper() == want:
            return True
    return False


def search_queries(fund_name: str, isin: str) -> list[str]:
    out: list[str] = []
    fn = (fund_name or "").strip()
    if fn:
        out.append(fn[:140])
        if len(fn) > 70:
            out.append(fn[:70])
        head = fn.split(" - ")[0].strip()
        if head and head not in out:
            out.append(head[:100])
    seen: set[str] = set()
    ordered: list[str] = []
    for q in out:
        if q and q not in seen:
            seen.add(q)
            ordered.append(q)
    if isin.strip():
        ordered.append(isin.strip())
    return ordered


def resolve_scheme_code(isin: str, fund_name: str) -> tuple[int, str] | None:
    """Pick AMFI scheme_code whose /latest meta matches ISIN."""
    isin_u = isin.strip().upper()
    for q in search_queries(fund_name, isin_u):
        try:
            hits = search_schemes(q)
        except MFAPIError:
            continue
        for h in hits[:25]:
            try:
                code = int(h.get("schemeCode"))
            except (TypeError, ValueError):
                continue
            try:
                latest = fetch_latest(code)
            except MFAPIError:
                continue
            meta = latest.get("meta") or {}
            if meta_isin_matches(meta, isin_u):
                name = str(meta.get("scheme_name") or h.get("schemeName") or "")
                return code, name
    return None


def parse_nav_series(payload: dict[str, Any]) -> list[tuple[datetime, float]]:
    rows = payload.get("data") or []
    out: list[tuple[datetime, float]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        ds = row.get("date")
        nv = row.get("nav")
        if not ds or nv is None:
            continue
        try:
            dt = datetime.strptime(str(ds).strip(), "%d-%m-%Y").replace(tzinfo=timezone.utc)
            nav = float(str(nv).strip())
        except (ValueError, TypeError):
            continue
        out.append((dt, nav))
    out.sort(key=lambda x: x[0])
    return out


def trailing_total_return_pct(
    pts: list[tuple[datetime, float]],
    lookback_days: int,
) -> float | None:
    """Point-to-point total return over ~lookback_days using NAVs on/before window."""
    if len(pts) < 2:
        return None
    end_dt, end_nav = pts[-1]
    if end_nav <= 0:
        return None
    cutoff = end_dt - timedelta(days=lookback_days)
    start: tuple[datetime, float] | None = None
    for dt, nav in pts:
        if dt <= cutoff and nav > 0:
            start = (dt, nav)
        elif dt > cutoff:
            break
    if start is None:
        return None
    _, start_nav = start
    return (end_nav / start_nav - 1.0) * 100.0


def cagr_pct(
    pts: list[tuple[datetime, float]],
    lookback_days: int,
) -> float | None:
    """CAGR over the span from first NAV on/before (end - lookback) to last NAV."""
    simple = trailing_total_return_pct(pts, lookback_days)
    if simple is None:
        return None
    end_dt, end_nav = pts[-1]
    cutoff = end_dt - timedelta(days=lookback_days)
    start_row: tuple[datetime, float] | None = None
    for dt, nav in pts:
        if dt <= cutoff and nav > 0:
            start_row = (dt, nav)
        elif dt > cutoff:
            break
    if start_row is None:
        return None
    start_dt, start_nav = start_row
    if start_nav <= 0:
        return None
    years = (end_dt - start_dt).days / 365.25
    if years < 0.25:
        return None
    try:
        return ((end_nav / start_nav) ** (1.0 / years) - 1.0) * 100.0
    except (ZeroDivisionError, OSError, ValueError, OverflowError):
        return None


def build_details_payload(
    isin: str,
    fund_name: str,
    scheme_code: int,
    latest: dict[str, Any],
    history: dict[str, Any],
    history_start: date,
    history_end: date,
) -> dict[str, Any]:
    meta = dict(latest.get("meta") or {})
    pts = parse_nav_series(history)

    meta_out = {
        "fund_house": meta.get("fund_house"),
        "scheme_type": meta.get("scheme_type"),
        "scheme_category": meta.get("scheme_category"),
        "scheme_code": meta.get("scheme_code") or scheme_code,
        "scheme_name": meta.get("scheme_name"),
        "isin_growth": meta.get("isin_growth"),
        "isin_div_reinvestment": meta.get("isin_div_reinvestment"),
    }

    data_latest = (latest.get("data") or [])
    latest_nav: float | None = None
    latest_nav_date: str | None = None
    if data_latest and isinstance(data_latest[0], dict):
        try:
            latest_nav = float(str(data_latest[0].get("nav", "")).strip())
            latest_nav_date = str(data_latest[0].get("date") or "").strip() or None
        except (TypeError, ValueError):
            pass

    return {
        "source": "mfapi.in",
        "isin": isin.strip().upper(),
        "fund_name_query": fund_name,
        "scheme_code": scheme_code,
        "meta": meta_out,
        "latest_nav": latest_nav,
        "latest_nav_date": latest_nav_date,
        "nav_points_used": len(pts),
        "history_start": history_start.isoformat(),
        "history_end": history_end.isoformat(),
        "return_1y_total_pct": trailing_total_return_pct(pts, 365),
        "return_1y_cagr_pct": cagr_pct(pts, 365),
        "return_3y_cagr_pct": cagr_pct(pts, 365 * 3),
        "return_5y_cagr_pct": cagr_pct(pts, 365 * 5),
        "disclaimer": (
            "MFapi.in does not publish TER or AUM. Returns are estimated from NAV history "
            f"({history_start.isoformat()} to {history_end.isoformat()}); partial history yields nulls. "
            "Not investment advice."
        ),
    }

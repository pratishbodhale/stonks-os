"""Expense ratio: Kite mf/instruments CSV usually has no TER; optional JSON overrides."""

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def expense_ratio_from_instrument(ins: dict[str, Any]) -> float | None:
    """Pick TER from instrument dict if Kite adds CSV columns in the future."""
    for key in (
        "expense_ratio",
        "total_expense_ratio",
        "ter",
        "total_expense_ratio_percent",
        "scheme_total_expense_ratio",
    ):
        v = ins.get(key)
        if v is None or v == "":
            continue
        try:
            return float(v)
        except (TypeError, ValueError):
            continue
    for k, v in ins.items():
        if not isinstance(k, str):
            continue
        lk = k.lower()
        if ("expense" in lk and "ratio" in lk) or lk == "ter":
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return None


def load_expense_overrides(repo_root: Path) -> dict[str, float]:
    """ISIN (any case) -> TER in percent per year, e.g. 0.52 for 0.52%."""
    raw = os.environ.get("HOLDINGS_EXPENSE_RATIOS_PATH")
    path = (
        Path(raw).expanduser()
        if raw
        else repo_root / "holdings" / "data" / "expense_ratios.json"
    )
    if not path.is_file():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Could not read expense ratio overrides %s: %s", path, e)
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, float] = {}
    for k, v in data.items():
        try:
            out[str(k).strip().upper()] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def build_expense_map(
    instruments: list[dict[str, Any]],
    overrides: dict[str, float],
) -> dict[str, float | None]:
    """Uppercase ISIN -> TER % or None. Overrides replace instrument-derived values."""
    m: dict[str, float | None] = {}
    for ins in instruments:
        isin = (ins.get("tradingsymbol") or "").strip().upper()
        if not isin:
            continue
        m[isin] = expense_ratio_from_instrument(ins)
    for isin, pct in overrides.items():
        m[isin.strip().upper()] = pct
    return m

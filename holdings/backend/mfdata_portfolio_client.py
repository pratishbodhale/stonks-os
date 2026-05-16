"""Lightweight JSON client for mfdata.in (scheme search, family equity holdings)."""

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

DEFAULT_BASE = "https://mfdata.in"
USER_AGENT = "stonks-os-holdings/1.0"


class MfdataError(Exception):
    """mfdata.in returned an error, timeout, or unexpected JSON."""


def base_url() -> str:
    return os.environ.get("HOLDINGS_MFDATA_BASE_URL", DEFAULT_BASE).rstrip("/")


def get_json(path: str, *, attempts: int = 2, timeout: int = 25) -> Any:
    """GET path (must start with /). Returns parsed JSON (dict or list)."""
    url = base_url() + path
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                method="GET",
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            if raw.lstrip().startswith("<"):
                raise MfdataError("mfdata.in returned HTML instead of JSON")
            return json.loads(raw)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, MfdataError) as e:
            last_err = e
            logger.warning("mfdata.in request failed (%s/%s) %s: %s", i + 1, attempts, path[:80], e)
            time.sleep(0.4 * (i + 1))
    raise MfdataError(f"mfdata.in failed after {attempts} tries: {last_err!s}") from last_err


def unwrap_success(payload: Any) -> Any | None:
    if not isinstance(payload, dict):
        return None
    if payload.get("status") != "success":
        return None
    return payload.get("data")

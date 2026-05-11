"""Normalize provider strings for display (e.g. Kite sometimes drops '\\' before JSON \\uXXXX)."""

from __future__ import annotations

import re

_JSON_U_ESCAPE = re.compile(r"\\u([0-9a-fA-F]{4})", re.IGNORECASE)
_PLAIN_U_ESCAPE = re.compile(
    r"(?<![0-9a-fA-F\\])u([0-9a-fA-F]{4})(?![0-9a-fA-F])",
    re.IGNORECASE,
)


def normalize_fund_display_name(value: str | None) -> str | None:
    """
    Decode JSON-style \\uXXXX and mangled uXXXX (four hex digits) into real characters.
    Example: ``MOTILAL OSWAL Su0026P 500`` → ``MOTILAL OSWAL S&P 500``.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    t = value.strip()
    if not t:
        return t

    def _decode(m: re.Match[str]) -> str:
        try:
            cp = int(m.group(1), 16)
            if 0 <= cp <= 0x10FFFF:
                return chr(cp)
        except ValueError:
            pass
        return m.group(0)

    t = _JSON_U_ESCAPE.sub(_decode, t)
    t = _PLAIN_U_ESCAPE.sub(_decode, t)
    return t

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from holdings.backend.display_text import normalize_fund_display_name


def _default_db_path() -> Path:
    root = Path(__file__).resolve().parents[1]
    data_dir = root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "mf_holdings.db"


def get_db_path() -> Path:
    import os

    raw = os.environ.get("HOLDINGS_DB_PATH")
    if raw:
        p = Path(raw).expanduser()
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    return _default_db_path()


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_connection(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    path = db_path or get_db_path()
    conn = _connect(path)
    try:
        init_schema(conn)
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'kite'
        );

        CREATE TABLE IF NOT EXISTS mf_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            tradingsymbol TEXT NOT NULL,
            fund TEXT,
            folio TEXT,
            quantity REAL,
            average_price REAL,
            last_price REAL,
            pledged_quantity REAL,
            pnl REAL,
            invested_value REAL NOT NULL,
            current_value REAL NOT NULL,
            raw_json TEXT,
            FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_mf_positions_snapshot
            ON mf_positions(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_snapshots_created
            ON snapshots(created_at);
        """
    )
    _migrate_mf_positions(conn)
    _migrate_mfapi_cache(conn)


def _migrate_mf_positions(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(mf_positions)").fetchall()}
    if "expense_ratio" not in cols:
        conn.execute("ALTER TABLE mf_positions ADD COLUMN expense_ratio REAL")


def _migrate_mfapi_cache(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS mfapi_cache (
            isin TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL
        )
        """
    )


def get_mfapi_cache(conn: sqlite3.Connection, isin: str) -> tuple[dict[str, Any], str] | None:
    row = conn.execute(
        "SELECT payload_json, fetched_at FROM mfapi_cache WHERE isin = ?",
        (isin.strip().upper(),),
    ).fetchone()
    if not row:
        return None
    return json.loads(row["payload_json"]), str(row["fetched_at"])


def set_mfapi_cache(conn: sqlite3.Connection, isin: str, payload: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO mfapi_cache (isin, payload_json, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(isin) DO UPDATE SET
            payload_json = excluded.payload_json,
            fetched_at = excluded.fetched_at
        """,
        (isin.strip().upper(), json.dumps(payload), now),
    )


def _mark_to_market_pnl(invested: float, current: float) -> float:
    """Kite MF `pnl` is often 0; use cost vs last NAV for display."""
    return current - invested


def _profit_pct(invested: float, current: float) -> float | None:
    if invested <= 0:
        return None
    return ((current / invested) - 1.0) * 100.0


def _row_to_position(row: sqlite3.Row) -> dict[str, Any]:
    invested = float(row["invested_value"] or 0)
    current = float(row["current_value"] or 0)
    er = row["expense_ratio"] if "expense_ratio" in row.keys() else None
    return {
        "tradingsymbol": row["tradingsymbol"],
        "fund": normalize_fund_display_name(row["fund"]),
        "folio": row["folio"],
        "quantity": row["quantity"],
        "average_price": row["average_price"],
        "last_price": row["last_price"],
        "pledged_quantity": row["pledged_quantity"],
        "pnl": _mark_to_market_pnl(invested, current),
        "profit_pct": _profit_pct(invested, current),
        "invested_value": invested,
        "current_value": current,
        "expense_ratio": float(er) if er is not None else None,
    }


def _totals_from_positions(positions: list[dict[str, Any]]) -> dict[str, float]:
    inv = sum(p["invested_value"] or 0 for p in positions)
    cur = sum(p["current_value"] or 0 for p in positions)
    pnl = sum(p["pnl"] or 0 for p in positions)
    return {"total_invested": inv, "total_current": cur, "total_pnl": pnl}


def insert_snapshot(
    conn: sqlite3.Connection,
    kite_rows: list[dict[str, Any]],
    expense_by_isin: dict[str, float | None] | None = None,
) -> int:
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        "INSERT INTO snapshots (created_at, source) VALUES (?, ?)",
        (now, "kite"),
    )
    snapshot_id = int(cur.lastrowid)
    expense_by_isin = expense_by_isin or {}

    for row in kite_rows:
        qty = float(row.get("quantity") or 0)
        avg = float(row.get("average_price") or 0)
        last = float(row.get("last_price") or 0)
        invested = qty * avg
        current = qty * last
        pnl_stored = _mark_to_market_pnl(invested, current)
        isin = (row.get("tradingsymbol") or "").strip().upper()
        expense_ratio = expense_by_isin.get(isin)
        conn.execute(
            """
            INSERT INTO mf_positions (
                snapshot_id, tradingsymbol, fund, folio, quantity,
                average_price, last_price, pledged_quantity, pnl,
                invested_value, current_value, expense_ratio, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_id,
                row.get("tradingsymbol") or "",
                normalize_fund_display_name(row.get("fund")),
                row.get("folio"),
                qty,
                avg,
                last,
                float(row["pledged_quantity"])
                if row.get("pledged_quantity") is not None
                else None,
                pnl_stored,
                invested,
                current,
                expense_ratio,
                json.dumps(row, default=str),
            ),
        )

    return snapshot_id


def get_snapshot_detail(conn: sqlite3.Connection, snapshot_id: int) -> dict[str, Any] | None:
    snap = conn.execute(
        "SELECT id, created_at, source FROM snapshots WHERE id = ?",
        (snapshot_id,),
    ).fetchone()
    if not snap:
        return None

    pos_rows = conn.execute(
        "SELECT * FROM mf_positions WHERE snapshot_id = ? ORDER BY fund",
        (snapshot_id,),
    ).fetchall()
    positions = [_row_to_position(r) for r in pos_rows]
    totals = _totals_from_positions(positions)
    return {
        "id": snap["id"],
        "created_at": snap["created_at"],
        "source": snap["source"],
        "positions": positions,
        **totals,
    }


def get_latest_snapshot(conn: sqlite3.Connection) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT id FROM snapshots ORDER BY created_at DESC, id DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    return get_snapshot_detail(conn, int(row["id"]))


def list_snapshots(conn: sqlite3.Connection, limit: int = 50) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT s.id, s.created_at, s.source,
               COALESCE(SUM(p.invested_value), 0) AS total_invested,
               COALESCE(SUM(p.current_value), 0) AS total_current,
               COALESCE(SUM(p.current_value - p.invested_value), 0) AS total_pnl
        FROM snapshots s
        LEFT JOIN mf_positions p ON p.snapshot_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()

    return [
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "source": r["source"],
            "total_invested": r["total_invested"],
            "total_current": r["total_current"],
            "total_pnl": r["total_pnl"],
        }
        for r in rows
    ]

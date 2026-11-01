"""SQL query catalogue loader and runner.

The catalogue lives in db/queries/Qnn_slug.sql. Each file starts with header comments:

    -- title:    short name
    -- concepts: DBMS features demonstrated
    -- purpose:  what it is for in ZoneFood
    -- mode:     select | dml        (dml statements are ALWAYS executed inside a transaction that is rolled back)
    -- reading:  how to read the result

followed by exactly one SQL statement.

    python scripts/catalogue.py                 run all queries against the working database and print a summary
    python scripts/catalogue.py Q03 Q15         run selected queries and print their rows
    python scripts/catalogue.py --db NAME       use another database (e.g. a test database)
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db_config import ROOT, pg_dsn  # noqa: E402

QUERY_DIR = ROOT / "db" / "queries"
HEADER = re.compile(r"^--\s*(title|concepts|purpose|mode|reading):\s*(.*)$")


@dataclass
class Query:
    qid: str
    slug: str
    title: str
    concepts: str
    purpose: str
    mode: str
    reading: str
    sql: str
    path: Path


@dataclass
class Result:
    query: Query
    columns: list[str] = field(default_factory=list)
    rows: list[tuple] = field(default_factory=list)
    rowcount: int = 0
    millis: float = 0.0
    error: str | None = None


def load_queries() -> list[Query]:
    out: list[Query] = []
    for path in sorted(QUERY_DIR.glob("Q[0-9][0-9]_*.sql")):
        meta: dict[str, str] = {}
        body: list[str] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            m = HEADER.match(line)
            if m and not body:
                meta[m.group(1)] = m.group(2).strip()
            elif line.strip() or body:
                body.append(line)
        missing = {"title", "concepts", "purpose", "mode"} - meta.keys()
        if missing:
            raise ValueError(f"{path.name}: missing header(s) {sorted(missing)}")
        if meta["mode"] not in ("select", "dml"):
            raise ValueError(f"{path.name}: mode must be select or dml")
        out.append(Query(path.stem[:3], path.stem[4:], meta["title"], meta["concepts"], meta["purpose"], meta["mode"],
                         meta.get("reading", ""), "\n".join(body).strip(), path))
    return out


def run_query(conn: psycopg.Connection, q: Query, limit: int = 100) -> Result:
    """Execute one query. SELECTs run in a READ ONLY transaction; DML runs and is rolled back."""
    res = Result(q)
    started = time.perf_counter()
    try:
        with conn.transaction(force_rollback=True):
            if q.mode == "select":
                conn.execute("SET TRANSACTION READ ONLY")
            conn.execute("SET LOCAL statement_timeout = '30s'")
            cur = conn.execute(q.sql)
            res.columns = [d.name for d in cur.description] if cur.description else []
            rows = cur.fetchall() if cur.description else []
            res.rowcount = len(rows)
            res.rows = rows[:limit]
    except Exception as e:  # noqa: BLE001 - reported to the caller
        res.error = f"{type(e).__name__}: {e}"
    res.millis = (time.perf_counter() - started) * 1000
    return res


def run_all(dbname: str | None = None, only: list[str] | None = None) -> list[Result]:
    queries = [q for q in load_queries() if not only or q.qid in only]
    with psycopg.connect(pg_dsn(dbname)) as conn:
        return [run_query(conn, q) for q in queries]


def fmt(v: object) -> str:
    return "NULL" if v is None else str(v)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="query ids such as Q03 (default: all)")
    ap.add_argument("--db", help="database name (default: POSTGRES_DB)")
    args = ap.parse_args()
    results = run_all(args.db, args.ids or None)
    bad = 0
    for r in results:
        status = "ERROR" if r.error else ("ok" if r.rowcount else "EMPTY")
        bad += status != "ok"
        print(f"{r.query.qid} {status:<5} {r.rowcount:>4} rows {r.millis:>8.1f} ms  [{r.query.mode}] {r.query.title}")
        if r.error:
            print("     ", r.error.splitlines()[0])
        elif args.ids:
            print("      " + " | ".join(r.columns))
            for row in r.rows[:15]:
                print("      " + " | ".join(fmt(c) for c in row))
    print(f"\n{len(results) - bad}/{len(results)} queries executed and returned rows")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

"""The safe demonstration SQL files in db/demos/ must actually run on the real schema and change nothing."""
from __future__ import annotations

import psycopg
import pytest

from db_config import ROOT, pg_dsn

DEMOS = ROOT / "db" / "demos"


def run_file(dbname: str, name: str) -> tuple[list[str], list[list[tuple]]]:
    """Execute a demo script statement by statement in one session; return NOTICE texts and every result set."""
    notices: list[str] = []
    results: list[list[tuple]] = []
    with psycopg.connect(pg_dsn(dbname), autocommit=True) as conn:
        conn.add_notice_handler(lambda d: notices.append(d.message_primary or ""))
        cur = conn.execute((DEMOS / name).read_text(encoding="utf-8"))
        while True:
            if cur.description:
                results.append(cur.fetchall())
            if not cur.nextset():
                break
    return notices, results


def fingerprint(dbname: str):
    with psycopg.connect(pg_dsn(dbname)) as c:
        return c.execute("""SELECT (SELECT sum(remaining_qty) FROM inventory_lot), (SELECT count(*) FROM waste_event),
                                   (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
                                   (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public')""").fetchone()


def test_ddl_lifecycle_demo_runs_refuses_the_bad_row_and_leaves_no_trace(seeded_db):
    before = fingerprint(seeded_db)
    notices, results = run_file(seeded_db, "01_ddl_lifecycle.sql")
    assert any("refused as expected" in n for n in notices)
    cols = {r[0] for r in results[0]}
    assert cols == {"audit_id", "establishment_id", "note", "reading_c", "inspected_on"}       # shape after the ALTERs
    assert results[-1] == [(True,)]                                                              # table dropped within the script
    assert fingerprint(seeded_db) == before


def test_transaction_demo_shows_deduction_savepoint_and_full_rollback(seeded_db):
    before = fingerprint(seeded_db)
    notices, results = run_file(seeded_db, "02_transactions_and_rollback.sql")
    assert any("overdraw refused" in n for n in notices)
    start, after, after_refused, final = (r[0] for r in [results[0], results[1], results[2], results[3]])
    assert start[2] - after[2] == 3                                       # 3 kg deducted once
    assert after_refused[1] == after[2]                                   # the refused step changed nothing
    assert final[1] == start[2]                                           # ROLLBACK restored the original stock
    assert fingerprint(seeded_db) == before


@pytest.mark.parametrize("name", sorted(p.name for p in DEMOS.glob("*.sql")))
def test_every_demo_script_is_present_and_documented(name):
    text = (DEMOS / name).read_text(encoding="utf-8")
    assert text.lstrip().startswith("-- DEMONSTRATION") and "ROLLBACK" in text.upper()

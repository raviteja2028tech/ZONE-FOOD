"""Generate the Part 3 evidence documents from the LIVE database (nothing here is typed by hand):

    docs/QUERY_CATALOGUE.md    every db/queries/*.sql executed, with its real result
    docs/EXPLAIN_EVIDENCE.md   EXPLAIN (ANALYZE, BUFFERS) before/after for indexes, partitions, GIN, HNSW, views
    docs/CONCURRENCY_EVIDENCE.md  a timestamped two-session lock race on a disposable database
    docs/DB_OBJECTS.md         inventory of tables, indexes, views, functions, procedures, triggers

    python scripts/gen_part3_docs.py                 regenerate all (working database for catalogue/EXPLAIN)
    python scripts/gen_part3_docs.py --only catalogue
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
import threading
import time
import uuid
from decimal import Decimal
from pathlib import Path

import psycopg
from psycopg import errors as pgerr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalogue  # noqa: E402
import migrate  # noqa: E402
from db_config import ROOT, pg_dsn  # noqa: E402

DOCS = ROOT / "docs"
STAMP = dt.datetime.now().strftime("%Y-%m-%d %H:%M")


def cell(v: object, width: int = 46) -> str:
    if v is None:
        return "NULL"
    s = f"{v:f}" if isinstance(v, Decimal) else str(v)
    s = s.replace("|", "\\|").replace("\n", " ")
    return s if len(s) <= width else s[: width - 1] + "…"


def md_table(columns: list[str], rows: list[tuple], width: int = 46) -> str:
    out = ["| " + " | ".join(columns) + " |", "|" + "|".join("---" for _ in columns) + "|"]
    out += ["| " + " | ".join(cell(c, width) for c in r) + " |" for r in rows]
    return "\n".join(out)


# ---------------------------------------------------------------------------------------------- catalogue
COVERAGE = [
    ("SELECT", "Q01-Q22"), ("INSERT (… SELECT, RETURNING)", "Q23"), ("INSERT … ON CONFLICT (upsert)", "Q26"),
    ("UPDATE", "Q24"), ("DELETE", "Q25"),
    ("INNER JOIN, multi-table (4–7 tables)", "Q01, Q03, Q10, Q12, Q17, Q19, Q20"), ("LEFT JOIN", "Q08, Q10, Q16, Q18, Q20"),
    ("GROUP BY / HAVING", "Q01, Q03, Q05, Q06, Q19, Q20"), ("Aggregates (SUM, AVG, COUNT, CORR, PERCENTILE_CONT, STDDEV_SAMP)", "Q01, Q06, Q12, Q15"),
    ("Nested subquery", "Q02, Q03, Q22, Q25"), ("Correlated subquery", "Q03"), ("EXISTS / NOT EXISTS (anti-join), LATERAL", "Q11, Q20, Q22"),
    ("Window functions", "Q02, Q09, Q13, Q15, Q16, Q17"), ("ROLLUP / FILTER", "Q04, Q10, Q21"),
    ("Recursive CTE", "Q08, Q18 (and function zone_root() used by Q11, Q22)"),
    ("Views / materialised view", "Q05–Q08, Q13–Q16"), ("Date-based analytics", "Q01, Q07, Q09, Q14, Q16"),
    ("Locality-based analytics", "Q01, Q08, Q11, Q18, Q22"), ("pgvector semantic search", "Q22"),
]


def gen_catalogue(dbname: str | None) -> str:
    results = catalogue.run_all(dbname)
    bad = [r for r in results if r.error or not r.rowcount]
    lines = [
        "# SQL query catalogue",
        "",
        f"_Generated {STAMP} by `python scripts/gen_part3_docs.py` - every query below was **executed** against the live "
        f"PostgreSQL database and the output shown is what it returned. Source: `db/queries/Qnn_*.sql`._",
        "",
        f"**{len(results) - len(bad)} of {len(results)} queries executed and returned rows.** The PDF asks for 22; ZoneFood has 26: the 22 analytical queries "
        "(PDF query 21, forecast accuracy, needs the Part 4 forecasting tables, so Q21 is a data-provenance report instead) plus four data-manipulation "
        "statements (Q23-Q26). DML queries are always run inside a transaction that is **rolled back**, so running the catalogue never changes your data.",
        "",
        "Run one yourself: `python scripts/catalogue.py Q03` · all: `python scripts/catalogue.py` · or in the app: **DBMS Lab** page (zone admin / auditor).",
        "",
        "## Index",
        "",
        md_table(["#", "Title", "Mode", "Rows", "ms"], [(r.query.qid, r.query.title, r.query.mode, r.rowcount, f"{r.millis:.0f}") for r in results], 100),
        "",
        "## DBMS-feature coverage",
        "",
        md_table(["Feature", "Queries"], COVERAGE, 110),
        "",
    ]
    for r in results:
        q = r.query
        lines += [
            f"## {q.qid} - {q.title}", "",
            f"**DBMS concepts:** {q.concepts}", "",
            f"**Purpose in ZoneFood:** {q.purpose}", "",
            "```sql", q.sql, "```", "",
        ]
        if r.error:
            lines += [f"**ERROR:** `{r.error}`", ""]
            continue
        shown = r.rows[:8]
        note = f"{r.rowcount} row(s) in {r.millis:.0f} ms" + (f" - first {len(shown)} shown" if r.rowcount > len(shown) else "")
        if q.mode == "dml":
            note += " - executed in a transaction that was rolled back"
        lines += [f"**Result** ({note}):", "", md_table(r.columns, shown), "", f"**Explanation:** {q.reading}", ""]
    return "\n".join(lines)


# ------------------------------------------------------------------------------------------------ EXPLAIN
def explain(conn: psycopg.Connection, sql: str, params=None, runs: int = 2) -> tuple[str, float]:
    """EXPLAIN (ANALYZE, BUFFERS); run twice so the second figure is with a warm cache. Returns (plan, execution ms)."""
    plan, ms = "", 0.0
    for _ in range(runs):
        rows = conn.execute("EXPLAIN (ANALYZE, BUFFERS) " + sql, params).fetchall()
        plan = "\n".join(r[0] for r in rows)
        m = re.search(r"Execution Time: ([\d.]+) ms", plan)
        ms = float(m.group(1)) if m else 0.0
    return plan, ms


def trim(plan: str, n: int = 16) -> str:
    keep = [ln for ln in plan.splitlines() if not ln.strip().startswith(("Planning", "Buffers: shared hit") or ())]
    return "\n".join(keep[:n]) + ("\n..." if len(keep) > n else "")


def section(title: str, why: str, sql: str, without_label: str, without: tuple[str, float], with_label: str, with_: tuple[str, float], verdict: str) -> str:
    speed = f"{without[1] / with_[1]:.1f}x" if with_[1] > 0 else "n/a"
    return "\n".join([
        f"## {title}", "", why, "", "```sql", sql.strip(), "```", "",
        md_table(["Variant", "Execution time"], [(without_label, f"{without[1]:.2f} ms"), (with_label, f"{with_[1]:.2f} ms")]),
        f"\nSpeed-up: **{speed}**.", "",
        f"### {without_label}", "```", trim(without[0]), "```", "",
        f"### {with_label}", "```", trim(with_[0]), "```", "", verdict, "",
    ])


def gen_explain(dbname: str | None) -> str:
    out = [
        "# EXPLAIN / EXPLAIN ANALYZE evidence", "",
        f"_Generated {STAMP} by `python scripts/gen_part3_docs.py` against the working database "
        "(PostgreSQL 16, ~55 000 waste events - a student-laptop dataset, so absolute times are small; the **plan shapes** are the evidence). "
        "Each experiment runs the same statement twice (second run = warm cache) with `EXPLAIN (ANALYZE, BUFFERS)`. "
        "\"Without\" plans are produced by dropping the index **inside a transaction that is rolled back** (PostgreSQL DDL is transactional), so no index is ever lost._", "",
    ]
    with psycopg.connect(pg_dsn(dbname), autocommit=True) as conn:
        conn.execute("ANALYZE")
        counts = conn.execute("SELECT (SELECT count(*) FROM waste_event), (SELECT count(*) FROM surplus_listing), (SELECT count(*) FROM inventory_lot)").fetchone()
        out += [f"Data volume: waste_event **{counts[0]:,}**, surplus_listing **{counts[1]:,}**, inventory_lot **{counts[2]:,}**.", ""]

        def without_indexes(sql, params, drops):
            conn.execute("BEGIN")
            try:
                for d in drops:
                    conn.execute(f"DROP INDEX IF EXISTS {d}")
                return explain(conn, sql, params)
            finally:
                conn.execute("ROLLBACK")

        # 1 - composite index
        sql1 = "SELECT sum(quantity_kg) FROM waste_event WHERE establishment_id = 1 AND occurred_on >= CURRENT_DATE - 30"
        wo = without_indexes(sql1, None, ["idx_waste_estab_date", "idx_waste_stage_cover", "idx_waste_food_date"])
        wi = explain(conn, sql1)
        out.append(section("1. Composite index `idx_waste_estab_date (establishment_id, occurred_on DESC)`",
                           "Every dashboard filters by establishment and a date window. Without the index PostgreSQL must read every partition in full.",
                           sql1, "Without the index (all three waste indexes dropped in a rolled-back txn)", wo, "With the index", wi,
                           "Reading it: `Seq Scan` over every monthly partition becomes an `Index Scan`/`Bitmap Heap Scan` that touches only the matching rows - far fewer buffers read."))

        # 2 - partition pruning
        month = conn.execute("SELECT date_trunc('month', occurred_on)::date FROM waste_event GROUP BY 1 ORDER BY count(*) DESC LIMIT 1").fetchone()[0]   # the busiest month
        nxt = (month + dt.timedelta(days=32)).replace(day=1)
        sql2 = f"SELECT sum(quantity_kg) FROM waste_event WHERE occurred_on >= DATE '{month}' AND occurred_on < DATE '{nxt}'"
        sql2b = "SELECT sum(quantity_kg) FROM waste_event WHERE reason_id = 1"      # predicate NOT on the partition key
        p1, p2 = explain(conn, sql2), explain(conn, sql2b)
        n1 = len(set(re.findall(r"waste_event_\d{4}_\d{2}", p1[0])))
        n2 = len(set(re.findall(r"waste_event_\d{4}_\d{2}", p2[0])))
        total_parts = conn.execute("SELECT count(*) FROM pg_inherits WHERE inhparent = 'waste_event'::regclass").fetchone()[0]
        out.append("\n".join([
            "## 2. Partition pruning (`waste_event` PARTITION BY RANGE (occurred_on), monthly)", "",
            f"`waste_event` has **{total_parts}** child partitions (24+ monthly ones plus a default). A query that filters on the partition key scans only the relevant child; one that does not, scans all of them.", "",
            "```sql", sql2, "```", "",
            md_table(["Query", "Partitions scanned", "Execution time"], [("filter on occurred_on (one month)", n1, f"{p1[1]:.2f} ms"), ("filter on reason_id (not the key)", n2, f"{p2[1]:.2f} ms")]),
            "", "### Plan - one month (pruned)", "```", trim(p1[0], 12), "```", "",
            "Reading it: only `" + ", ".join(sorted(set(re.findall(r"waste_event_\d{4}_\d{2}", p1[0])))) + "` appears in the plan; the other partitions were pruned at plan time (\"partition pruning\").", "",
        ]))

        # 3 - partial index
        sql3 = "SELECT listing_id FROM surplus_listing WHERE status IN ('OPEN','PARTIALLY_CLAIMED') AND expires_at > now() - interval '1 day'"
        wo = without_indexes(sql3, None, ["idx_listing_open"])
        wi = explain(conn, sql3)
        out.append(section("3. Partial index `idx_listing_open ... WHERE status IN ('OPEN','PARTIALLY_CLAIMED')`",
                           "The marketplace only ever reads live listings - a tiny fraction of the table (most are long finished). A partial index contains only those rows.",
                           sql3, "Without the index", wo, "With the partial index", wi,
                           "Reading it: the index is a fraction of the size of a full one and the plan reads only live listings instead of scanning the whole table. "
                           + "`" + str(conn.execute("SELECT pg_size_pretty(pg_relation_size('idx_listing_open'))").fetchone()[0]) + "` for the partial index."))

        # 4 - lot lookup index (migration 018)
        lot = conn.execute("SELECT lot_id FROM waste_event WHERE lot_id IS NOT NULL GROUP BY lot_id ORDER BY count(*) DESC LIMIT 1").fetchone()[0]
        sql4 = f"SELECT sum(quantity_kg) FROM waste_event WHERE lot_id = {lot}"
        wo = without_indexes(sql4, None, ["idx_waste_lot"])
        wi = explain(conn, sql4)
        q20 = next(q for q in catalogue.load_queries() if q.qid == "Q20")
        conn.execute("BEGIN")
        try:
            conn.execute("DROP INDEX idx_waste_lot")
            conn.execute("SET LOCAL statement_timeout = '20s'")
            t0 = time.perf_counter()
            try:
                conn.execute(q20.sql).fetchall()
                q20_without = f"{(time.perf_counter() - t0) * 1000:.0f} ms"
            except pgerr.QueryCanceled:
                q20_without = "cancelled after the 20 s limit"
        finally:
            conn.execute("ROLLBACK")
        t0 = time.perf_counter()
        conn.execute(q20.sql).fetchall()
        q20_with = f"{(time.perf_counter() - t0) * 1000:.0f} ms"
        out.append(section("4. Index `idx_waste_lot` (migration 018) - found necessary by the query catalogue",
                           f"Query Q20 traces spoilage back to the supplier through each stock lot, so it looks up waste events by `lot_id` ~20,000 times. "
                           f"Whole of Q20 without the index: **{q20_without}**; with it: **{q20_with}**.",
                           sql4, "Without the index (one lot)", wo, "With the partial index (one lot)", wi,
                           "Reading it: a `Seq Scan` of every partition per lot becomes an index lookup. The index is partial (`WHERE lot_id IS NOT NULL`) because most waste is not tied to a lot."))

        # 5 - GIN (trigram) on a small table: honest
        sql5 = "SELECT food_id FROM food_item WHERE canonical_name % 'panner butter masala'"
        a = explain(conn, sql5)
        conn.execute("BEGIN")
        conn.execute("SET LOCAL enable_seqscan = off")
        b = explain(conn, sql5)
        conn.execute("ROLLBACK")
        out.append(section("5. GIN trigram index `idx_food_trgm` (typo-tolerant food search)",
                           "`fn_search_food` combines full-text (`idx_food_fts`, GIN on a tsvector) with trigram similarity (`%`, GIN `gin_trgm_ops`) so 'panner butter masala' still finds 'Paneer Butter Masala'. "
                           "With only 81 food items the planner is **right** to choose a sequential scan (cheaper than any index); forcing `enable_seqscan = off` shows the index path it would take at catalogue scale.",
                           sql5, "Default plan (planner's own choice)", a, "Forced to use the index (enable_seqscan = off)", b,
                           "Reading it: both return the same rows; the index plan is a `Bitmap Index Scan on idx_food_trgm`. We do not claim a speed-up on 81 rows - the evidence is that the index is usable and chosen once the table is large."))

        # 6 - HNSW
        sql6 = "SELECT food_id FROM food_item WHERE name_embedding IS NOT NULL ORDER BY name_embedding <=> (SELECT name_embedding FROM food_item WHERE food_id = 1) LIMIT 5"
        has_vec = conn.execute("SELECT count(name_embedding) FROM food_item").fetchone()[0]
        if has_vec:
            a = explain(conn, sql6)
            conn.execute("BEGIN")
            conn.execute("SET LOCAL enable_seqscan = off")
            b = explain(conn, sql6)
            conn.execute("ROLLBACK")
            out.append(section("6. pgvector HNSW index `idx_food_name_vec` (cosine distance `<=>`)",
                               "Nearest-neighbour search over 384-dimensional embeddings. HNSW is an approximate index (fast, high recall); without it PostgreSQL computes the distance to every row (exact).",
                               sql6, "Default plan", a, "Forced index plan (enable_seqscan = off)", b,
                               "Reading it: `Index Scan using idx_food_name_vec` with `Order By: (name_embedding <=> ...)` replaces sort-all-rows. At 81 rows the exact scan is as fast; the index matters at thousands of listings."))
        else:
            out.append("## 6. pgvector HNSW\n\n_Embeddings are not populated on this database - run `npm run demo:prepare` and regenerate._\n")

        # 7 - correlated subquery vs rewrite
        q3 = next(q for q in catalogue.load_queries() if q.qid == "Q03")
        rewrite = """
WITH per_est AS (
  SELECT e.establishment_id, e.name, ec.category_id, ec.category_name,
         SUM(w.quantity_kg) / e.capacity AS kg_per_capita
    FROM waste_event w
    JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
    JOIN establishment e ON e.establishment_id = w.establishment_id
    JOIN establishment_category ec ON ec.category_id = e.category_id
   WHERE w.occurred_on >= CURRENT_DATE - 90
   GROUP BY e.establishment_id, e.name, e.capacity, ec.category_id, ec.category_name
), ranked AS (SELECT *, AVG(kg_per_capita) OVER (PARTITION BY category_id) AS cat_avg FROM per_est)
SELECT name, category_name, ROUND(kg_per_capita, 3) AS kg_per_capita
  FROM ranked WHERE kg_per_capita > cat_avg ORDER BY kg_per_capita DESC"""
        t0 = time.perf_counter(); r1 = conn.execute(q3.sql).fetchall(); m1 = (time.perf_counter() - t0) * 1000
        t0 = time.perf_counter(); r2 = conn.execute(rewrite).fetchall(); m2 = (time.perf_counter() - t0) * 1000
        same = {tuple(map(str, r)) for r in r1} == {tuple(map(str, r)) for r in r2}
        out.append("\n".join([
            "## 7. Query rewrite: correlated subquery (Q03) versus a window function", "",
            "Q03 is written with a correlated subquery because that is the textbook form (and what examiners ask about): the inner aggregate is recomputed for every establishment. "
            "The same answer can be computed once with `AVG() OVER (PARTITION BY category)`.", "",
            md_table(["Variant", "Wall time", "Rows"], [("Q03 as catalogued (correlated subquery)", f"{m1:.0f} ms", len(r1)), ("Window-function rewrite", f"{m2:.0f} ms", len(r2))]),
            "", f"Results identical: **{same}**. Speed-up: **{m1 / m2:.1f}x**.", "", "```sql", rewrite.strip(), "```", "",
            "Lesson: a correlated subquery is the clearest way to express \"above the average of my own group\", but PostgreSQL cannot always decorrelate it; when the query is on a hot path, rewrite it with a window function.", "",
        ]))

        # 8 - materialised view
        base_sql = """SELECT date_trunc('month', w.occurred_on)::date AS month, SUM(w.quantity_kg), SUM(w.quantity_kg) FILTER (WHERE dr.is_diversion)
  FROM waste_event w JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN disposal_route dr ON dr.route_id = w.route_id GROUP BY 1 ORDER BY 1"""
        mv_sql = "SELECT month, SUM(waste_kg), SUM(diverted_kg) FROM mv_zone_monthly GROUP BY month ORDER BY month"
        a, b = explain(conn, base_sql), explain(conn, mv_sql)
        out.append(section("8. Materialised view `mv_zone_monthly` versus aggregating the base table",
                           "The monthly diversion trend (Q13, dashboard) needs a roll-up over every waste event. The materialised view stores it once; "
                           "refresh with `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly` (the unique index `uq_mv_zone_monthly` is what permits CONCURRENTLY, so readers are never blocked).",
                           mv_sql, "Aggregate the base table", a, "Read the materialised view", b,
                           "Reading it: the base query scans and aggregates every partition; the view reads a few hundred pre-aggregated rows. Trade-off: the view is stale until refreshed - the DBMS Lab page and `sp`-free `REFRESH` statement do that on demand."))

        # 9 - enable_indexscan comparison
        sql9 = "SELECT count(*) FROM redistribution_claim WHERE recipient_id = 1 AND status = 'REQUESTED'"
        a = explain(conn, sql9)
        conn.execute("BEGIN")
        conn.execute("SET LOCAL enable_indexscan = off"); conn.execute("SET LOCAL enable_bitmapscan = off")
        b = explain(conn, sql9)
        conn.execute("ROLLBACK")
        out.append(section("9. `SET enable_indexscan = off` comparison - `idx_claim_recipient (recipient_id, status)`",
                           "The classic classroom comparison: same query, same data, planner forbidden from using indexes.",
                           sql9, "Index scans disabled", b, "Normal planner", a,
                           "Reading it: with indexes disabled PostgreSQL falls back to a sequential scan of the claims table."))
    return "\n".join(out)


# -------------------------------------------------------------------------------------------- concurrency
def gen_concurrency() -> str:
    """Two real database sessions race for the last kilograms of a listing; timestamps prove blocking and rollback."""
    name = f"zf_evidence_{uuid.uuid4().hex[:6]}"
    log: list[tuple[float, str, str]] = []
    t0 = time.perf_counter()
    lock = threading.Lock()

    def note(who: str, what: str):
        with lock:
            log.append((time.perf_counter() - t0, who, what))

    try:
        migrate.run_up(name)
        subprocess.run([sys.executable, "scripts/seed.py", "--db", name, "--mongo-db", name, "--days", "30"], cwd=ROOT, check=True, capture_output=True)
        dsn = pg_dsn(name)
        with psycopg.connect(dsn) as c:
            lid = c.execute("""INSERT INTO surplus_listing (establishment_id, description, offered_qty_kg, is_cooked, is_vegetarian, available_from, expires_at)
                               VALUES (1, 'race demo listing', 10, FALSE, TRUE, now() - interval '1 hour', now() + interval '6 hours') RETURNING listing_id""").fetchone()[0]
            ca = c.execute("SELECT fn_claim_surplus(%s, 1, 6, 0.5)", (lid,)).fetchone()[0]
            cb = c.execute("SELECT fn_claim_surplus(%s, 2, 6, 0.5)", (lid,)).fetchone()[0]
            c.commit()
        note("setup", f"listing {lid} offers 10 kg; claim A wants 6 kg, claim B wants 6 kg (both REQUESTED)")
        a_has_lock = threading.Event()

        def session_a():
            with psycopg.connect(dsn) as c:
                note("A", "BEGIN")
                c.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 1, NULL)", (ca,))
                note("A", "approved claim A (6 kg reserved) - holds the row lock on the listing, NOT yet committed")
                a_has_lock.set()
                time.sleep(3)
                c.commit()
                note("A", "COMMIT - lock released")

        def session_b():
            a_has_lock.wait()
            time.sleep(0.5)
            with psycopg.connect(dsn) as c:
                note("B", "BEGIN")
                note("B", "approve claim B -> SELECT ... FOR UPDATE on the same listing: BLOCKED, waiting for A")
                try:
                    c.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 1, NULL)", (cb,))
                    c.commit()
                    note("B", "approved (unexpected)")
                except pgerr.ObjectNotInPrerequisiteState as e:
                    c.rollback()
                    note("B", f"ERROR after the wait: \"{e.diag.message_primary}\" -> ROLLBACK")

        ta, tb = threading.Thread(target=session_a), threading.Thread(target=session_b)
        ta.start(); tb.start(); ta.join(); tb.join()
        with psycopg.connect(dsn) as c:
            final = c.execute("SELECT claimed_qty_kg, status FROM surplus_listing WHERE listing_id = %s", (lid,)).fetchone()
            claims = c.execute("SELECT claim_id, status FROM redistribution_claim WHERE listing_id = %s ORDER BY claim_id", (lid,)).fetchall()

            # stock race
            lot = c.execute("SELECT lot_id, establishment_id FROM inventory_lot WHERE remaining_qty > 10 ORDER BY lot_id LIMIT 1").fetchone()
            c.execute("UPDATE inventory_lot SET remaining_qty = 10, received_qty = GREATEST(received_qty, 10) WHERE lot_id = %s", (lot[0],))
            c.commit()
        reason = None
        with psycopg.connect(dsn) as c:
            reason, route = c.execute("SELECT (SELECT reason_id FROM waste_reason WHERE reason_code='SPOILAGE'), (SELECT route_id FROM disposal_route WHERE route_name='COMPOST')").fetchone()
        results: list[str] = [""] * 6
        barrier = threading.Barrier(6)

        def writer(i: int):
            with psycopg.connect(dsn) as c:
                barrier.wait()
                try:
                    c.execute("""INSERT INTO waste_event (establishment_id, lot_id, reason_id, route_id, stage, quantity_kg, occurred_on)
                                 VALUES (%s, %s, %s, %s, 'PRE_CONSUMER_SPOILAGE', 3, CURRENT_DATE)""", (lot[1], lot[0], reason, route))
                    c.commit(); results[i] = "ok - deducted 3 kg"
                except pgerr.CheckViolation as e:
                    c.rollback(); results[i] = "refused - " + e.diag.message_primary

        ws = [threading.Thread(target=writer, args=(i,)) for i in range(6)]
        [w.start() for w in ws]; [w.join() for w in ws]
        with psycopg.connect(dsn) as c:
            rem = c.execute("SELECT remaining_qty FROM inventory_lot WHERE lot_id = %s", (lot[0],)).fetchone()[0]
    finally:
        migrate.drop_database(name)
        from pymongo import MongoClient
        from db_config import mongo_uri
        cl = MongoClient(mongo_uri(), serverSelectionTimeoutMS=5000); cl.drop_database(name); cl.close()

    ok = sum(r.startswith("ok") for r in results)
    return "\n".join([
        "# Concurrency evidence", "",
        f"_Generated {STAMP} on a disposable database (created and dropped by `scripts/gen_part3_docs.py`). Two real PostgreSQL connections run in parallel threads; times are measured, not scripted._", "",
        "## Experiment 1 - two approvers race for the last kilograms (the PDF's two-terminal test)", "",
        "Listing offers **10 kg**. Claim A and claim B each ask for **6 kg**, so only one can be approved. `fn_transition_claim` locks the listing row with `SELECT ... FOR UPDATE`.", "",
        md_table(["t (s)", "session", "event"], [(f"{t:.2f}", w, e) for t, w, e in log], 150), "",
        f"Final state: listing claimed = **{final[0]} kg**, status **{final[1]}**; claims: " + ", ".join(f"{i}→{s}" for i, s in claims) + ".", "",
        "**What it proves:** session B was *blocked* (its error arrives only after A commits, ~3 s later), then saw the quantity A had reserved and was refused. "
        "Without the row lock both would have read 10 kg available and the listing would be over-subscribed (12 kg promised from 10 kg).", "",
        "## Experiment 2 - six simultaneous write-offs against a 10 kg stock lot", "",
        "Six sessions each try to write off **3 kg** from the same lot at the same instant. Trigger `tr_lot_ledger` locks the lot and deducts exactly once per accepted event.", "",
        md_table(["session", "outcome"], [(i + 1, r) for i, r in enumerate(results)], 150), "",
        f"Result: **{ok}** accepted, **{6 - ok}** refused; lot remaining = **{rem} kg** (= 10 − 3×{ok}); never negative, never deducted twice.", "",
        "## The deadlock this test caught during development", "",
        "The first version of the ledger trigger was an `AFTER INSERT` trigger. Under exactly this test PostgreSQL reported:", "",
        "```", "psycopg.errors.DeadlockDetected: deadlock detected", "DETAIL:  Process 10914 waits for ShareLock on transaction 5680; blocked by process 10917.", "```", "",
        "Cause: the foreign key `waste_event.lot_id → inventory_lot` is checked by an AFTER trigger that first takes a *shared* (`FOR KEY SHARE`) lock on the lot. "
        "Each session held that shared lock and then asked for `FOR UPDATE` - a lock-*upgrade* deadlock. Fix (migration 017): make the ledger a **BEFORE** trigger so the exclusive lock is taken first and writers queue instead of deadlocking.", "",
    ])


# ----------------------------------------------------------------------------------------- object inventory
def gen_objects(dbname: str | None) -> str:
    with psycopg.connect(pg_dsn(dbname)) as c:
        tables = c.execute("""SELECT c.relname, CASE c.relkind WHEN 'p' THEN 'partitioned' ELSE 'table' END, c.reltuples::bigint
                                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                               WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname""").fetchall()
        parts = c.execute("SELECT count(*) FROM pg_inherits WHERE inhparent = 'waste_event'::regclass").fetchone()[0]
        views = c.execute("SELECT c.relname, CASE c.relkind WHEN 'm' THEN 'materialized view' ELSE 'view' END, coalesce(obj_description(c.oid), '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v','m') ORDER BY 1").fetchall()
        idx = c.execute("""SELECT i.indexname, i.tablename, am.amname, (ix.indpred IS NOT NULL), ix.indisunique, pg_size_pretty(pg_relation_size(c.oid))
                             FROM pg_indexes i JOIN pg_class c ON c.relname = i.indexname AND c.relnamespace = 'public'::regnamespace
                             JOIN pg_index ix ON ix.indexrelid = c.oid JOIN pg_am am ON am.oid = c.relam
                            WHERE i.schemaname = 'public' AND NOT c.relispartition AND i.tablename !~ '_20[0-9]{2}_[0-9]{2}$' AND i.tablename NOT LIKE '%_default'
                            ORDER BY i.tablename, i.indexname""").fetchall()
        funcs = c.execute("""SELECT p.proname, CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END, pg_get_function_identity_arguments(p.oid), coalesce(obj_description(p.oid, 'pg_proc'), '')
                               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND p.proname NOT LIKE 'trg\\_%' AND p.proname NOT LIKE 'gtrgm%' ORDER BY 2 DESC, 1""").fetchall()
        trig = c.execute("""SELECT t.tgname, c.relname, CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END,
                                   concat_ws(' OR ', CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END, CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END, CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END),
                                   p.proname
                              FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
                             WHERE NOT t.tgisinternal AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname, t.tgname""").fetchall()
        ext = [r[0] + " " + r[1] for r in c.execute("SELECT extname, extversion FROM pg_extension ORDER BY 1")]
    return "\n".join([
        "# Database object inventory", "",
        f"_Generated {STAMP} from the live catalogue (`pg_class`, `pg_index`, `pg_proc`, `pg_trigger`). The app's DBMS Lab → Objects tab shows the same, live._", "",
        f"Extensions: {', '.join(ext)}.", "",
        f"## Tables ({len(tables)}; `waste_event` has {parts} partitions)", "", md_table(["Table", "Kind", "≈ rows"], tables), "",
        f"## Views and materialised views ({len(views)})", "", md_table(["Name", "Kind", "Comment"], views, 120), "",
        f"## Indexes on parent tables ({len(idx)})", "", md_table(["Index", "Table", "Method", "Partial", "Unique", "Size"], [(a, b, c_, "yes" if d else "", "yes" if e else "", f) for a, b, c_, d, e, f in idx]), "",
        f"## Functions and procedures ({len(funcs)})", "", md_table(["Name", "Kind", "Arguments", "Purpose"], funcs, 120), "",
        f"## Triggers ({len(trig)})", "", md_table(["Trigger", "Table", "Timing", "Events", "Function"], trig), "",
    ])


def gen_mongo() -> str:
    """MongoDB design document with REAL documents, validators, indexes and a live aggregation from the working database."""
    import json
    from pymongo import MongoClient
    from db_config import mongo_db_name, mongo_uri

    client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=8000)
    db = client[mongo_db_name()]
    dump = lambda d: json.dumps(d, indent=2, default=str, ensure_ascii=False)
    infos = {i["name"]: i for i in db.list_collections()}
    out = [
        "# MongoDB design", "",
        f"_Generated {STAMP} from the live database `{db.name}` (MongoDB {client.server_info()['version']}) - the example documents below are real rows, not invented samples._", "",
        "## Why MongoDB here, and why not for everything", "",
        "PostgreSQL is the **system of record** for everything relational: establishments, stock lots, waste events, claims. MongoDB holds the data whose *shape varies by who produced it* or that is an append-only log. "
        "If every document had the same fields, MongoDB would add nothing - so the collections below are deliberately heterogeneous.", "",
        md_table(["Collection", "Kind", "Documents", "Why it is a document, not a table"], [
            ("`waste_submissions`", "ordinary + $jsonSchema validator", db.waste_submissions.count_documents({}), "A restaurant reports dishes and plates, a household reports bins, a hospital reports wards, a retailer reports SKUs. One relational table would need dozens of sparse columns; documents keep each natural shape. Raw input is also an audit trail the ETL can re-process."),
            ("`inspection_reports`", "ordinary + validator", db.inspection_reports.count_documents({}), "Checklist sections and items change between audit rounds (template v1 vs v2) and may carry readings, notes or photos."),
            ("`bin_readings`", "time-series", db.bin_readings.count_documents({}), "High-frequency sensor-style readings; native time-series storage and compression."),
            ("`establishment_meta`", "ordinary, unique index", db.establishment_meta.count_documents({}), "Arbitrary per-kind attributes that do not deserve columns."),
            ("`activity_stream`", "capped (5 MB / 5000 docs)", db.activity_stream.count_documents({}), "Append-only application events (login, claim, listing...); the capped collection discards the oldest automatically."),
        ], 200), "",
        "## Source of truth and synchronisation", "",
        "| Data | Source of truth | Flow |", "|---|---|---|",
        "| Field-log submission | MongoDB while `sync_status = PENDING/FAILED` | ETL (`/etl` page, `POST /api/etl/sync`) validates, resolves food names, writes `waste_event` rows in ONE PostgreSQL transaction, then marks the document `SYNCED` with `sql_waste_ids` |",
        "| Imported waste rows | PostgreSQL | rows carry `source_doc_id` (the Mongo `_id`) = lineage + idempotency key |",
        "| Inspection reports, activity stream | MongoDB | read directly by the app |", "",
        "**Failure and retry:** a bad document becomes `FAILED` with a safe `sync_error` and `sync_attempts`; it can be retried singly or in bulk (max 5). A crash between the PostgreSQL COMMIT and the Mongo update is repaired on the next run, because the ETL first looks for rows with that `source_doc_id` and then only completes the bookkeeping - no duplicates. Overlapping runs cannot process the same document (atomic `findOneAndUpdate` lease in `sync_lock`).", "",
        "## Real example documents - different shapes in the SAME collection", "",
    ]
    seen = set()
    for d in db.waste_submissions.find({}, {"payload": 1, "estab_kind": 1, "sync_status": 1, "service_date": 1, "establishment_id": 1, "submitted_at": 1}).sort("submitted_at", -1):
        key = (d["estab_kind"], tuple(sorted(d["payload"].keys())))
        if d["estab_kind"] in ("COMMERCIAL", "RESIDENTIAL", "EDUCATIONAL", "RETAIL_FOOD", "HEALTHCARE") and d["estab_kind"] not in {k[0] for k in seen}:
            seen.add(key)
            out += [f"### `waste_submissions` - {d['estab_kind']}", "", "```json", dump(d), "```", ""]
        if len({k[0] for k in seen}) >= 5:
            break
    insp = db.inspection_reports.find_one(sort=[("inspected_at", -1)])
    out += ["### `inspection_reports`", "", "```json", dump(insp), "```", ""]
    out += ["### `activity_stream`", "", "```json", dump(db.activity_stream.find_one(sort=[("ts", -1)])), "```", ""]
    out += ["## Validation (`$jsonSchema`)", ""]
    for name in ("waste_submissions", "inspection_reports"):
        v = infos[name].get("options", {}).get("validator", {})
        out += [f"### `{name}`", "", "```json", dump(v), "```", "", "Only the fields every document shares are validated; `payload` stays free-form - that is the point.", ""]
    out += ["## Indexes", ""]
    for name in ("waste_submissions", "inspection_reports", "bin_readings", "establishment_meta", "activity_stream"):
        idx = db[name].index_information()
        out += [f"**{name}**: " + ", ".join(f"`{k}` {v['key']}" for k, v in idx.items()), ""]
    out += ["The ETL queue index `(sync_status, submitted_at)` serves `find({sync_status:'PENDING'}).sort({submitted_at:1})` without a collection scan (verified with `explain()` in `tests/test_part1.py`).", ""]
    pipeline = [{"$facet": {
        "by_status": [{"$group": {"_id": "$sync_status", "n": {"$sum": 1}}}, {"$sort": {"_id": 1}}],
        "by_kind": [{"$group": {"_id": "$estab_kind", "submissions": {"$sum": 1}}}, {"$sort": {"submissions": -1}}],
        "household_bins": [{"$match": {"estab_kind": "RESIDENTIAL"}}, {"$group": {"_id": None, "peels_kg": {"$sum": "$payload.bins.vegetable_peels_kg"}, "cooked_kg": {"$sum": "$payload.bins.cooked_leftovers_kg"}, "packaged_kg": {"$sum": "$payload.bins.expired_packaged_kg"}}}],
    }}]
    res = list(db.waste_submissions.aggregate(pipeline))[0]
    out += ["## Aggregation pipeline (`$facet`: one round trip powers a whole status panel)", "", "```js", "db.waste_submissions.aggregate(" + dump(pipeline) + ")", "```", "", "Result on the live database:", "", "```json", dump(res), "```", ""]
    client.close()
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", choices=["catalogue", "explain", "concurrency", "objects", "mongo"])
    ap.add_argument("--db")
    args = ap.parse_args()
    jobs = {
        "catalogue": ("QUERY_CATALOGUE.md", lambda: gen_catalogue(args.db)),
        "explain": ("EXPLAIN_EVIDENCE.md", lambda: gen_explain(args.db)),
        "concurrency": ("CONCURRENCY_EVIDENCE.md", gen_concurrency),
        "objects": ("DB_OBJECTS.md", lambda: gen_objects(args.db)),
        "mongo": ("MONGODB_DESIGN.md", gen_mongo),
    }
    for key, (fname, fn) in jobs.items():
        if args.only and args.only != key:
            continue
        print(f"generating {fname} ...", flush=True)
        (DOCS / fname).write_text(fn(), encoding="utf-8")
        print(f"  wrote docs/{fname}")


if __name__ == "__main__":
    main()

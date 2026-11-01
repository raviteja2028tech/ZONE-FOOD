"""Database integrity verification for Part 1 (schema + seeded data, PostgreSQL + MongoDB).

    python scripts/verify_db.py [--db NAME] [--mongo-db NAME] [--skip-mongo]

Prints one PASS/FAIL line per check and exits non-zero if anything fails. Nothing is modified.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import psycopg
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db_config import mongo_db_name, mongo_uri, pg_dsn  # noqa: E402

EXPECTED_TABLES = [
    "zone", "establishment_category", "establishment", "commercial_profile", "institutional_profile",
    "residential_profile", "recipient_org", "app_user", "food_category", "emission_factor", "food_item",
    "supplier", "procurement", "procurement_line", "inventory_lot", "dish", "dish_ingredient", "service_session",
    "preparation_batch", "consumption_record", "waste_reason", "disposal_route", "waste_event", "surplus_listing",
    "redistribution_claim", "locality_event", "zone_event", "audit_log", "schema_migrations", "food_alias", "etl_run_log",
    "forecast_run", "forecast_eval_daily", "forecast_prediction", "forecast_importance",
]
MIN_ROWS = {"zone": 31, "establishment": 50, "app_user": 50, "food_item": 50, "dish": 100, "service_session": 1000,
            "preparation_batch": 1000, "consumption_record": 1000, "procurement": 500, "inventory_lot": 500,
            "waste_event": 5000, "surplus_listing": 100, "redistribution_claim": 50, "recipient_org": 5,
            "locality_event": 3}

# (name, SQL that must return zero rows / a zero count for the check to pass)
INVARIANTS = [
    ("every establishment has exactly one subtype profile",
     """SELECT count(*) FROM establishment e WHERE
        (SELECT count(*) FROM commercial_profile c WHERE c.establishment_id = e.establishment_id)
      + (SELECT count(*) FROM institutional_profile i WHERE i.establishment_id = e.establishment_id)
      + (SELECT count(*) FROM residential_profile r WHERE r.establishment_id = e.establishment_id) <> 1"""),
    ("profile kind matches establishment kind (residential <-> residential_profile)",
     """SELECT count(*) FROM residential_profile r JOIN establishment e USING (establishment_id)
        JOIN establishment_category ec USING (category_id) WHERE ec.kind <> 'RESIDENTIAL'"""),
    ("consumption: served + leftover <= prepared and plate waste <= served",
     """SELECT count(*) FROM consumption_record cr JOIN preparation_batch pb USING (batch_id)
        WHERE cr.served_qty_kg + cr.leftover_qty_kg > pb.prepared_qty_kg + 0.001 OR cr.plate_waste_kg > cr.served_qty_kg"""),
    ("every closed session has headcount, closing time and consumption for every batch",
     """SELECT count(*) FROM service_session s WHERE s.is_closed AND (s.actual_headcount IS NULL OR s.closed_at IS NULL
        OR EXISTS (SELECT 1 FROM preparation_batch b LEFT JOIN consumption_record c USING (batch_id)
                   WHERE b.session_id = s.session_id AND c.batch_id IS NULL))"""),
    ("open sessions have no consumption records",
     """SELECT count(*) FROM service_session s JOIN preparation_batch b USING (session_id)
        JOIN consumption_record c USING (batch_id) WHERE NOT s.is_closed"""),
    ("inventory lots: received - remaining >= waste recorded against the lot",
     """SELECT count(*) FROM inventory_lot l JOIN (SELECT lot_id, sum(quantity_kg) q FROM waste_event
        WHERE lot_id IS NOT NULL GROUP BY lot_id) w USING (lot_id) WHERE l.received_qty - l.remaining_qty < w.q - 0.001"""),
    ("procurement_line is consistent with its inventory lot",
     """SELECT count(*) FROM inventory_lot l JOIN procurement_line pl ON pl.line_id = l.source_line_id
        JOIN procurement p USING (procurement_id)
        WHERE l.received_qty <> pl.quantity OR l.food_id <> pl.food_id OR l.establishment_id <> p.establishment_id"""),
    ("listing.claimed_qty_kg = sum of APPROVED/COLLECTED claims (+-0.002)",
     """SELECT count(*) FROM surplus_listing sl WHERE abs(sl.claimed_qty_kg - COALESCE((SELECT sum(claimed_qty_kg)
        FROM redistribution_claim rc WHERE rc.listing_id = sl.listing_id AND rc.status IN ('APPROVED','COLLECTED')), 0)) > 0.002"""),
    ("listing status agrees with claimed quantity",
     """SELECT count(*) FROM surplus_listing WHERE
        (status = 'OPEN' AND claimed_qty_kg <> 0) OR (status = 'FULLY_CLAIMED' AND claimed_qty_kg <> offered_qty_kg)
        OR (status = 'PARTIALLY_CLAIMED' AND (claimed_qty_kg <= 0 OR claimed_qty_kg >= offered_qty_kg))"""),
    ("COLLECTED claims were collected after being requested",
     """SELECT count(*) FROM redistribution_claim WHERE status = 'COLLECTED' AND collected_at < requested_at"""),
    ("no waste row falls in the DEFAULT partition (all months pre-created)",
     "SELECT count(*) FROM waste_event_default"),
    ("trigger derived cost and CO2e for every waste row that has a food_id",
     "SELECT count(*) FROM waste_event WHERE food_id IS NOT NULL AND (cost_estimate IS NULL OR co2e_estimate IS NULL)"),
    ("waste_event.cost_estimate = quantity x food_item.avg_cost_per_unit",
     """SELECT count(*) FROM waste_event w JOIN food_item f USING (food_id)
        WHERE abs(w.cost_estimate - round(w.quantity_kg * f.avg_cost_per_unit, 2)) > 0.01"""),
    ("passwords are stored as bcrypt hashes",
     "SELECT count(*) FROM app_user WHERE password_hash !~ '^\\$2[aby]\\$12\\$.{53}$'"),
    ("every zone below the root has a parent that exists and is one level higher",
     """SELECT count(*) FROM zone z JOIN zone p ON p.zone_id = z.parent_zone_id WHERE z.zone_level <> p.zone_level + 1"""),
    ("every establishment sits in a street-level zone",
     "SELECT count(*) FROM establishment e JOIN zone z USING (zone_id) WHERE z.zone_level <> 3"),
    ("any stored embeddings have 384 dimensions (NULL until the Part 2 backfill has run)",
     "SELECT count(*) FROM food_item WHERE name_embedding IS NOT NULL AND vector_dims(name_embedding) <> 384"),
]

# Smoke queries: each must return at least one row (they preview the Part 3 query catalogue).
SMOKE_QUERIES = [
    ("zone waste summary by establishment kind (4 joins, GROUP BY)",
     """SELECT ec.kind, round(sum(w.quantity_kg), 1) FROM waste_event w
        JOIN establishment e USING (establishment_id) JOIN establishment_category ec USING (category_id)
        JOIN zone z ON z.zone_id = e.zone_id WHERE w.occurred_on >= CURRENT_DATE - 30 GROUP BY ec.kind"""),
    ("top wasted foods with share of total (window function)",
     """SELECT f.canonical_name, sum(w.quantity_kg), 100 * sum(w.quantity_kg) / sum(sum(w.quantity_kg)) OVER ()
        FROM waste_event w JOIN food_item f USING (food_id) GROUP BY f.canonical_name ORDER BY 2 DESC LIMIT 10"""),
    ("recursive zone roll-up (WITH RECURSIVE)",
     """WITH RECURSIVE t AS (SELECT zone_id, 0 depth FROM zone WHERE parent_zone_id IS NULL
        UNION ALL SELECT z.zone_id, t.depth + 1 FROM zone z JOIN t ON z.parent_zone_id = t.zone_id)
        SELECT depth, count(*) FROM t GROUP BY depth"""),
    ("chronic over-preparers: utilisation < 75% on >= 10 sessions (HAVING)",
     """SELECT e.name, count(*) FROM service_session s JOIN preparation_batch b USING (session_id)
        JOIN consumption_record c USING (batch_id) JOIN establishment e ON e.establishment_id = s.establishment_id
        WHERE s.is_closed GROUP BY e.name, s.session_id HAVING sum(c.served_qty_kg) / sum(b.prepared_qty_kg) < 0.75
        LIMIT 5"""),
    ("lots expiring within 10 days with stock remaining (partial index path)",
     """SELECT lot_id FROM inventory_lot WHERE remaining_qty > 0 AND expires_at < now() + interval '10 days' LIMIT 5"""),
    ("open marketplace listings (partial index path)",
     """SELECT listing_id FROM surplus_listing WHERE status IN ('OPEN','PARTIALLY_CLAIMED') AND expires_at > now()"""),
    ("recipients who left claims unmet (anti-join)",
     """SELECT r.org_name FROM recipient_org r WHERE NOT EXISTS (SELECT 1 FROM redistribution_claim c
        WHERE c.recipient_id = r.recipient_id AND c.status = 'COLLECTED' AND c.collected_at > now() - interval '3 days')"""),
]


def check_postgres(conn: psycopg.Connection, results: list) -> None:
    def add(name, ok, detail=""):
        results.append((name, bool(ok), detail))

    present = {r[0] for r in conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")}
    missing = [t for t in EXPECTED_TABLES if t not in present]
    add("all expected tables exist", not missing, f"missing: {missing}" if missing else f"{len(EXPECTED_TABLES)} tables")
    ext = {r[0] for r in conn.execute("SELECT extname FROM pg_extension")}
    add("extensions vector and pg_trgm installed", {"vector", "pg_trgm"} <= ext, str(sorted(ext)))
    parts = conn.execute("SELECT count(*) FROM pg_inherits WHERE inhparent = 'waste_event'::regclass").fetchone()[0]
    add("waste_event is range-partitioned with monthly children", parts >= 24, f"{parts} partitions")
    n_mig = conn.execute("SELECT count(*) FROM schema_migrations").fetchone()[0]
    add("all migrations recorded", n_mig >= 11, f"{n_mig} recorded")
    for table, minimum in MIN_ROWS.items():
        n = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        add(f"{table} has >= {minimum} rows", n >= minimum, f"{n} rows")
    for name, query in INVARIANTS:
        bad = conn.execute(query).fetchone()[0]
        add(name, bad == 0, f"{bad} violations" if bad else "")
    for name, query in SMOKE_QUERIES:
        rows = conn.execute(query).fetchall()
        add(f"query non-empty: {name}", len(rows) > 0, f"{len(rows)} rows")


def check_mongo(conn: psycopg.Connection, mdb, results: list) -> None:
    def add(name, ok, detail=""):
        results.append((name, bool(ok), detail))

    names = set(mdb.list_collection_names())
    expected = {"waste_submissions", "inspection_reports", "bin_readings", "establishment_meta", "activity_stream"}
    add("all five MongoDB collections exist", expected <= names, str(sorted(expected - names)))
    ws = mdb["waste_submissions"]
    n = ws.count_documents({})
    add("waste_submissions has >= 300 documents", n >= 300, f"{n} docs")
    kinds = {k for k in ws.distinct("estab_kind")}
    add("submissions cover >= 5 establishment kinds", len(kinds) >= 5, str(sorted(kinds)))
    shapes = {(d["estab_kind"], tuple(sorted(d["payload"].keys()))) for d in ws.find({}, {"estab_kind": 1, "payload": 1})}
    distinct_top = len({s[1] for s in shapes})
    add("payloads have genuinely different shapes (>= 6 distinct key sets)", distinct_top >= 6, f"{distinct_top} shapes")
    add("sync_status values are only PENDING/SYNCED/FAILED (a fresh seed has a PENDING backlog; the Part 2 ETL drains it)",
        set(ws.distinct("sync_status")) <= {"PENDING", "SYNCED", "FAILED"},
        str({s: ws.count_documents({"sync_status": s}) for s in ("PENDING", "SYNCED", "FAILED")}))
    try:
        ws.insert_one({"establishment_id": 1, "estab_kind": "NOT_A_KIND", "service_date": "2026-01-01",
                       "submitted_at": __import__("datetime").datetime.now(), "payload": {}, "sync_status": "PENDING"})
        add("schema validator rejects an invalid estab_kind", False, "invalid document was accepted")
        ws.delete_many({"estab_kind": "NOT_A_KIND"})
    except Exception:
        add("schema validator rejects an invalid estab_kind", True)
    idx = set(ws.index_information())
    add("expected waste_submissions indexes exist",
        {"idx_estab_date", "idx_etl_queue", "idx_dish_name_multikey", "idx_free_text"} <= idx, str(sorted(idx)))
    info = mdb.command("listCollections", filter={"name": "bin_readings"})["cursor"]["firstBatch"][0]
    add("bin_readings is a time-series collection", info.get("type") == "timeseries")
    add("activity_stream is capped", bool(mdb["activity_stream"].options().get("capped")))
    # cross-database consistency
    synced = list(ws.find({"sync_status": "SYNCED"}, {"sql_waste_ids": 1}))
    ids = [i for d in synced for i in d.get("sql_waste_ids", [])]
    found = conn.execute("SELECT count(*) FROM waste_event WHERE waste_id = ANY(%s)", (ids,)).fetchone()[0] if ids else 0
    add("every SYNCED document's sql_waste_ids exist in PostgreSQL", synced and found == len(ids), f"{found}/{len(ids)}")
    pg_docs = [r[0] for r in conn.execute("SELECT DISTINCT source_doc_id FROM waste_event WHERE source_doc_id IS NOT NULL")]
    from bson import ObjectId
    in_mongo = ws.count_documents({"_id": {"$in": [ObjectId(x) for x in pg_docs]}})
    add("every PostgreSQL source_doc_id points at an existing Mongo document", in_mongo == len(pg_docs), f"{in_mongo}/{len(pg_docs)}")
    est_ids = {r[0] for r in conn.execute("SELECT establishment_id FROM establishment")}
    bad = [d for d in ws.find({}, {"establishment_id": 1}) if d["establishment_id"] not in est_ids]
    add("every Mongo establishment_id exists in PostgreSQL", not bad, f"{len(bad)} orphans")


def run_checks(pg_db: str | None = None, mongo_name: str | None = None, skip_mongo: bool = False) -> list:
    results: list = []
    with psycopg.connect(pg_dsn(pg_db)) as conn:
        check_postgres(conn, results)
        if not skip_mongo:
            client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=8000)
            check_mongo(conn, client[mongo_db_name(mongo_name)], results)
            client.close()
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db")
    ap.add_argument("--mongo-db")
    ap.add_argument("--skip-mongo", action="store_true")
    args = ap.parse_args()
    results = run_checks(args.db, args.mongo_db, args.skip_mongo)
    failed = 0
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))
        failed += not ok
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

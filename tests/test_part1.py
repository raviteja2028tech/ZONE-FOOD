"""Part 1 acceptance tests: migrations, constraints, triggers, partitioning, seed, MongoDB, docs.

Run:  python -m pytest -v          (requires `docker compose up -d` and a configured .env)
"""
from __future__ import annotations

import datetime as dt
import uuid

import psycopg
import pytest
from psycopg import errors as pgerr

import gen_docs
import migrate
import verify_db
from conftest import run_script
from db_config import pg_dsn


# ----------------------------------------------------------------------------- migrations
def test_migrations_apply_from_empty_and_are_idempotent(seeded_db):
    # seeded_db already migrated an EMPTY database; a second run must be a no-op
    assert migrate.run_up(seeded_db) == 0
    with psycopg.connect(pg_dsn(seeded_db)) as c:
        applied = [r[0] for r in c.execute("SELECT filename FROM schema_migrations ORDER BY version")]
    assert applied == [p.name for p in migrate.migration_files()]


def test_reset_rebuilds_schema_without_manual_sql():
    name = f"zf_test_reset_{uuid.uuid4().hex[:6]}"
    try:
        migrate.run_up(name)
        with psycopg.connect(pg_dsn(name)) as c:
            c.execute("CREATE TABLE junk_table (x int)")
            c.commit()
        migrate.run_reset(name)
        with psycopg.connect(pg_dsn(name)) as c:
            tables = {r[0] for r in c.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
        assert "junk_table" not in tables and "waste_event" in tables
    finally:
        migrate.drop_database(name)


def test_tampering_with_applied_migration_is_rejected(seeded_db, monkeypatch):
    first = migrate.migration_files()[0]
    monkeypatch.setattr(migrate, "checksum", lambda p: "tampered" if p == first else "x")
    with pytest.raises(SystemExit) as exc:
        migrate.run_up(seeded_db)
    assert "checksum mismatch" in str(exc.value)


# ----------------------------------------------------------------------------- seed + integrity
def test_integrity_verification_passes_on_seeded_data(seeded_db):
    results = verify_db.run_checks(seeded_db, seeded_db)
    failed = [(n, d) for n, ok, d in results if not ok]
    assert not failed, failed
    assert len(results) >= 50


def test_seed_is_deterministic_for_a_fixed_end_date():
    name = f"zf_test_det_{uuid.uuid4().hex[:6]}"
    end = (dt.date.today() - dt.timedelta(days=2)).isoformat()
    fingerprints = []
    try:
        migrate.run_up(name)
        for _ in range(2):
            r = run_script("scripts/seed.py", "--db", name, "--skip-mongo", "--end-date", end, "--days", "30")
            assert r.returncode == 0, r.stdout + r.stderr
            with psycopg.connect(pg_dsn(name)) as c:
                fp = c.execute("""
                    SELECT md5(string_agg(t, '|' ORDER BY t)) FROM (
                      SELECT ROW(session_id, establishment_id, service_date, slot, expected_headcount, actual_headcount)::text t FROM service_session
                      UNION ALL SELECT ROW(batch_id, session_id, dish_id, prepared_qty_kg, prepared_portions)::text FROM preparation_batch
                      UNION ALL SELECT ROW(lot_id, establishment_id, food_id, received_qty, remaining_qty)::text FROM inventory_lot
                      UNION ALL SELECT ROW(waste_id, establishment_id, food_id, quantity_kg, occurred_on)::text FROM waste_event
                        WHERE session_id IS NOT NULL OR lot_id IS NOT NULL OR recorded_at < now() - interval '1 day'
                    ) x""").fetchone()[0]
            fingerprints.append(fp)
        assert fingerprints[0] == fingerprints[1]
    finally:
        migrate.drop_database(name)


# ----------------------------------------------------------------------------- constraints (negative tests)
def _one(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()[0]


def test_trigger_rejects_served_plus_leftover_above_prepared(conn):
    with pytest.raises(pgerr.CheckViolation, match="exceeds prepared"):
        conn.execute("UPDATE consumption_record SET served_qty_kg = served_qty_kg + 1000 "
                     "WHERE batch_id = (SELECT min(batch_id) FROM consumption_record)")


def test_trigger_rejects_plate_waste_above_served(conn):
    with pytest.raises(pgerr.CheckViolation, match="plate waste"):
        conn.execute("UPDATE consumption_record SET plate_waste_kg = served_qty_kg + 5, leftover_qty_kg = 0, served_qty_kg = served_qty_kg "
                     "WHERE batch_id = (SELECT min(batch_id) FROM consumption_record)")


WASTE_INSERT = """INSERT INTO waste_event (establishment_id, reason_id, route_id, stage, quantity_kg, occurred_on, food_id)
                  VALUES ((SELECT min(establishment_id) FROM establishment),
                          (SELECT reason_id FROM waste_reason WHERE reason_code = 'SPOILAGE'),
                          (SELECT route_id FROM disposal_route WHERE route_name = 'COMPOST'),
                          'PRE_CONSUMER_SPOILAGE', %s, %s, %s)"""


def test_waste_negative_quantity_violates_check(conn):
    with pytest.raises(pgerr.CheckViolation, match="quantity_kg"):
        conn.execute(WASTE_INSERT, (-5, dt.date.today(), None))


def test_waste_future_date_violates_check(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_waste_not_future"):
        conn.execute(WASTE_INSERT, (1, dt.date.today() + dt.timedelta(days=30), None))


def test_waste_unknown_establishment_violates_foreign_key(conn):
    with pytest.raises(pgerr.ForeignKeyViolation):
        conn.execute("""INSERT INTO waste_event (establishment_id, reason_id, route_id, stage, quantity_kg, occurred_on)
                        VALUES (999999, 1, 1, 'PRE_CONSUMER_PREP', 1, CURRENT_DATE - 1)""")


def test_listing_claimed_above_offered_violates_check(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_listing_balance"):
        conn.execute("UPDATE surplus_listing SET claimed_qty_kg = 999 WHERE listing_id = (SELECT min(listing_id) FROM surplus_listing)")


def test_manager_without_establishment_violates_user_scope(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_user_scope"):
        conn.execute("""INSERT INTO app_user (email, password_hash, full_name, role)
                        VALUES ('x@zonefood.example', 'h', 'X', 'ESTAB_MANAGER')""")


def test_admin_with_establishment_violates_user_scope(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_user_scope"):
        conn.execute("""INSERT INTO app_user (email, password_hash, full_name, role, establishment_id)
                        VALUES ('y@zonefood.example', 'h', 'Y', 'ZONE_ADMIN', (SELECT min(establishment_id) FROM establishment))""")


def test_residential_occupants_below_households_violates_check(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_occupants_ge_households"):
        conn.execute("UPDATE residential_profile SET total_occupants = household_count - 1 "
                     "WHERE establishment_id = (SELECT min(establishment_id) FROM residential_profile)")


def test_deleting_zone_with_establishments_is_restricted(conn):
    with pytest.raises(pgerr.ForeignKeyViolation):
        conn.execute("DELETE FROM zone WHERE zone_id = (SELECT zone_id FROM establishment LIMIT 1)")


def test_duplicate_service_session_violates_unique(conn):
    with pytest.raises(pgerr.UniqueViolation, match="uq_session"):
        conn.execute("""INSERT INTO service_session (establishment_id, service_date, slot, expected_headcount)
                        SELECT establishment_id, service_date, slot, 10 FROM service_session LIMIT 1""")


def test_duplicate_claim_for_same_listing_and_recipient_violates_unique(conn):
    with pytest.raises(pgerr.UniqueViolation, match="uq_claim"):
        conn.execute("""INSERT INTO redistribution_claim (listing_id, recipient_id, claimed_qty_kg)
                        SELECT listing_id, recipient_id, 1 FROM redistribution_claim LIMIT 1""")


def test_collected_claim_requires_collection_time(conn):
    # Uses an APPROVED claim: APPROVED -> COLLECTED is a LEGAL transition, so trigger tr_claim_guard (Part 3) lets it
    # through and it is the table CHECK ck_collected that refuses the missing timestamp. (From REQUESTED the Part 3
    # trigger refuses the illegal move first - see tests/test_part3.py.)
    with pytest.raises(pgerr.CheckViolation, match="ck_collected"):
        conn.execute("UPDATE redistribution_claim SET status = 'COLLECTED', collected_at = NULL "
                     "WHERE claim_id = (SELECT min(claim_id) FROM redistribution_claim WHERE status = 'APPROVED')")


def test_lot_remaining_above_received_violates_check(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_lot_balance"):
        conn.execute("UPDATE inventory_lot SET remaining_qty = received_qty + 1 WHERE lot_id = (SELECT min(lot_id) FROM inventory_lot)")


def test_zone_cannot_be_its_own_parent(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_zone_not_self"):
        conn.execute("UPDATE zone SET parent_zone_id = zone_id WHERE zone_id = 2")


def test_invalid_enum_value_is_rejected(conn):
    with pytest.raises(pgerr.InvalidTextRepresentation):
        conn.execute("""INSERT INTO service_session (establishment_id, service_date, slot, expected_headcount)
                        VALUES (1, CURRENT_DATE, 'MIDNIGHT_SNACK', 10)""")


def test_closed_session_requires_actual_headcount(conn):
    with pytest.raises(pgerr.CheckViolation, match="ck_closed_has_actuals"):
        conn.execute("""INSERT INTO service_session (establishment_id, service_date, slot, expected_headcount, is_closed)
                        VALUES (1, DATE '2020-01-01', 'LUNCH', 10, TRUE)""")


def test_phone_must_be_ten_digits(conn):
    with pytest.raises(pgerr.CheckViolation):
        conn.execute("UPDATE app_user SET phone = '12345' WHERE user_id = 1")


# ----------------------------------------------------------------------------- positive behaviour
def test_waste_trigger_derives_cost_and_co2e(conn):
    food_id, cost = conn.execute("SELECT food_id, avg_cost_per_unit FROM food_item WHERE canonical_name = 'Tomato'").fetchone()
    conn.execute(WASTE_INSERT, (10, dt.date.today() - dt.timedelta(days=1), food_id))
    cost_est, co2e = conn.execute("SELECT cost_estimate, co2e_estimate FROM waste_event WHERE quantity_kg = 10 "
                                  "AND food_id = %s ORDER BY waste_id DESC LIMIT 1", (food_id,)).fetchone()
    assert cost_est == cost * 10
    assert co2e == pytest.approx(10 * 0.5)  # Vegetables emission factor in migration 010


def test_waste_rows_route_to_monthly_partition(conn):
    d = dt.date.today() - dt.timedelta(days=1)
    conn.execute(WASTE_INSERT, (2, d, None))
    part = _one(conn, "SELECT tableoid::regclass::text FROM waste_event WHERE quantity_kg = 2 AND notes IS NULL "
                      "AND food_id IS NULL AND occurred_on = %s ORDER BY waste_id DESC LIMIT 1", (d,))
    assert part == f"waste_event_{d:%Y_%m}"


def test_single_month_query_prunes_to_one_partition(conn):
    d = dt.date.today() - dt.timedelta(days=5)
    first, nxt = d.replace(day=1), (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    plan = "\n".join(r[0] for r in conn.execute(
        "EXPLAIN SELECT sum(quantity_kg) FROM waste_event WHERE occurred_on >= %s AND occurred_on < %s", (first, nxt)))
    scanned = {w for w in plan.replace("(", " ").split() if w.startswith("waste_event_2")}
    assert len(scanned) == 1, plan


def test_hierarchy_has_sector_blocks_and_streets(conn):
    levels = dict(conn.execute("SELECT zone_level, count(*) FROM zone GROUP BY zone_level").fetchall())
    assert levels == {1: 1, 2: 6, 3: 24}


def test_vector_column_accepts_384_dim_embedding_and_similarity_query(conn):
    vec = "[" + ",".join(["0.1"] * 384) + "]"
    conn.execute("UPDATE food_item SET name_embedding = %s::vector WHERE food_id = 1", (vec,))
    row = conn.execute("SELECT food_id, 1 - (name_embedding <=> %s::vector) FROM food_item "
                       "WHERE name_embedding IS NOT NULL ORDER BY name_embedding <=> %s::vector LIMIT 1", (vec, vec)).fetchone()
    assert row[0] == 1 and row[1] == pytest.approx(1.0, abs=1e-6)
    with pytest.raises(pgerr.DataException):
        conn.execute("UPDATE food_item SET name_embedding = '[1,2,3]'::vector WHERE food_id = 1")


def test_full_text_and_trigram_search_find_food(conn):
    ft = conn.execute("SELECT canonical_name FROM food_item WHERE search_doc @@ plainto_tsquery('english', 'paneer')").fetchall()
    assert any("Paneer" in r[0] for r in ft)
    tg = conn.execute("SELECT canonical_name FROM food_item WHERE canonical_name % 'Panner Butter Masala'").fetchall()
    assert any(r[0] == "Paneer Butter Masala" for r in tg)


def test_planted_signals_exist(conn):
    # chronic over-preparer is discoverable
    name, util = conn.execute("""SELECT e.name, sum(c.served_qty_kg) / sum(b.prepared_qty_kg) u FROM consumption_record c
        JOIN preparation_batch b USING (batch_id) JOIN service_session s USING (session_id)
        JOIN establishment e ON e.establishment_id = s.establishment_id GROUP BY e.name ORDER BY u LIMIT 1""").fetchone()
    assert name == "Greenfield Academy Canteen" and util < 0.78
    # the planted supplier spoils produce more often than the other produce supplier
    rows = dict(conn.execute("""SELECT s.name, count(DISTINCT w.lot_id)::float / count(DISTINCT l.lot_id)
        FROM inventory_lot l JOIN procurement_line pl ON pl.line_id = l.source_line_id JOIN procurement p USING (procurement_id)
        JOIN supplier s USING (supplier_id) JOIN food_item f ON f.food_id = l.food_id
        JOIN food_category fc USING (food_category_id) LEFT JOIN waste_event w ON w.lot_id = l.lot_id
        WHERE fc.category_name IN ('Vegetables','Fruits') GROUP BY s.name""").fetchall())
    assert rows["Greenacre Farms (produce)"] > 1.8 * rows["City Wholesale Mandi"]


# ----------------------------------------------------------------------------- MongoDB
def test_mongo_validator_rejects_bad_documents(mongo):
    from pymongo.errors import WriteError
    good = {"establishment_id": 1, "estab_kind": "COMMERCIAL", "service_date": "2026-01-01",
            "submitted_at": dt.datetime.now(), "sync_status": "PENDING", "payload": {"anything": [1, 2]}}
    with pytest.raises(WriteError):
        mongo.waste_submissions.insert_one({**good, "sync_status": "MAYBE"})
    with pytest.raises(WriteError):
        mongo.waste_submissions.insert_one({**good, "service_date": "14/03/2026"})
    with pytest.raises(WriteError):
        mongo.waste_submissions.insert_one({k: v for k, v in good.items() if k != "payload"})


def test_mongo_stores_and_returns_documents_with_different_shapes(mongo):
    base = {"service_date": "2026-01-02", "submitted_at": dt.datetime.now(), "sync_status": "PENDING"}
    restaurant = {**base, "establishment_id": 1, "estab_kind": "COMMERCIAL", "marker": "t",
                  "payload": {"dish_waste": [{"dish_name": "Veg Biriyani", "returned_plates": 3}]}}
    household = {**base, "establishment_id": 40, "estab_kind": "RESIDENTIAL", "marker": "t",
                 "payload": {"bins": {"vegetable_peels_kg": 0.9}, "segregated": True}}
    ids = mongo.waste_submissions.insert_many([restaurant, household]).inserted_ids
    try:
        got = {d["estab_kind"]: d for d in mongo.waste_submissions.find({"_id": {"$in": ids}})}
        assert "dish_waste" in got["COMMERCIAL"]["payload"] and "dish_waste" not in got["RESIDENTIAL"]["payload"]
        assert got["RESIDENTIAL"]["payload"]["bins"]["vegetable_peels_kg"] == 0.9
    finally:
        mongo.waste_submissions.delete_many({"marker": "t"})


def test_mongo_aggregation_over_nested_arrays_returns_results(mongo):
    pipeline = [{"$match": {"estab_kind": "COMMERCIAL"}}, {"$unwind": "$payload.dish_waste"},
                {"$group": {"_id": {"$toLower": "$payload.dish_waste.dish_name"},
                            "plates": {"$sum": "$payload.dish_waste.returned_plates"}, "n": {"$sum": 1}}},
                {"$sort": {"plates": -1}}, {"$limit": 5}]
    out = list(mongo.waste_submissions.aggregate(pipeline))
    assert len(out) == 5 and out[0]["plates"] >= out[-1]["plates"]


def test_mongo_text_index_and_multikey_index_are_usable(mongo):
    hits = list(mongo.waste_submissions.find({"$text": {"$search": "rice"}}).limit(5))
    assert hits and all("rice" in d["payload"]["free_text"].lower() for d in hits)
    plan = mongo.waste_submissions.find({"payload.dish_waste.dish_name": "Veg Biryani"}).explain()
    assert "IXSCAN" in str(plan["queryPlanner"]["winningPlan"])


def test_mongo_timeseries_and_capped_collections(mongo):
    assert mongo.bin_readings.count_documents({}) == 1008
    first = mongo.bin_readings.find_one({}, sort=[("ts", 1)])
    assert {"ts", "meta", "weight_kg"} <= set(first)
    assert mongo.activity_stream.options()["capped"] is True


def test_mongo_etl_queue_index_serves_pending_query(mongo):
    plan = mongo.waste_submissions.find({"sync_status": "PENDING"}).sort("submitted_at", 1).limit(200).explain()
    assert "idx_etl_queue" in str(plan["queryPlanner"]["winningPlan"])


# ----------------------------------------------------------------------------- documentation matches schema
def test_er_diagram_and_data_dictionary_match_live_schema(seeded_db):
    for name, text in gen_docs.build(seeded_db).items():
        assert (gen_docs.DOCS / name).read_text(encoding="utf-8") == text, f"{name} is stale: run python scripts/gen_docs.py"

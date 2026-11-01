"""Part 3 acceptance tests for the database layer: views, functions, procedures, triggers, stock consistency,
transactions, partitions, DDL (ALTER/DROP) and real multi-connection concurrency.

Each test runs against the throw-away database built by conftest.py (migrated from empty, then seeded).
Tests that need several connections commit real data; that is fine because the database is disposable.
"""
from __future__ import annotations

import threading
from decimal import Decimal

import psycopg
import pytest
from psycopg import errors as pgerr

import migrate
from db_config import pg_dsn


# ----------------------------------------------------------------------------- helpers
def one(conn, sql, args=()):
    return conn.execute(sql, args or None).fetchone()[0]


def ids(conn):
    return {
        "reason": {r[0]: r[1] for r in conn.execute("SELECT reason_code, reason_id FROM waste_reason")},
        "route": {r[0]: r[1] for r in conn.execute("SELECT route_name, route_id FROM disposal_route")},
    }


def make_listing(conn, estab=1, qty=10, cooked=True, hours=6, available_hours_ago=1):
    return one(conn, """INSERT INTO surplus_listing (establishment_id, description, offered_qty_kg, is_cooked, is_vegetarian,
                         available_from, expires_at)
                        VALUES (%s, 'test listing for part 3', %s, %s, TRUE,
                                now() - make_interval(hours => %s), now() + make_interval(hours => %s))
                        RETURNING listing_id""", (estab, qty, cooked, available_hours_ago, hours))


def pick_lot(conn, min_remaining=10):
    return conn.execute("""SELECT lot_id, establishment_id, food_id, remaining_qty FROM inventory_lot
                            WHERE remaining_qty >= %s ORDER BY lot_id LIMIT 1""", (min_remaining,)).fetchone()


def insert_waste(conn, estab, lot_id, qty, food_id=None):
    i = ids(conn)
    return conn.execute("""INSERT INTO waste_event (establishment_id, food_id, lot_id, reason_id, route_id, stage, quantity_kg, occurred_on)
                           VALUES (%s, %s, %s, %s, %s, 'PRE_CONSUMER_SPOILAGE', %s, CURRENT_DATE) RETURNING waste_id""",
                        (estab, food_id, lot_id, i["reason"]["SPOILAGE"], i["route"]["COMPOST"], qty)).fetchone()[0]


def remaining(conn, lot_id):
    return one(conn, "SELECT remaining_qty FROM inventory_lot WHERE lot_id = %s", (lot_id,))


# ----------------------------------------------------------------------------- migrations / DDL
def test_part3_migrations_are_applied_in_order(seeded_db):
    with psycopg.connect(pg_dsn(seeded_db)) as c:
        names = [r[0] for r in c.execute("SELECT filename FROM schema_migrations ORDER BY version")]
    assert names[-5:] == ["014_alter_drop_ddl.sql", "015_views.sql", "016_functions_procedures.sql", "017_triggers.sql", "018_lot_lookup_index.sql"]
    assert migrate.run_up(seeded_db) == 0


def test_alter_added_provenance_column_with_check_rule(conn):
    assert one(conn, "SELECT data_type FROM information_schema.columns WHERE table_name = 'waste_event' AND column_name = 'measurement_source'") == "character varying"
    with pytest.raises(pgerr.CheckViolation):
        conn.execute("UPDATE waste_event SET measurement_source = 'GUESS' WHERE waste_id = (SELECT min(waste_id) FROM waste_event)")


def test_provenance_is_derived_by_the_trigger_not_the_application(conn):
    counts = dict(conn.execute("SELECT measurement_source, count(*) FROM waste_event GROUP BY 1").fetchall())
    assert counts.get("ETL_IMPORT", 0) > 0 and counts.get("SYSTEM", 0) > 0 and counts.get("MANUAL", 0) > 0
    # every row with Mongo lineage is ETL_IMPORT, every REDISTRIBUTED row is SYSTEM
    assert one(conn, "SELECT count(*) FROM waste_event WHERE source_doc_id IS NOT NULL AND measurement_source <> 'ETL_IMPORT'") == 0
    assert one(conn, """SELECT count(*) FROM waste_event w JOIN waste_reason r USING (reason_id)
                         WHERE r.reason_code = 'REDISTRIBUTED' AND measurement_source <> 'SYSTEM'""") == 0
    i = ids(conn)
    wid = conn.execute("""INSERT INTO waste_event (establishment_id, reason_id, route_id, stage, quantity_kg, occurred_on, measurement_source)
                          VALUES (1, %s, %s, 'PRE_CONSUMER_PREP', 1, CURRENT_DATE, 'MANUAL') RETURNING waste_id""",
                       (i["reason"]["REDISTRIBUTED"], i["route"]["DONATION"])).fetchone()[0]
    assert one(conn, "SELECT measurement_source FROM waste_event WHERE waste_id = %s", (wid,)) == "SYSTEM"  # overridden


def test_drop_index_was_applied_and_unused_index_really_had_no_data(conn):
    assert one(conn, "SELECT count(*) FROM pg_indexes WHERE indexname LIKE 'idx_wastenote_vec%'") == 0
    assert one(conn, "SELECT count(notes_embedding) FROM waste_event") == 0
    # the neighbouring, genuinely used vector indexes were left alone
    assert one(conn, "SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_food_name_vec', 'idx_listing_vec', 'idx_recipient_vec')") == 3


def test_ddl_lifecycle_create_alter_drop_is_transactional(conn):
    conn.execute("CREATE TABLE ddl_demo (id SERIAL PRIMARY KEY, label TEXT NOT NULL)")
    conn.execute("ALTER TABLE ddl_demo ADD COLUMN qty NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (qty >= 0)")
    conn.execute("ALTER TABLE ddl_demo ALTER COLUMN label TYPE VARCHAR(40)")
    conn.execute("ALTER TABLE ddl_demo RENAME COLUMN label TO title")
    conn.execute("CREATE INDEX idx_ddl_demo_title ON ddl_demo (title)")
    cols = {r[0] for r in conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'ddl_demo'")}
    assert cols == {"id", "title", "qty"}
    conn.execute("DROP INDEX idx_ddl_demo_title")
    conn.execute("ALTER TABLE ddl_demo DROP COLUMN qty")
    conn.execute("DROP TABLE ddl_demo")
    assert one(conn, "SELECT to_regclass('ddl_demo') IS NULL")


# ----------------------------------------------------------------------------- views
def test_v_daily_waste_matches_the_base_table_and_excludes_redistributed_food(conn):
    est = 1
    view = one(conn, "SELECT sum(total_waste_kg) FROM v_daily_waste WHERE establishment_id = %s", (est,))
    base = one(conn, """SELECT sum(w.quantity_kg) FROM waste_event w JOIN waste_reason r USING (reason_id)
                         WHERE w.establishment_id = %s AND r.reason_code <> 'REDISTRIBUTED'""", (est,))
    assert view == base and view > 0
    assert one(conn, "SELECT count(*) FROM v_daily_waste WHERE edible_waste_kg > total_waste_kg OR diverted_kg > total_waste_kg") == 0


def test_v_preparation_efficiency_is_sane(conn):
    rows = conn.execute("SELECT utilisation_pct, turnout_pct FROM v_preparation_efficiency").fetchall()
    assert len(rows) > 1000
    assert all(0 <= u <= 100.5 for u, _ in rows if u is not None)


def test_v_redistribution_performance_does_not_double_count(conn):
    r = conn.execute("""SELECT sum(offered_kg), sum(collected_kg) FROM v_redistribution_performance""").fetchone()
    direct = one(conn, "SELECT sum(offered_qty_kg) FROM surplus_listing WHERE status <> 'CANCELLED'")
    assert r[0] == direct                      # offered quantity is counted once per listing
    assert 0 < r[1] <= r[0]
    assert one(conn, "SELECT max(rescue_rate_pct) FROM v_redistribution_performance") <= 100


def test_materialised_view_equals_its_definition_and_refreshes_concurrently(seeded_db):
    with psycopg.connect(pg_dsn(seeded_db), autocommit=True) as c:
        mv = one(c, "SELECT round(sum(waste_kg)) FROM mv_zone_monthly")
        base = one(c, """SELECT round(sum(w.quantity_kg)) FROM waste_event w JOIN waste_reason r USING (reason_id)
                          WHERE r.reason_code <> 'REDISTRIBUTED'""")
        assert mv == base
        i = ids(c)
        c.execute("""INSERT INTO waste_event (establishment_id, reason_id, route_id, stage, quantity_kg, occurred_on)
                     VALUES (1, %s, %s, 'PRE_CONSUMER_PREP', 777, CURRENT_DATE)""", (i["reason"]["SPOILAGE"], i["route"]["LANDFILL"]))
        assert one(c, "SELECT round(sum(waste_kg)) FROM mv_zone_monthly") == mv          # stale until refreshed
        c.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly")
        assert one(c, "SELECT round(sum(waste_kg)) FROM mv_zone_monthly") == mv + 777


# ----------------------------------------------------------------------------- functions
def test_fn_waste_intensity(conn):
    v = one(conn, "SELECT fn_waste_intensity(1, CURRENT_DATE - 60, CURRENT_DATE)")
    assert v is not None and v > 0
    assert one(conn, "SELECT fn_waste_intensity(1, DATE '2000-01-01', DATE '2000-01-31')") is None


def test_fn_search_food_is_typo_tolerant_and_full_text(conn):
    top = lambda q: [r[0] for r in conn.execute("SELECT canonical_name FROM fn_search_food(%s, 3)", (q,))]
    assert "Paneer Butter Masala" in top("panner butter")
    assert any("Biryani" in n for n in top("biriyani"))
    assert top("masala dosa")[0] == "Masala Dosa"
    assert conn.execute("SELECT count(*) FROM fn_search_food('zzzzqq', 5)").fetchone()[0] == 0


def test_fn_ensure_waste_partitions_is_idempotent(conn):
    created = one(conn, "SELECT fn_ensure_waste_partitions(48)")
    assert created > 0
    assert one(conn, "SELECT fn_ensure_waste_partitions(48)") == 0
    assert one(conn, "SELECT count(*) FROM pg_inherits WHERE inhparent = 'waste_event'::regclass") >= 25 + created


# ----------------------------------------------------------------------------- T3 stock ledger
def test_waste_with_lot_deducts_stock_exactly_once(conn):
    lot, est, food, rem = pick_lot(conn)
    insert_waste(conn, est, lot, 2.5, food)
    assert remaining(conn, lot) == rem - Decimal("2.5")          # once, not twice


def test_changing_or_deleting_the_event_moves_stock_back(conn):
    lot, est, food, rem = pick_lot(conn)
    wid = insert_waste(conn, est, lot, 4)
    assert remaining(conn, lot) == rem - 4
    conn.execute("UPDATE waste_event SET quantity_kg = 1 WHERE waste_id = %s", (wid,))
    assert remaining(conn, lot) == rem - 1
    conn.execute("DELETE FROM waste_event WHERE waste_id = %s", (wid,))
    assert remaining(conn, lot) == rem


def test_stock_ledger_refuses_overdraw_foreign_lot_and_wrong_food(conn):
    lot, est, food, rem = pick_lot(conn)
    with pytest.raises(pgerr.CheckViolation, match="exceeds"):
        insert_waste(conn, est, lot, rem + 1)
    conn.rollback()
    other = one(conn, "SELECT establishment_id FROM establishment WHERE establishment_id <> %s ORDER BY 1 LIMIT 1", (est,))
    lot, est, food, rem = pick_lot(conn)
    with pytest.raises(pgerr.CheckViolation, match="another establishment"):
        insert_waste(conn, other, lot, 1)
    conn.rollback()
    lot, est, food, rem = pick_lot(conn)
    wrong = one(conn, "SELECT food_id FROM food_item WHERE food_id <> %s ORDER BY 1 LIMIT 1", (food,))
    with pytest.raises(pgerr.CheckViolation, match="does not match"):
        insert_waste(conn, est, lot, 1, wrong)


def test_bulk_load_switch_bypasses_the_ledger_only_when_set(conn):
    lot, est, food, rem = pick_lot(conn)
    conn.execute("SET LOCAL zonefood.bulk_load = 'on'")
    insert_waste(conn, est, lot, 3)
    assert remaining(conn, lot) == rem            # the seed relies on this: history is loaded already consistent
    conn.execute("SET LOCAL zonefood.bulk_load = 'off'")
    insert_waste(conn, est, lot, 3)
    assert remaining(conn, lot) == rem - 3


def test_after_the_seed_no_lot_is_negative_or_overfull(conn):
    assert one(conn, "SELECT count(*) FROM inventory_lot WHERE remaining_qty < 0 OR remaining_qty > received_qty") == 0


# ----------------------------------------------------------------------------- T4 audit
def test_audit_trigger_attributes_changes_to_the_session_user_and_strips_embeddings(conn):
    user = one(conn, "SELECT user_id FROM app_user WHERE role = 'ESTAB_MANAGER' ORDER BY user_id LIMIT 1")
    conn.execute("SELECT set_config('app.current_user_id', %s, true)", (str(user),))
    listing = make_listing(conn)
    conn.execute("UPDATE surplus_listing SET description = 'edited description for audit' WHERE listing_id = %s", (listing,))
    rows = conn.execute("""SELECT action, changed_by, old_row, new_row FROM audit_log WHERE table_name = 'surplus_listing'
                            AND record_pk = %s ORDER BY audit_id""", (str(listing),)).fetchall()
    assert [r[0] for r in rows] == ["I", "U"]
    assert all(r[1] == user for r in rows)
    assert rows[1][2]["description"] == "test listing for part 3" and rows[1][3]["description"] == "edited description for audit"
    assert "desc_embedding" not in rows[1][3]
    conn.execute("UPDATE surplus_listing SET description = description WHERE listing_id = %s", (listing,))
    assert one(conn, "SELECT count(*) FROM audit_log WHERE record_pk = %s AND table_name = 'surplus_listing'", (str(listing),)) == 2


# ----------------------------------------------------------------------------- T5 / T6 state guards
def test_claim_guard_allows_only_legal_transitions_and_freezes_identity(conn):
    listing = make_listing(conn)
    claim = one(conn, "SELECT fn_claim_surplus(%s, 1, 3, 0.5)", (listing,))
    with pytest.raises(pgerr.CheckViolation, match="Illegal claim transition"):
        conn.execute("UPDATE redistribution_claim SET status = 'COLLECTED', collected_at = now() WHERE claim_id = %s", (claim,))
    conn.rollback()
    listing = make_listing(conn)
    claim = one(conn, "SELECT fn_claim_surplus(%s, 1, 3, 0.5)", (listing,))
    with pytest.raises(pgerr.CheckViolation, match="cannot be changed"):
        conn.execute("UPDATE redistribution_claim SET claimed_qty_kg = 4 WHERE claim_id = %s", (claim,))
    conn.rollback()
    done = conn.execute("SELECT claim_id FROM redistribution_claim WHERE status = 'COLLECTED' LIMIT 1").fetchone()[0]
    with pytest.raises(pgerr.CheckViolation, match="Illegal claim transition"):
        conn.execute("UPDATE redistribution_claim SET status = 'REQUESTED' WHERE claim_id = %s", (done,))


def test_cancelled_listing_cannot_be_reopened(conn):
    listing = make_listing(conn)
    conn.execute("UPDATE surplus_listing SET status = 'CANCELLED' WHERE listing_id = %s", (listing,))
    with pytest.raises(pgerr.CheckViolation, match="cannot be reopened"):
        conn.execute("UPDATE surplus_listing SET status = 'OPEN' WHERE listing_id = %s", (listing,))


# ----------------------------------------------------------------------------- fn_claim_surplus / fn_transition_claim
def test_claim_function_validates_every_hard_rule(conn):
    listing = make_listing(conn, qty=10)
    claim = one(conn, "SELECT fn_claim_surplus(%s, 1, 6, 0.42)", (listing,))
    assert conn.execute("SELECT status, match_score FROM redistribution_claim WHERE claim_id = %s", (claim,)).fetchone() == ("REQUESTED", Decimal("0.4200"))
    for sql, exc, msg in [
        ("SELECT fn_claim_surplus(%s, 1, 1, NULL)", pgerr.UniqueViolation, "uq_claim"),                      # duplicate
        ("SELECT fn_claim_surplus(%s, 2, 11, NULL)", pgerr.CheckViolation, "Only 10.0 kg remain"),            # more than offered
        ("SELECT fn_claim_surplus(%s, 2, 0, NULL)", pgerr.CheckViolation, "greater than 0"),
        ("SELECT fn_claim_surplus(%s, 4, 2, NULL)", pgerr.CheckViolation, "does not accept cooked"),          # compost unit
        ("SELECT fn_claim_surplus(%s, 999, 2, NULL)", pgerr.NoDataFound, "Recipient"),
    ]:
        with pytest.raises(exc, match=msg):
            with conn.transaction():                       # a savepoint: the failure rolls back to here, not the whole test
                conn.execute(sql, (listing,))
    with pytest.raises(pgerr.NoDataFound):
        with conn.transaction():
            conn.execute("SELECT fn_claim_surplus(999999999, 1, 1, NULL)")


def test_claim_function_refuses_expired_cancelled_unavailable_and_over_capacity(conn):
    expired = make_listing(conn, hours=-1, available_hours_ago=3)
    with pytest.raises(pgerr.ObjectNotInPrerequisiteState, match="expired"):
        conn.execute("SELECT fn_claim_surplus(%s, 1, 1, NULL)", (expired,))
    conn.rollback()
    future = make_listing(conn, available_hours_ago=-2, hours=8)
    with pytest.raises(pgerr.ObjectNotInPrerequisiteState, match="not yet available"):
        conn.execute("SELECT fn_claim_surplus(%s, 1, 1, NULL)", (future,))
    conn.rollback()
    cancelled = make_listing(conn)
    conn.execute("UPDATE surplus_listing SET status = 'CANCELLED' WHERE listing_id = %s", (cancelled,))
    with pytest.raises(pgerr.ObjectNotInPrerequisiteState, match="cancelled"):
        conn.execute("SELECT fn_claim_surplus(%s, 1, 1, NULL)", (cancelled,))
    conn.rollback()
    big = make_listing(conn, qty=900)
    cap = one(conn, "SELECT daily_capacity_kg FROM recipient_org WHERE recipient_id = 1")
    with pytest.raises(pgerr.CheckViolation, match="daily capacity"):
        conn.execute("SELECT fn_claim_surplus(%s, 1, %s, NULL)", (big, cap + 1))


def test_transition_function_full_lifecycle_with_stock_and_redistribution_record(conn):
    listing = make_listing(conn, estab=1, qty=10)
    a = one(conn, "SELECT fn_claim_surplus(%s, 1, 6, 0.5)", (listing,))
    b = one(conn, "SELECT fn_claim_surplus(%s, 2, 5, 0.5)", (listing,))
    st = lambda: conn.execute("SELECT claimed_qty_kg, status FROM surplus_listing WHERE listing_id = %s", (listing,)).fetchone()
    assert conn.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 1, NULL)", (a,)).fetchone() == ("APPROVED", "PARTIALLY_CLAIMED")
    assert st() == (Decimal("6.000"), "PARTIALLY_CLAIMED")
    # B needs 5 but only 4 are unreserved
    with pytest.raises(pgerr.ObjectNotInPrerequisiteState, match="Only 4.0 kg"):
        conn.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 1, NULL)", (b,))
    conn.rollback()
    # (rollback also undid the setup; rebuild it deterministically)
    listing = make_listing(conn, estab=1, qty=10)
    a = one(conn, "SELECT fn_claim_surplus(%s, 1, 6, 0.5)", (listing,))
    conn.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 1, NULL)", (a,))
    before = one(conn, "SELECT count(*) FROM waste_event w JOIN waste_reason r USING (reason_id) WHERE r.reason_code = 'REDISTRIBUTED'")
    assert conn.execute("SELECT * FROM fn_transition_claim(%s, 'collect', NULL, 1)", (a,)).fetchone()[0] == "COLLECTED"
    rec = conn.execute("""SELECT w.quantity_kg, w.measurement_source, r.reason_code, d.route_name FROM waste_event w
                           JOIN waste_reason r USING (reason_id) JOIN disposal_route d USING (route_id)
                          WHERE w.notes LIKE %s""", (f"%(claim {a})%",)).fetchone()
    assert rec == (Decimal("6.000"), "SYSTEM", "REDISTRIBUTED", "DONATION")
    assert one(conn, "SELECT count(*) FROM waste_event w JOIN waste_reason r USING (reason_id) WHERE r.reason_code = 'REDISTRIBUTED'") == before + 1


def test_transition_function_sides_and_illegal_moves(conn):
    listing = make_listing(conn, estab=1, qty=10)
    a = one(conn, "SELECT fn_claim_surplus(%s, 1, 3, 0.5)", (listing,))
    with pytest.raises(pgerr.InsufficientPrivilege):                                 # the recipient cannot approve its own claim
        conn.execute("SELECT * FROM fn_transition_claim(%s, 'approve', NULL, 1)", (a,))
    conn.rollback()
    listing = make_listing(conn, estab=1, qty=10)
    a = one(conn, "SELECT fn_claim_surplus(%s, 1, 3, 0.5)", (listing,))
    with pytest.raises(pgerr.NoDataFound):                                           # another establishment / recipient: not found
        conn.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 2, 7)", (a,))
    conn.rollback()
    listing = make_listing(conn, estab=1, qty=10)
    a = one(conn, "SELECT fn_claim_surplus(%s, 1, 3, 0.5)", (listing,))
    with pytest.raises(pgerr.ObjectNotInPrerequisiteState, match="requested cannot be marked collected"):
        conn.execute("SELECT * FROM fn_transition_claim(%s, 'collect', 1, NULL)", (a,))
    conn.rollback()
    listing = make_listing(conn, estab=1, qty=10)
    a = one(conn, "SELECT fn_claim_surplus(%s, 1, 4, 0.5)", (listing,))
    conn.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 1, NULL)", (a,))
    assert conn.execute("SELECT * FROM fn_transition_claim(%s, 'no_show', 1, NULL)", (a,)).fetchone() == ("NO_SHOW", "OPEN")
    assert one(conn, "SELECT claimed_qty_kg FROM surplus_listing WHERE listing_id = %s", (listing,)) == 0     # stock released


# ----------------------------------------------------------------------------- sp_close_service_session
def make_session(conn, estab, batches):
    sid = one(conn, """INSERT INTO service_session (establishment_id, service_date, slot, expected_headcount)
                       VALUES (%s, CURRENT_DATE, 'ALL_DAY', 100) RETURNING session_id""", (estab,))
    out = []
    for dish_id, qty in batches:
        out.append(one(conn, """INSERT INTO preparation_batch (session_id, dish_id, prepared_qty_kg, prepared_portions, prepared_at)
                                VALUES (%s, %s, %s, 50, now()) RETURNING batch_id""", (sid, dish_id, qty)))
    return sid, out


def dishes_of(conn, estab, n):
    return [r[0] for r in conn.execute("SELECT dish_id FROM dish WHERE establishment_id = %s ORDER BY dish_id LIMIT %s", (estab, n))]


def test_close_procedure_records_consumption_waste_and_auto_lists_surplus(conn):
    d = dishes_of(conn, 1, 3)
    sid, b = make_session(conn, 1, [(d[0], 20), (d[1], 20), (d[2], 20)])
    import json
    recs = json.dumps([
        {"batch_id": b[0], "served_qty_kg": 10, "leftover_qty_kg": 7, "plate_waste_kg": 1.5},     # big leftover -> listing
        {"batch_id": b[1], "served_qty_kg": 15, "leftover_qty_kg": 1, "plate_waste_kg": 0},       # small leftover -> waste event
        {"batch_id": b[2], "served_qty_kg": 20, "leftover_qty_kg": 0, "plate_waste_kg": 0.5},
    ])
    row = conn.execute("CALL sp_close_service_session(%s, 1, 90, NULL, %s::jsonb, 2, NULL, NULL)", (sid, recs)).fetchone()
    waste_events, listings = row
    assert waste_events == 3 and len(listings) == 1                         # 2 plate rows + 1 small leftover; 1 listing
    assert conn.execute("SELECT is_closed, actual_headcount FROM service_session WHERE session_id = %s", (sid,)).fetchone() == (True, 90)
    assert one(conn, "SELECT count(*) FROM consumption_record WHERE batch_id = ANY(%s)", (b,)) == 3
    srcs = {r[0] for r in conn.execute("SELECT measurement_source FROM waste_event WHERE session_id = %s", (sid,))}
    assert srcs == {"SYSTEM"}
    assert conn.execute("SELECT offered_qty_kg, status, session_id FROM surplus_listing WHERE listing_id = %s", (listings[0],)).fetchone() == (Decimal("7.000"), "OPEN", sid)
    assert one(conn, "SELECT count(*) FROM waste_event WHERE session_id = %s AND was_edible = FALSE", (sid,)) == 2


def test_close_procedure_is_all_or_nothing(conn):
    import json
    d = dishes_of(conn, 1, 2)
    sid, b = make_session(conn, 1, [(d[0], 10), (d[1], 10)])
    bad = json.dumps([{"batch_id": b[0], "served_qty_kg": 5, "leftover_qty_kg": 2, "plate_waste_kg": 0},
                      {"batch_id": b[1], "served_qty_kg": 9, "leftover_qty_kg": 9, "plate_waste_kg": 0}])   # 18 > 10 -> trigger T1
    with pytest.raises(pgerr.CheckViolation, match="exceeds prepared"):
        with conn.transaction():
            conn.execute("CALL sp_close_service_session(%s, 1, 50, NULL, %s::jsonb, 2, NULL, NULL)", (sid, bad))
    assert conn.execute("SELECT is_closed FROM service_session WHERE session_id = %s", (sid,)).fetchone()[0] is False
    assert one(conn, "SELECT count(*) FROM consumption_record WHERE batch_id = ANY(%s)", (b,)) == 0      # the first, valid record rolled back too
    assert one(conn, "SELECT count(*) FROM waste_event WHERE session_id = %s", (sid,)) == 0
    # missing a batch, unknown batch, wrong establishment, double close
    partial = json.dumps([{"batch_id": b[0], "served_qty_kg": 5, "leftover_qty_kg": 1, "plate_waste_kg": 0}])
    with pytest.raises(pgerr.CheckViolation, match="exactly once"):
        with conn.transaction():
            conn.execute("CALL sp_close_service_session(%s, 1, 50, NULL, %s::jsonb, 2, NULL, NULL)", (sid, partial))
    with pytest.raises(pgerr.NoDataFound):
        with conn.transaction():
            conn.execute("CALL sp_close_service_session(%s, 2, 50, NULL, '[]'::jsonb, 2, NULL, NULL)", (sid,))
    good = json.dumps([{"batch_id": b[0], "served_qty_kg": 5, "leftover_qty_kg": 1, "plate_waste_kg": 0},
                       {"batch_id": b[1], "served_qty_kg": 5, "leftover_qty_kg": 1, "plate_waste_kg": 0}])
    conn.execute("CALL sp_close_service_session(%s, 1, 50, NULL, %s::jsonb, 2, NULL, NULL)", (sid, good))
    with pytest.raises(pgerr.ObjectNotInPrerequisiteState, match="already closed"):
        with conn.transaction():
            conn.execute("CALL sp_close_service_session(%s, 1, 50, NULL, %s::jsonb, 2, NULL, NULL)", (sid, good))


# ----------------------------------------------------------------------------- transactions
def test_transaction_rolls_back_every_step_when_a_later_step_fails(seeded_db):
    with psycopg.connect(pg_dsn(seeded_db)) as c:
        lot, est, food, rem = pick_lot(c)
        before_events = one(c, "SELECT count(*) FROM waste_event")
        try:
            with c.transaction():
                insert_waste(c, est, lot, 2)                           # step 1 succeeds (and deducts stock)
                assert remaining(c, lot) == rem - 2
                insert_waste(c, est, lot, rem)                         # step 2 overdraws -> the whole transaction aborts
        except pgerr.CheckViolation:
            pass
        assert remaining(c, lot) == rem                                 # stock restored
        assert one(c, "SELECT count(*) FROM waste_event") == before_events


# ----------------------------------------------------------------------------- concurrency (real, multi-connection)
def run_threads(dsn, jobs):
    """Run each job(conn) in its own connection, started together. Returns [(ok, exc_or_value)]."""
    results = [None] * len(jobs)
    barrier = threading.Barrier(len(jobs))

    def work(i, job):
        try:
            with psycopg.connect(dsn) as c:
                barrier.wait(timeout=15)
                try:
                    results[i] = (True, job(c))
                    c.commit()
                except Exception as e:  # noqa: BLE001
                    c.rollback()
                    results[i] = (False, e)
        except Exception as e:  # noqa: BLE001
            results[i] = (False, e)

    ts = [threading.Thread(target=work, args=(i, j)) for i, j in enumerate(jobs)]
    [t.start() for t in ts]
    [t.join(timeout=60) for t in ts]
    return results


def test_concurrent_approvals_cannot_oversubscribe_a_listing(seeded_db):
    dsn = pg_dsn(seeded_db)
    with psycopg.connect(dsn) as c:
        listing = make_listing(c, estab=1, qty=10, cooked=False)
        claims = [one(c, "SELECT fn_claim_surplus(%s, %s, 4, 0.5)", (listing, r)) for r in range(1, 9)]   # 8 claims x 4 kg on 10 kg
        c.commit()
    jobs = [lambda c, cl=cl: c.execute("SELECT * FROM fn_transition_claim(%s, 'approve', 1, NULL)", (cl,)).fetchone() for cl in claims]
    res = run_threads(dsn, jobs)
    ok = [r for r in res if r[0]]
    failed = [r[1] for r in res if not r[0]]
    assert len(ok) == 2, [type(e).__name__ for e in failed]                   # only 2 x 4 = 8 kg fit into 10 kg
    assert all(isinstance(e, pgerr.ObjectNotInPrerequisiteState) for e in failed)
    with psycopg.connect(dsn) as c:
        claimed, status = c.execute("SELECT claimed_qty_kg, status FROM surplus_listing WHERE listing_id = %s", (listing,)).fetchone()
        approved = one(c, "SELECT sum(claimed_qty_kg) FROM redistribution_claim WHERE listing_id = %s AND status = 'APPROVED'", (listing,))
    assert claimed == approved == Decimal("8.000") and status == "PARTIALLY_CLAIMED"


def test_concurrent_duplicate_claims_produce_exactly_one_claim(seeded_db):
    dsn = pg_dsn(seeded_db)
    with psycopg.connect(dsn) as c:
        listing = make_listing(c, estab=1, qty=10, cooked=False)
        c.commit()
    jobs = [lambda c: one(c, "SELECT fn_claim_surplus(%s, 3, 2, 0.5)", (listing,)) for _ in range(6)]
    res = run_threads(dsn, jobs)
    assert sum(1 for r in res if r[0]) == 1
    assert all(isinstance(r[1], pgerr.UniqueViolation) for r in res if not r[0])
    with psycopg.connect(dsn) as c:
        assert one(c, "SELECT count(*) FROM redistribution_claim WHERE listing_id = %s", (listing,)) == 1


def test_concurrent_write_offs_cannot_drive_stock_negative_or_deduct_twice(seeded_db):
    dsn = pg_dsn(seeded_db)
    with psycopg.connect(dsn) as c:
        lot, est, food, _ = pick_lot(c, 20)
        c.execute("UPDATE inventory_lot SET remaining_qty = 10, received_qty = GREATEST(received_qty, 10) WHERE lot_id = %s", (lot,))
        c.commit()
    jobs = [lambda c: insert_waste(c, est, lot, 3) for _ in range(10)]        # 10 x 3 kg against 10 kg
    res = run_threads(dsn, jobs)
    won = sum(1 for r in res if r[0])
    assert won == 3                                                           # exactly three fit; never a fourth
    assert all(isinstance(r[1], pgerr.CheckViolation) for r in res if not r[0])
    with psycopg.connect(dsn) as c:
        assert remaining(c, lot) == Decimal(10 - 3 * won)
        assert one(c, "SELECT coalesce(sum(quantity_kg), 0) FROM waste_event WHERE lot_id = %s", (lot,)) == 3 * won


def test_concurrent_close_of_the_same_session_closes_it_once(seeded_db):
    import json
    dsn = pg_dsn(seeded_db)
    with psycopg.connect(dsn) as c:
        d = dishes_of(c, 1, 1)
        sid, b = make_session(c, 1, [(d[0], 20)])
        c.commit()
    recs = json.dumps([{"batch_id": b[0], "served_qty_kg": 10, "leftover_qty_kg": 5, "plate_waste_kg": 1}])
    jobs = [lambda c: c.execute("CALL sp_close_service_session(%s, 1, 80, NULL, %s::jsonb, 2, NULL, NULL)", (sid, recs)).fetchone() for _ in range(5)]
    res = run_threads(dsn, jobs)
    assert sum(1 for r in res if r[0]) == 1
    with psycopg.connect(dsn) as c:
        assert one(c, "SELECT count(*) FROM consumption_record WHERE batch_id = %s", (b[0],)) == 1
        assert one(c, "SELECT count(*) FROM surplus_listing WHERE session_id = %s", (sid,)) == 1       # one auto-listing, not five
        assert one(c, "SELECT count(*) FROM waste_event WHERE session_id = %s", (sid,)) == 1

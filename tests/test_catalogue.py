"""Phase 3.1 tests: every query in db/queries/ executes on a clean, migrated and seeded database, returns rows, and
produces results that are internally consistent. DML queries must leave the data untouched (they run rolled back).
"""
from __future__ import annotations

import psycopg
import pytest

import catalogue
from db_config import pg_dsn

QUERIES = catalogue.load_queries()
BY_ID = {q.qid: q for q in QUERIES}


@pytest.fixture(scope="module")
def cat_db(seeded_db):
    """The seed leaves embeddings NULL (the Node app fills them). Q22 needs vectors, so give recipients and the newest
    listing deterministic synthetic ones; this is only a stand-in for the real MiniLM vectors."""
    with psycopg.connect(pg_dsn(seeded_db), autocommit=True) as c:
        vec = "(SELECT ('[' || string_agg(sin(i * %s)::text, ',') || ']')::vector FROM generate_series(1, 384) i)"
        c.execute(f"UPDATE recipient_org SET need_embedding = {vec % 'recipient_id'}")
        c.execute(f"UPDATE surplus_listing SET desc_embedding = {vec % '3'} WHERE listing_id = (SELECT max(listing_id) FROM surplus_listing)")
        # Let "time pass" on the disposable database: the seed's open listings are for tomorrow, but Q24 is housekeeping for
        # listings whose window has closed. (On a database that is a day old - the working one - this is naturally true.)
        c.execute("ALTER TABLE surplus_listing DISABLE TRIGGER tr_audit_listing")
        c.execute("""UPDATE surplus_listing SET available_from = now() - interval '6 hours', expires_at = now() - interval '1 hour'
                      WHERE status = 'OPEN' AND expires_at > now()""")
        c.execute("ALTER TABLE surplus_listing ENABLE TRIGGER tr_audit_listing")
    # Q27 reads a stored forecast run: train the real models on this disposable database (about 20 s).
    import forecast
    with psycopg.connect(pg_dsn(seeded_db)) as c:
        forecast.run(c, log=lambda *_: None)
    return seeded_db


@pytest.fixture(scope="module")
def results(cat_db):
    return {r.query.qid: r for r in catalogue.run_all(cat_db)}


def counts(dbname):
    with psycopg.connect(pg_dsn(dbname)) as c:
        return c.execute("""SELECT (SELECT count(*) FROM surplus_listing), (SELECT count(*) FROM waste_event),
                                   (SELECT count(*) FROM redistribution_claim), (SELECT count(*) FROM food_alias),
                                   (SELECT count(*) FROM audit_log), (SELECT sum(remaining_qty) FROM inventory_lot)""").fetchone()


def col(res, name):
    i = res.columns.index(name)
    return [r[i] for r in res.rows]


def test_the_catalogue_has_at_least_22_queries_with_complete_documentation():
    assert len(QUERIES) >= 22
    for q in QUERIES:
        assert q.title and q.concepts and q.purpose and q.reading and q.sql, q.qid
    assert {q.mode for q in QUERIES} == {"select", "dml"}
    assert [q.qid for q in QUERIES] == [f"Q{i:02d}" for i in range(1, len(QUERIES) + 1)]


@pytest.mark.parametrize("qid", [q.qid for q in QUERIES])
def test_query_executes_and_returns_rows(results, qid):
    r = results[qid]
    assert r.error is None, r.error
    assert r.rowcount > 0, f"{qid} returned no rows on the seeded database"
    assert r.columns


def test_dml_queries_leave_the_data_untouched(cat_db):
    before = counts(cat_db)
    for r in catalogue.run_all(cat_db, [q.qid for q in QUERIES if q.mode == "dml"]):
        assert r.error is None and r.rowcount > 0
    assert counts(cat_db) == before


def test_catalogue_covers_the_required_sql_features():
    text = {q.qid: q.sql.upper() for q in QUERIES}
    must = {
        "INSERT": any(t.lstrip().startswith("INSERT") for t in text.values()),
        "UPDATE": any(t.lstrip().startswith("UPDATE") for t in text.values()),
        "DELETE": any(t.lstrip().startswith("DELETE") for t in text.values()),
        "INNER JOIN": any(" JOIN " in t and "LEFT JOIN" not in t for t in text.values()),
        "LEFT JOIN": any("LEFT JOIN" in t for t in text.values()),
        "GROUP BY": any("GROUP BY" in t for t in text.values()),
        "HAVING": any("HAVING" in t for t in text.values()),
        "WINDOW": any(" OVER (" in t or " OVER W" in t for t in text.values()),
        "RECURSIVE": any("WITH RECURSIVE" in t for t in text.values()),
        "CORRELATED": "AND E2.CATEGORY_ID = EC.CATEGORY_ID" in text["Q03"].replace("\n", " ") or "-- <- THE CORRELATION" in text["Q03"],
        "AGGREGATES": all(any(f in t for t in text.values()) for f in ("SUM(", "AVG(", "COUNT(", "CORR(", "PERCENTILE_CONT")),
        "EXISTS": any("NOT EXISTS" in t for t in text.values()),
        "VECTOR": "<=>" in text["Q22"],
    }
    assert all(must.values()), must


# ----------------------------------------------------------------------- the results mean what the documentation says
def test_q01_rows_are_per_block_and_kind_and_non_negative(results):
    r = results["Q01"]
    assert len({(a, b) for a, b in zip(col(r, "block"), col(r, "establishment_kind"))}) == r.rowcount
    assert all(v > 0 for v in col(r, "waste_kg"))


def test_q02_shares_are_consistent(results):
    r = results["Q02"]
    kgs, share, cum = col(r, "waste_kg"), col(r, "pct_of_zone_total"), col(r, "cumulative_pct")
    assert kgs == sorted(kgs, reverse=True) and r.rowcount == 10
    assert all(a <= b for a, b in zip(cum, cum[1:])) and cum[-1] <= 100
    assert abs(sum(share) - cum[-1]) < 0.2        # running total ends at the sum of the shares (rounding only)


def test_q03_correlated_form_equals_the_window_rewrite(cat_db, results):
    rewrite = """WITH per AS (SELECT e.establishment_id, e.name, ec.category_id, ec.category_name, SUM(w.quantity_kg)/e.capacity AS k
                   FROM waste_event w JOIN waste_reason wr ON wr.reason_id=w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
                   JOIN establishment e ON e.establishment_id=w.establishment_id JOIN establishment_category ec ON ec.category_id=e.category_id
                  WHERE w.occurred_on >= CURRENT_DATE - 90 GROUP BY e.establishment_id, e.name, e.capacity, ec.category_id, ec.category_name),
                r AS (SELECT *, AVG(k) OVER (PARTITION BY category_id) a FROM per)
                SELECT name FROM r WHERE k > a"""
    with psycopg.connect(pg_dsn(cat_db)) as c:
        expected = {r[0] for r in c.execute(rewrite)}
    assert set(col(results["Q03"], "name")) == expected and expected


def test_q04_rollup_total_equals_sum_of_kinds(results):
    r = results["Q04"]
    kinds = dict(zip(col(r, "establishment_kind"), col(r, "total_kg")))
    total = kinds.pop("ALL KINDS")
    assert abs(sum(kinds.values()) - total) < 1.0
    assert all(0 <= p <= 100 for p in col(r, "pre_consumer_pct"))


def test_q05_only_repeat_offenders_and_planted_school_is_found(results):
    r = results["Q05"]
    assert all(n >= 10 for n in col(r, "poor_sessions")) and all(u < 75 for u in col(r, "avg_utilisation_pct"))
    assert any("School" in n or "Academy" in n for n in col(r, "name"))      # the Part 1 data plants a chronic over-preparing school


def test_q06_correlations_are_valid(results):
    assert all(-1 <= c <= 1 for c in col(results["Q06"], "turnout_utilisation_corr") if c is not None)


def test_q07_has_all_seven_weekdays(results):
    assert col(results["Q07"], "dow") == list(range(7))


def test_q09_is_sorted_by_value_and_inside_the_window(results):
    r = results["Q09"]
    v = col(r, "value_at_risk_inr")
    assert v == sorted(v, reverse=True)
    assert all(0 <= h <= 24 * 7 for h in col(r, "hours_left")) and col(r, "value_rank")[0] == 1


def test_q10_funnel_never_gains_food(results):
    r = results["Q10"]
    for off, col_kg, rate in zip(col(r, "offered_kg"), col(r, "collected_kg"), col(r, "rescue_rate_pct")):
        assert 0 <= col_kg <= off and 0 <= rate <= 100


def test_q12_median_is_not_above_p90(results):
    r = results["Q12"]
    assert all(m <= p for m, p in zip(col(r, "median_hours"), col(r, "p90_hours")))


def test_q13_months_are_ordered_and_first_change_is_null(results):
    r = results["Q13"]
    months = col(r, "month")
    assert months == sorted(months) and col(r, "change_vs_prev_month_pts")[0] is None
    assert all(0 <= p <= 100 for p in col(r, "diversion_pct"))


def test_q15_every_row_really_exceeds_the_threshold(results):
    r = results["Q15"]
    assert all(z > 2.5 for z in col(r, "z_score")) and all(k > e for k, e in zip(col(r, "kg"), col(r, "expected_kg")))


def test_q16_rolling_average_matches_a_manual_calculation(results):
    r = results["Q16"]
    rows = sorted(zip(col(r, "day"), col(r, "kg"), col(r, "rolling_7d_avg")))      # oldest first
    for i in range(6, len(rows)):
        manual = sum(float(k) for _, k, _ in rows[i - 6:i + 1]) / 7
        assert abs(manual - float(rows[i][2])) < 0.11                              # both are rounded to 1 decimal


def test_q17_each_category_has_exactly_one_rank_one(results):
    r = results["Q17"]
    cats = set(col(r, "category_name"))
    ones = [c for c, rk in zip(col(r, "category_name"), col(r, "worst_rank")) if rk == 1]
    assert set(ones) == cats and len(ones) == len(cats)
    assert all(0 <= p <= 1 for p in col(r, "percentile"))


def test_q18_parent_roll_up_equals_sum_of_children(results):
    r = results["Q18"]
    depth, rolled = col(r, "depth"), col(r, "rolled_up_kg")
    sector = rolled[depth.index(0)]
    blocks = sum(v for d, v in zip(depth, rolled) if d == 1)
    assert abs(sector - blocks) <= 6                                              # six blocks, each rounded to a whole kg
    assert depth.count(0) == 1 and max(depth) == 2


def test_q20_finds_the_planted_high_spoilage_supplier(results):
    r = results["Q20"]
    rates = col(r, "spoilage_rate_pct")
    assert rates == sorted(rates, reverse=True)
    assert "Greenacre" in col(r, "supplier")[0] and rates[0] > 2 * rates[1]


def test_q21_provenance_percentages_add_up(results):
    r = results["Q21"]
    for m, e, s in zip(col(r, "manual_pct"), col(r, "etl_import_pct"), col(r, "system_pct")):
        assert abs((m or 0) + (e or 0) + (s or 0) - 100) < 0.4


def test_q22_returns_at_most_five_feasible_recipients_best_first(results):
    r = results["Q22"]
    sims = col(r, "similarity")
    assert 1 <= r.rowcount <= 5 and sims == sorted(sims, reverse=True)


def test_dml_queries_return_what_they_claim(results):
    assert all(s == "OPEN" for s in col(results["Q23"], "status")) and results["Q23"].rowcount <= 3
    assert all(s == "EXPIRED" for s in col(results["Q24"], "status"))
    assert len(set(col(results["Q25"], "source_doc_id"))) == 1                     # one document's rows only
    assert col(results["Q26"], "method") == ["MANUAL"] and col(results["Q26"], "status") == ["RESOLVED"]


def test_q27_forecast_accuracy_matches_the_stored_run(results, cat_db):
    r = results["Q27"]
    assert sorted(col(r, "model")) == ["lightgbm", "ridge", "seasonal_naive"]
    assert col(r, "mae_kg") == sorted(col(r, "mae_kg"))                       # ordered by MAE
    with psycopg.connect(pg_dsn(cat_db)) as c:
        (metrics,) = c.execute("SELECT metrics FROM forecast_run ORDER BY run_id DESC LIMIT 1").fetchone()
    for model, mae in zip(col(r, "model"), col(r, "mae_kg")):
        assert abs(float(mae) - metrics[model]["mae_zone_day"]) < 0.06        # SQL result equals what the training script reported
    assert all(float(v) > 0 for v in col(r, "mape_pct"))

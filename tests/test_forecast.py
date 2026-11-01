"""Forecasting pipeline: leakage prevention, chronological split, honest metrics and the stored run (scripts/forecast.py)."""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd
import pytest

from conftest import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
import forecast as fc  # noqa: E402


def synthetic_panel(days: int = 80, n_est: int = 3) -> tuple[pd.DataFrame, pd.Timestamp]:
    rng = np.random.default_rng(7)
    start = pd.Timestamp("2026-01-01")
    rows = [(e, start + pd.Timedelta(days=d), float(10 + 5 * ((d % 7) >= 5) + rng.normal(0, 1))) for e in range(1, n_est + 1) for d in range(days)]
    daily = pd.DataFrame(rows, columns=["est", "day", "y"]).assign(n=1)
    est = pd.DataFrame({"est": range(1, n_est + 1), "zone_id": 1, "capacity": [100, 200, 300][:n_est], "kind": ["COMMERCIAL", "EDUCATIONAL", "RESIDENTIAL"][:n_est]})
    return daily, est, start + pd.Timedelta(days=days - 1)


def panel_from(daily, est, last, events=None):
    ev = events if events is not None else pd.DataFrame(columns=["event_type", "start", "end", "impact", "zone_id"])
    return fc.add_lag_features(fc.build_panel(daily, est, {1: None}, ev, last))


def test_features_never_see_the_row_they_predict():
    """Overwrite y from day t0 onwards: every feature on or before t0 must be unchanged (no same-day or future information)."""
    daily, est, last = synthetic_panel()
    base = panel_from(daily, est, last)
    t0 = pd.Timestamp("2026-02-20")
    tampered = daily.copy()
    tampered.loc[tampered["day"] >= t0, "y"] = 9999.0
    other = panel_from(tampered, est, last)
    cols = fc.HIST + [f"lag_{k}" for k in fc.LAGS]
    a = base[base["day"] <= t0].reset_index(drop=True)[cols]
    b = other[other["day"] <= t0].reset_index(drop=True)[cols]
    pd.testing.assert_frame_equal(a, b)
    after = other[other["day"] == t0 + pd.Timedelta(days=1)]["lag_1"]
    assert (after == 9999.0).all()       # the NEXT day legitimately sees it: proves the test can detect a difference


def test_future_row_is_added_and_has_no_label():
    daily, est, last = synthetic_panel()
    panel = panel_from(daily, est, last)
    tomorrow = panel[panel["day"] == last + pd.Timedelta(days=1)]
    assert len(tomorrow) == est["est"].nunique() and tomorrow["y"].isna().all()
    X, _ = fc.design(tomorrow, sorted(panel["kind"].unique()))
    assert not X.isna().any().any()      # every feature for tomorrow is computable from history


def test_split_is_chronological_and_disjoint():
    days = list(pd.date_range("2026-01-01", periods=100))
    w = fc.split_dates(days, 20, 20)
    assert w["train"][-1] < w["val"][0] and w["val"][-1] < w["test"][0]
    assert len(w["test"]) == 20 and len(w["val"]) == 20 and len(w["train"]) == 60
    assert not (set(w["train"]) & set(w["val"])) and not (set(w["val"]) & set(w["test"]))
    with pytest.raises(SystemExit):
        fc.split_dates(days[:30], 20, 20)


def test_metrics_are_zero_for_a_perfect_forecast_and_positive_otherwise():
    frame = pd.DataFrame({"est": [1, 2, 1, 2], "day": pd.to_datetime(["2026-01-01"] * 2 + ["2026-01-02"] * 2), "y": [1.0, 2.0, 3.0, 4.0]})
    perfect = fc.metrics(frame, frame["y"].to_numpy())
    assert all(v == 0 for v in perfect.values())
    off = fc.metrics(frame, frame["y"].to_numpy() + 1)
    assert off["mae_estab_day"] == 1 and off["rmse_estab_day"] == 1 and off["mae_zone_day"] == 2


def test_partial_last_day_is_not_used_for_training():
    daily, est, last = synthetic_panel()
    partial = pd.DataFrame({"est": [1], "day": [last + pd.Timedelta(days=1)], "y": [3.0], "n": [1]})   # one event, i.e. a half-recorded day
    daily = pd.concat([daily.assign(n=10), partial])
    class C:    # minimal connection stub
        def execute(self, sql, *a):
            class R:
                def fetchall(s):
                    if "FROM waste_event" in sql: return [tuple(r) for r in daily[["est", "day", "y", "n"]].itertuples(index=False)]
                    if "FROM establishment" in sql: return [tuple(r) for r in est.itertuples(index=False)]
                    if "FROM zone" in sql: return [(1, None)]
                    return []
            return R()
    _, _, _, _, usable_last = fc.load_history(C())
    assert usable_last == last


def test_run_on_seeded_database_stores_a_consistent_honest_run(conn):
    run_id = fc.run(conn, log=lambda *_: None)
    r = conn.execute("SELECT best_model, metrics, train_to, val_from, val_to, test_from, test_to, history_to, n_train, n_val, n_test FROM forecast_run WHERE run_id = %s", (run_id,)).fetchone()
    best, metrics, train_to, val_from, val_to, test_from, test_to, history_to, ntr, nva, nte = r
    assert set(metrics) == set(fc.MODELS)
    assert best == min(fc.MODELS, key=lambda k: metrics[k]["rmse_zone_day"])        # the label is derived, not asserted
    assert train_to < val_from and val_to < test_from and test_to <= history_to
    assert ntr > nva and nte > 0
    for m in fc.MODELS:
        assert metrics[m]["mae_estab_day"] > 0 and np.isfinite(metrics[m]["rmse_zone_day"])
    dates = conn.execute("SELECT min(eval_date), max(eval_date), count(DISTINCT eval_date), count(DISTINCT model) FROM forecast_eval_daily WHERE run_id = %s", (run_id,)).fetchone()
    assert dates[0] == test_from and dates[1] == test_to and dates[3] == 3
    neg = conn.execute("SELECT count(*) FROM forecast_prediction WHERE run_id = %s AND predicted_kg < 0", (run_id,)).fetchone()[0]
    assert neg == 0
    assert conn.execute("SELECT count(*) FROM forecast_prediction WHERE run_id = %s AND model = 'lightgbm'", (run_id,)).fetchone()[0] >= 50
    tgt = conn.execute("SELECT DISTINCT target_date FROM forecast_prediction WHERE run_id = %s", (run_id,)).fetchall()
    assert tgt == [(history_to + pd.Timedelta(days=1).to_pytimedelta(),)]
    shares = conn.execute("SELECT model, round(sum(importance)) FROM forecast_importance WHERE run_id = %s GROUP BY model", (run_id,)).fetchall()
    assert all(abs(float(s) - 100) <= 1 for _, s in shares)
    # actuals in the evaluation table are the real zone totals from waste_event
    d, a = conn.execute("SELECT eval_date, actual_kg FROM forecast_eval_daily WHERE run_id = %s AND model = 'ridge' ORDER BY eval_date LIMIT 1", (run_id,)).fetchone()
    real = conn.execute("SELECT round(sum(quantity_kg), 2) FROM waste_event w JOIN waste_reason wr USING (reason_id) WHERE occurred_on = %s AND reason_code <> 'REDISTRIBUTED'", (d,)).fetchone()[0]
    assert abs(float(real) - float(a)) < 0.05

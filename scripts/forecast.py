"""Train and evaluate waste forecasting models on the REAL ZoneFood history, then store the run in PostgreSQL.

    python scripts/forecast.py                  # train on the working database, store run, print comparison
    python scripts/forecast.py --db zf_test_x   # another database
    python scripts/forecast.py --test-days 28 --val-days 28

Task: predict the kilograms of food WASTED (redistributed food excluded) by each establishment on the next day,
using only information available at the end of the previous day.

Models compared on the same held-out rows
    seasonal_naive  value of the same weekday one week earlier (the baseline every model must beat)
    ridge           standardised Ridge regression (alpha chosen on the validation window)
    lightgbm        gradient-boosted trees (leaves / early stopping chosen on the validation window)

Leakage prevention (each point is tested in tests/test_forecast.py)
    * lag and rolling features are built from values shifted by >= 1 day, so row t never contains y[t] or later;
    * the split is chronological: train < validation < test, no shuffling, no overlap;
    * scalers and hyper-parameters are fitted / chosen without the test window;
    * the test window is scored once; only afterwards are the models refitted on ALL history to forecast tomorrow;
    * calendar and event features are known in advance (they are schedules, not outcomes).

The data are synthetic; see docs/FORECASTING.md for what that means for the conclusions.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db_config import pg_dsn  # noqa: E402

LAGS = (1, 2, 3, 7, 14, 21, 28)
SEED = 20261101
MODELS = ("seasonal_naive", "ridge", "lightgbm")
TARGET = "daily_waste_kg_per_establishment"


# ---------------------------------------------------------------- data

def load_history(conn: psycopg.Connection) -> tuple[pd.DataFrame, pd.DataFrame, dict[int, int | None], pd.DataFrame, pd.Timestamp]:
    """Daily waste per establishment (zeros filled), establishment attributes, zone parents, events, last complete day."""
    daily = pd.DataFrame(
        conn.execute(
            """SELECT w.establishment_id AS est, w.occurred_on AS day, SUM(w.quantity_kg)::float AS y, COUNT(*) AS n
                 FROM waste_event w JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
                GROUP BY 1, 2""").fetchall(), columns=["est", "day", "y", "n"])
    if daily.empty:
        raise SystemExit("No waste history to learn from. Run scripts/setup_db.py first.")
    daily["day"] = pd.to_datetime(daily["day"])
    # The last day may still be filling up (e.g. today). A day counts as complete when it has at least half of the
    # median event count of the preceding four weeks; training on a half-recorded day would teach the models noise.
    per_day = daily.groupby("day")["n"].sum().sort_index()
    ref = per_day.iloc[-29:-1].median() if len(per_day) > 29 else per_day.median()
    complete = per_day[per_day >= 0.5 * ref]
    last = complete.index.max()
    daily = daily[daily["day"] <= last]

    est = pd.DataFrame(
        conn.execute(
            """SELECT e.establishment_id AS est, e.zone_id, e.capacity, ec.kind FROM establishment e
                 JOIN establishment_category ec ON ec.category_id = e.category_id""").fetchall(),
        columns=["est", "zone_id", "capacity", "kind"])
    parents = dict(conn.execute("SELECT zone_id, parent_zone_id FROM zone").fetchall())
    events = pd.DataFrame(
        conn.execute(
            """SELECT le.event_type, le.start_date, le.end_date, le.expected_impact, ze.zone_id
                 FROM locality_event le JOIN zone_event ze ON ze.event_id = le.event_id""").fetchall(),
        columns=["event_type", "start", "end", "impact", "zone_id"])
    if not events.empty:
        events["start"] = pd.to_datetime(events["start"])
        events["end"] = pd.to_datetime(events["end"])
    return daily, est, parents, events, last


def _ancestors(zone_id: int, parents: dict[int, int | None]) -> set[int]:
    out, z = set(), zone_id
    while z is not None and z not in out:
        out.add(z)
        z = parents.get(z)
    return out


def build_panel(daily: pd.DataFrame, est: pd.DataFrame, parents: dict, events: pd.DataFrame, last: pd.Timestamp, horizon: int = 1) -> pd.DataFrame:
    """One row per establishment per day (zero-filled) plus `horizon` future rows with y = NaN, and the calendar features."""
    est = est[est["est"].isin(daily["est"].unique())].copy()
    first = daily["day"].min()
    days = pd.date_range(first, last + pd.Timedelta(days=horizon))
    idx = pd.MultiIndex.from_product([sorted(est["est"]), days], names=["est", "day"])
    df = daily.set_index(["est", "day"])[["y"]].reindex(idx).reset_index()
    df.loc[df["day"] <= last, "y"] = df.loc[df["day"] <= last, "y"].fillna(0.0)  # no event recorded = nothing wasted
    df = df.merge(est[["est", "zone_id", "capacity", "kind"]], on="est")

    # calendar (known in advance)
    df["dow"] = df["day"].dt.day_of_week
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["day_of_month"] = df["day"].dt.day
    # schedule features: an event listed for the establishment's zone or any ancestor zone
    df["event_impact"] = 0.0
    for t in ("EXAM_PERIOD", "FESTIVAL", "VACATION", "PUBLIC_HOLIDAY", "LOCAL_EVENT"):
        df[f"ev_{t.lower()}"] = 0
    if not events.empty:
        anc = {z: _ancestors(z, parents) for z in df["zone_id"].unique()}
        for _, ev in events.iterrows():
            in_zone = df["zone_id"].map(lambda z: ev["zone_id"] in anc[z])
            active = in_zone & (df["day"] >= ev["start"]) & (df["day"] <= ev["end"])
            df.loc[active, "event_impact"] += ev["impact"]
            df.loc[active, f"ev_{ev['event_type'].lower()}"] = 1
    df["log_capacity"] = np.log(df["capacity"].astype(float))
    return df.sort_values(["est", "day"]).reset_index(drop=True)


def add_lag_features(df: pd.DataFrame) -> pd.DataFrame:
    """History features. Every one of them is computed from y shifted by at least one day (no same-day information)."""
    df = df.sort_values(["est", "day"]).copy()
    g = df.groupby("est")["y"]
    for k in LAGS:
        df[f"lag_{k}"] = g.shift(k)
    shifted = g.shift(1)
    df["roll_mean_7"] = shifted.groupby(df["est"]).transform(lambda s: s.rolling(7, min_periods=7).mean())
    df["roll_std_7"] = shifted.groupby(df["est"]).transform(lambda s: s.rolling(7, min_periods=7).std())
    df["roll_mean_28"] = shifted.groupby(df["est"]).transform(lambda s: s.rolling(28, min_periods=28).mean())
    df["momentum"] = df["roll_mean_7"] / (df["roll_mean_28"] + 1e-6)
    df["same_dow_mean_4w"] = df[["lag_7", "lag_14", "lag_21", "lag_28"]].mean(axis=1)
    return df


CAL = ["is_weekend", "day_of_month", "event_impact", "ev_exam_period", "ev_festival", "ev_vacation", "ev_public_holiday", "ev_local_event", "log_capacity"]
HIST = [f"lag_{k}" for k in (1, 2, 3, 7, 14)] + ["roll_mean_7", "roll_std_7", "roll_mean_28", "momentum", "same_dow_mean_4w"]


def design(df: pd.DataFrame, kinds: list[str]) -> tuple[pd.DataFrame, list[str]]:
    """Model matrix: numeric history + calendar + one-hot weekday and establishment kind."""
    X = df[HIST + CAL].copy()
    for d in range(7):
        X[f"dow_{d}"] = (df["dow"] == d).astype(int)
    for k in kinds:
        X[f"kind_{k.lower()}"] = (df["kind"] == k).astype(int)
    return X, list(X.columns)


def split_dates(usable_days: list[pd.Timestamp], val_days: int, test_days: int) -> dict[str, list[pd.Timestamp]]:
    """Chronological windows over the usable days: [train ...][val][test] with no overlap and no shuffling."""
    days = sorted(usable_days)
    if len(days) < val_days + test_days + 14:
        raise SystemExit(f"Only {len(days)} usable days; need at least {val_days + test_days + 14} for train/validation/test.")
    return {"train": days[: -(val_days + test_days)], "val": days[-(val_days + test_days): -test_days], "test": days[-test_days:]}


# ---------------------------------------------------------------- models

def metrics(frame: pd.DataFrame, pred: np.ndarray) -> dict[str, float]:
    err = pred - frame["y"].to_numpy()
    zone = pd.DataFrame({"day": frame["day"].to_numpy(), "y": frame["y"].to_numpy(), "p": pred}).groupby("day").sum()
    ze = zone["p"] - zone["y"]
    return {
        "mae_estab_day": float(np.mean(np.abs(err))), "rmse_estab_day": float(np.sqrt(np.mean(err ** 2))),
        "mae_zone_day": float(np.mean(np.abs(ze))), "rmse_zone_day": float(np.sqrt(np.mean(ze ** 2))),
        "wape_zone_pct": float(100 * np.abs(ze).sum() / max(zone["y"].sum(), 1e-9)),
    }


def fit_predict(df: pd.DataFrame, kinds: list[str], windows: dict[str, list[pd.Timestamp]], log=print) -> dict:
    """Select hyper-parameters on validation, refit on train+validation, score ONCE on test. Returns everything to store."""
    import lightgbm as lgb
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    Xall, feats = design(df, kinds)
    part = {k: df["day"].isin(v).to_numpy() for k, v in windows.items()}
    X = {k: Xall[m] for k, m in part.items()}
    y = {k: df.loc[m, "y"].to_numpy() for k, m in part.items()}
    fr = {k: df.loc[m, ["est", "day", "y"]] for k, m in part.items()}
    trval = part["train"] | part["val"]

    chosen: dict = {}
    # Ridge: alpha on validation only
    best = (None, np.inf)
    for alpha in (0.1, 1, 10, 100, 1000, 10000):
        m = make_pipeline(StandardScaler(), Ridge(alpha=alpha)).fit(X["train"], y["train"])
        mae = np.mean(np.abs(np.clip(m.predict(X["val"]), 0, None) - y["val"]))
        if mae < best[1]:
            best = (alpha, mae)
    chosen["ridge"] = {"alpha": best[0], "val_mae": round(float(best[1]), 4)}
    log(f"  ridge: alpha={best[0]} (val MAE {best[1]:.3f})")

    # LightGBM: num_leaves + number of trees (early stopping) on validation only
    best_l = (None, np.inf, 0)
    for leaves in (7, 15, 31):
        m = lgb.LGBMRegressor(n_estimators=600, learning_rate=0.04, num_leaves=leaves, min_child_samples=20, subsample=0.8, subsample_freq=1,
                              colsample_bytree=0.8, reg_lambda=1.0, objective="regression", random_state=SEED, n_jobs=1, verbose=-1, deterministic=True, force_row_wise=True)
        m.fit(X["train"], y["train"], eval_X=X["val"], eval_y=y["val"], eval_metric="l1", callbacks=[lgb.early_stopping(40, verbose=False)])
        mae = np.mean(np.abs(np.clip(m.predict(X["val"], num_iteration=m.best_iteration_), 0, None) - y["val"]))
        if mae < best_l[1]:
            best_l = (leaves, mae, int(m.best_iteration_ or 600))
    chosen["lightgbm"] = {"num_leaves": best_l[0], "n_estimators": best_l[2], "learning_rate": 0.04, "val_mae": round(float(best_l[1]), 4)}
    log(f"  lightgbm: leaves={best_l[0]}, trees={best_l[2]} (val MAE {best_l[1]:.3f})")

    def make_ridge():
        return make_pipeline(StandardScaler(), Ridge(alpha=chosen["ridge"]["alpha"]))

    def make_lgb(n):
        return lgb.LGBMRegressor(n_estimators=n, learning_rate=0.04, num_leaves=chosen["lightgbm"]["num_leaves"], min_child_samples=20, subsample=0.8, subsample_freq=1,
                                 colsample_bytree=0.8, reg_lambda=1.0, objective="regression", random_state=SEED, n_jobs=1, verbose=-1, deterministic=True, force_row_wise=True)

    # Refit on train + validation, score on test (once)
    ridge = make_ridge().fit(Xall[trval], df.loc[trval, "y"])
    gbm = make_lgb(max(int(chosen["lightgbm"]["n_estimators"] * 1.15), 20)).fit(Xall[trval], df.loc[trval, "y"])
    test_pred = {
        "seasonal_naive": df.loc[part["test"], "lag_7"].to_numpy(),
        "ridge": np.clip(ridge.predict(X["test"]), 0, None),
        "lightgbm": np.clip(gbm.predict(X["test"]), 0, None),
    }
    res = {m: metrics(fr["test"], p) for m, p in test_pred.items()}
    # How often does each model beat the baseline on an individual zone-day?
    zday = {m: pd.DataFrame({"day": fr["test"]["day"].to_numpy(), "y": y["test"], "p": p}).groupby("day").sum() for m, p in test_pred.items()}
    n_days = len(zday["seasonal_naive"])
    for m in MODELS:
        res[m]["days_better_than_baseline"] = int(((zday[m]["p"] - zday[m]["y"]).abs() < (zday["seasonal_naive"]["p"] - zday["seasonal_naive"]["y"]).abs()).sum()) if m != "seasonal_naive" else 0
        res[m]["test_days"] = n_days

    importances: dict[str, dict[str, float]] = {}
    coef = np.abs(ridge[-1].coef_)
    importances["ridge"] = dict(zip(feats, (100 * coef / coef.sum()).tolist()))
    gain = gbm.booster_.feature_importance(importance_type="gain").astype(float)
    importances["lightgbm"] = dict(zip(feats, (100 * gain / max(gain.sum(), 1e-9)).tolist()))

    eval_rows = []
    for m in MODELS:
        z = zday[m]
        for day, row in z.iterrows():
            eval_rows.append((day.date(), m, float(row["y"]), float(max(row["p"], 0))))
    return {"metrics": res, "params": chosen, "importances": importances, "eval_rows": eval_rows, "features": feats, "final_models": (ridge, gbm, make_ridge, make_lgb)}


def forecast_next(df: pd.DataFrame, kinds: list[str], fit: dict, last: pd.Timestamp) -> list[tuple[int, object, str, float]]:
    """Refit on ALL labelled history (train + validation + test) with the chosen settings and predict the day after `last`."""
    Xall, _ = design(df, kinds)
    labelled = df["y"].notna() & Xall.notna().all(axis=1)
    tomorrow = df["day"] == last + pd.Timedelta(days=1)
    ridge = fit["final_models"][2]().fit(Xall[labelled], df.loc[labelled, "y"])
    gbm = fit["final_models"][3](max(int(fit["params"]["lightgbm"]["n_estimators"] * 1.15), 20)).fit(Xall[labelled], df.loc[labelled, "y"])
    rows = []
    sub = df[tomorrow]
    preds = {"seasonal_naive": sub["lag_7"].to_numpy(), "ridge": np.clip(ridge.predict(Xall[tomorrow]), 0, None), "lightgbm": np.clip(gbm.predict(Xall[tomorrow]), 0, None)}
    for m, p in preds.items():
        for est, day, v in zip(sub["est"], sub["day"], p):
            rows.append((int(est), day.date(), m, round(float(max(v, 0)), 2)))
    return rows


# ---------------------------------------------------------------- orchestration

def run(conn: psycopg.Connection, val_days: int = 28, test_days: int = 28, log=print) -> int:
    import lightgbm, sklearn
    daily, est, parents, events, last = load_history(conn)
    log(f"History: {daily['day'].min().date()} .. {last.date()} ({(last - daily['day'].min()).days + 1} days, {daily['est'].nunique()} establishments)")
    panel = add_lag_features(build_panel(daily, est, parents, events, last))
    kinds = sorted(panel["kind"].unique())
    labelled = panel[(panel["day"] <= last)]
    Xtmp, _ = design(labelled, kinds)
    usable = labelled[Xtmp.notna().all(axis=1)]       # rows whose 28-day history exists
    windows = split_dates(sorted(usable["day"].unique()), val_days, test_days)
    for a, b in (("train", "val"), ("val", "test")):
        assert windows[a][-1] < windows[b][0], "windows must be chronological"
    data = usable[usable["day"].isin(sum(windows.values(), []))]
    log(f"Windows: train {windows['train'][0].date()}..{windows['train'][-1].date()} | val {windows['val'][0].date()}..{windows['val'][-1].date()} | test {windows['test'][0].date()}..{windows['test'][-1].date()}")
    fit = fit_predict(data, kinds, windows, log)
    preds = forecast_next(panel, kinds, fit, last)

    m = fit["metrics"]
    best = min(MODELS, key=lambda k: m[k]["rmse_zone_day"])
    counts = {k: int(data["day"].isin(v).sum()) for k, v in windows.items()}
    notes = ("Synthetic data: the seed encodes weekly seasonality, event effects and an establishment-level scale, which lag and calendar features can capture; "
             "real kitchens would be noisier. The test window is short; differences between close models are not statistically conclusive.")
    with conn.transaction():
        run_id = conn.execute(
            """INSERT INTO forecast_run (target, horizon_days, history_from, history_to, train_from, train_to, val_from, val_to, test_from, test_to,
                                         n_series, n_train, n_val, n_test, features, best_model, metrics, params, library_versions, notes)
               VALUES (%s,1,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING run_id""",
            (TARGET, daily["day"].min().date(), last.date(), windows["train"][0].date(), windows["train"][-1].date(), windows["val"][0].date(), windows["val"][-1].date(),
             windows["test"][0].date(), windows["test"][-1].date(), int(data["est"].nunique()), counts["train"], counts["val"], counts["test"], fit["features"], best,
             json.dumps(m), json.dumps(fit["params"]), json.dumps({"lightgbm": lightgbm.__version__, "scikit-learn": sklearn.__version__, "pandas": pd.__version__, "numpy": np.__version__}), notes),
        ).fetchone()[0]
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO forecast_eval_daily (run_id, eval_date, model, actual_kg, predicted_kg) VALUES (%s,%s,%s,%s,%s)", [(run_id, *r) for r in fit["eval_rows"]])
            cur.executemany("INSERT INTO forecast_prediction (run_id, establishment_id, target_date, model, predicted_kg) VALUES (%s,%s,%s,%s,%s)", [(run_id, *r) for r in preds])
            imp = [(run_id, mod, f, round(v, 4)) for mod, d in fit["importances"].items() for f, v in d.items()]
            cur.executemany("INSERT INTO forecast_importance (run_id, model, feature, importance) VALUES (%s,%s,%s,%s)", imp)
    log("\nTest-window results (lower is better):")
    log(f"  {'model':<16}{'MAE est-day':>12}{'RMSE est-day':>14}{'MAE zone-day':>14}{'RMSE zone-day':>15}{'WAPE %':>8}")
    for k in MODELS:
        r = m[k]
        log(f"  {k:<16}{r['mae_estab_day']:>12.3f}{r['rmse_estab_day']:>14.3f}{r['mae_zone_day']:>14.1f}{r['rmse_zone_day']:>15.1f}{r['wape_zone_pct']:>8.1f}")
    log(f"Best by zone-level RMSE: {best}. Stored as forecast_run #{run_id}; forecast for {(last + pd.Timedelta(days=1)).date()}: {len(preds) // 3} establishments x 3 models.")
    return run_id


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=None, help="PostgreSQL database (default: the one in .env)")
    ap.add_argument("--val-days", type=int, default=28)
    ap.add_argument("--test-days", type=int, default=28)
    a = ap.parse_args()
    with psycopg.connect(pg_dsn(a.db)) as conn:
        run(conn, a.val_days, a.test_days)


if __name__ == "__main__":
    main()

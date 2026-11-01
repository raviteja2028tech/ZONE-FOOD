# Waste forecasting (Part 4, requested explicitly)

Working machine-learning forecasts trained on ZoneFood's **real recorded history** (the synthetic seed plus anything entered through the application). Nothing on the dashboard is computed in the browser or typed by hand: `scripts/forecast.py` trains and scores the models, stores the run in PostgreSQL (migration 019), and the page `/forecast` reads those tables.

## Task

Predict, at the end of each day, **how many kilograms of food each establishment will waste the next day** (redistributed food is not waste and is excluded). The forecast for the zone is the sum over establishments.

## Models (all compared on the same held-out rows)

| Model | What it is | How it is tuned |
|---|---|---|
| Seasonal naive (baseline) | tomorrow = the same weekday one week earlier | nothing to tune; every other model must beat it |
| Ridge regression | standardised linear model | `alpha` in {0.1 … 10000} chosen on the validation window |
| LightGBM | gradient-boosted trees (L2 objective, MAE monitored) | `num_leaves` in {7, 15, 31} and the number of trees by early stopping on the validation window |

## Features

All history features are built from values **shifted by at least one day**, so row *t* never contains the day it predicts.

* History: lags 1, 2, 3, 7, 14 days (21 and 28 only feed the same-weekday average); 7-day mean and standard deviation; 28-day mean; momentum (7-day / 28-day); same-weekday mean of the last four weeks.
* Calendar and schedule (known in advance): weekday (one-hot), weekend flag, day of month, event impact and flags for exam periods, festivals, vacations, public holidays and local events that apply to the establishment's zone or any ancestor zone.
* Static: log capacity, establishment kind (one-hot).

## Leakage prevention

1. Lag and rolling features are shifted (`shift(1)` before every rolling window). `tests/test_forecast.py::test_features_never_see_the_row_they_predict` overwrites every value from a chosen day onward and asserts that **no** feature on or before that day changes (and that the next day *does* change, proving the test can detect a leak).
2. **Chronological split** over the usable days: train, then validation (28 days), then test (28 days); no shuffling, no overlap (tested).
3. Scaling, `alpha`, `num_leaves` and the number of trees are fitted or chosen **without** the test window; the test window is scored once, by models refitted on train + validation.
4. Only after scoring are the models refitted on all history to produce the next-day forecast (the usual production step; the reported error is from the earlier, leak-free fit).
5. The last day is used only if it looks complete (at least half the median event count of the previous four weeks); a half-recorded day would otherwise teach the models noise (tested).

## Metrics

MAE and RMSE at two levels: per establishment-day (what a kitchen sees) and for the zone total per day (what the administrator plans with), plus zone WAPE (total absolute error / total waste) and on how many individual test days each model beat the baseline.

## Results of the stored run (working database, 2026-11-01)

History 3 Jun - 30 Oct 2026 (150 days, 56 establishments). Train 1 Jul - 4 Sep, validation 5 Sep - 2 Oct, test 3 Oct - 30 Oct (28 days, 1,568 establishment-days).

| Model | MAE est-day | RMSE est-day | MAE zone-day | RMSE zone-day | zone WAPE | days beating baseline |
|---|---|---|---|---|---|---|
| Seasonal naive | 18.86 | 39.91 | 336.0 | 418.3 | 15.7 % | - |
| Ridge | 16.89 | 34.50 | **241.0** | **291.9** | **11.3 %** | 18 / 28 |
| LightGBM | **15.99** | **33.09** | 253.4 | 332.2 | 11.8 % | 20 / 28 |

(kg; lower is better.) **Reading:** both learned models beat the weekly baseline (zone MAE 28 % lower for Ridge). They rank differently by level: LightGBM is best per kitchen, Ridge on the zone total, where the individual errors partly cancel. The stored "best model" is chosen by zone-level RMSE, a rule fixed in advance. The page shows the actual-vs-predicted chart of these 28 days and the feature importances (LightGBM: the 7-day average carries ≈ 44 % of the gain, yesterday ≈ 18 %, the same-weekday average ≈ 12 %). Re-running the script on unchanged data gives identical numbers (fixed seed, single-threaded LightGBM).

## Honest limitations

* **Synthetic data.** The generator builds weekly seasonality, event effects and per-establishment scale into the series, which lags and calendar features recover easily. Real kitchens are noisier; do not read these errors as expected real-world accuracy.
* **Short history.** About 150 days and a 28-day test window: a yearly seasonal pattern cannot be learned, and the difference between the two learned models is within what a different 28-day window could reverse.
* **One-day horizon.** Multi-day forecasts would need recursive prediction or a direct model per horizon; not built.
* **Training is offline.** The page shows the latest stored run; retrain with `python scripts/forecast.py` after new data arrives (the page states the training time and data window so staleness is visible).
* **Forecasts are for planning**, not for automatic decisions.

## Commands

```powershell
python scripts/forecast.py                    # train, evaluate, store (about 20 s)
python scripts/forecast.py --db <name>        # another database
python -m pytest tests/test_forecast.py -q    # leakage, split, metrics and stored-run tests
npm run test:integration                      # includes /api/forecast tests (trains on the disposable database)
```

## Tables (migration 019)

`forecast_run` (windows, counts, features, metrics, parameters, library versions), `forecast_eval_daily` (actual vs predicted per test day and model), `forecast_prediction` (next-day forecast per establishment and model), `forecast_importance`. Documented in `DATA_DICTIONARY.md`.

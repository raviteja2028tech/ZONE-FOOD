-- title: Forecast accuracy per model (MAE, RMSE, MAPE) on the held-out test days
-- concepts: JOIN of forecast_run and forecast_eval_daily, scalar subquery for the latest run, AVG / ABS / SQRT aggregates, NULLIF guard
-- purpose: The plan's original Query 21 (forecast accuracy per model), now answerable because the forecasting models exist. Compares the seasonal-naive baseline, Ridge and LightGBM on zone-level daily waste for the test window that no model saw during training or tuning.
-- mode: select
-- reading: One row per model for the latest forecast run; lower mae_kg / rmse_kg / mape_pct is better. The first row is the best by MAE. The same numbers drive the Forecast page (which ranks by RMSE, so the two orderings can differ when errors are unevenly spread).
SELECT r.run_id,
       e.model,
       COUNT(*)                                                              AS test_days,
       ROUND(AVG(ABS(e.predicted_kg - e.actual_kg)), 1)                      AS mae_kg,
       ROUND(SQRT(AVG((e.predicted_kg - e.actual_kg) ^ 2))::numeric, 1)      AS rmse_kg,
       ROUND(100 * AVG(ABS(e.predicted_kg - e.actual_kg) / NULLIF(e.actual_kg, 0)), 1) AS mape_pct
  FROM forecast_eval_daily e
  JOIN forecast_run r ON r.run_id = e.run_id
 WHERE r.run_id = (SELECT MAX(run_id) FROM forecast_run)
 GROUP BY r.run_id, e.model
 ORDER BY mae_kg;

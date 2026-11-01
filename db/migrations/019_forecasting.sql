-- 019: forecasting results (Part 4, requested explicitly). The models are trained OUTSIDE the database by
-- scripts/forecast.py from the real waste_event history; this migration only stores what each run produced so the
-- application can display it and every number on the dashboard is traceable to a run.

CREATE TABLE forecast_run (
  run_id          SERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  target          VARCHAR(60) NOT NULL,                 -- e.g. 'daily_waste_kg_per_establishment'
  horizon_days    SMALLINT NOT NULL CHECK (horizon_days >= 1),
  history_from    DATE NOT NULL,
  history_to      DATE NOT NULL,
  train_from      DATE NOT NULL, train_to DATE NOT NULL,
  val_from        DATE NOT NULL, val_to   DATE NOT NULL,
  test_from       DATE NOT NULL, test_to  DATE NOT NULL,
  n_series        INT NOT NULL,                         -- establishments modelled
  n_train         INT NOT NULL, n_val INT NOT NULL, n_test INT NOT NULL,
  features        TEXT[] NOT NULL,
  best_model      VARCHAR(30) NOT NULL,                 -- lowest test RMSE at zone level
  metrics         JSONB NOT NULL,                       -- per model: MAE/RMSE (establishment-day and zone-day), WAPE, days beaten
  params          JSONB NOT NULL,                       -- hyper-parameters chosen on the validation window only
  library_versions JSONB NOT NULL,
  notes           TEXT,
  CONSTRAINT ck_run_chronology CHECK (train_to < val_from AND val_to < test_from AND test_to <= history_to)
);

CREATE TABLE forecast_eval_daily (                      -- actual vs predicted, zone total per test day
  run_id       INT NOT NULL REFERENCES forecast_run(run_id) ON DELETE CASCADE,
  eval_date    DATE NOT NULL,
  model        VARCHAR(30) NOT NULL,
  actual_kg    NUMERIC(12,2) NOT NULL,
  predicted_kg NUMERIC(12,2) NOT NULL CHECK (predicted_kg >= 0),
  PRIMARY KEY (run_id, eval_date, model)
);

CREATE TABLE forecast_prediction (                      -- next-day forecast per establishment
  run_id           INT NOT NULL REFERENCES forecast_run(run_id) ON DELETE CASCADE,
  establishment_id INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  target_date      DATE NOT NULL,
  model            VARCHAR(30) NOT NULL,
  predicted_kg     NUMERIC(10,2) NOT NULL CHECK (predicted_kg >= 0),
  PRIMARY KEY (run_id, establishment_id, target_date, model)
);

CREATE TABLE forecast_importance (
  run_id     INT NOT NULL REFERENCES forecast_run(run_id) ON DELETE CASCADE,
  model      VARCHAR(30) NOT NULL,
  feature    VARCHAR(60) NOT NULL,
  importance NUMERIC(8,4) NOT NULL,                     -- share of total, percent
  PRIMARY KEY (run_id, model, feature)
);

CREATE INDEX idx_forecast_pred_estab ON forecast_prediction (establishment_id, target_date);

COMMENT ON TABLE forecast_run IS 'One training run of the waste forecasting models (seasonal naive, ridge, LightGBM): data window, chronological split, metrics, parameters.';
COMMENT ON TABLE forecast_eval_daily IS 'Held-out test period: zone-level actual vs predicted waste per day and model (feeds the actual-vs-predicted chart).';
COMMENT ON TABLE forecast_prediction IS 'Next-day waste forecast per establishment from models refitted on all history.';
COMMENT ON TABLE forecast_importance IS 'Normalised feature importance per model (ridge: standardised |coefficient|, LightGBM: gain).';

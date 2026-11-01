-- 007: locality events (M:N with zone) and the audit trail table.
-- forecast_model / demand_forecast from the PDF are deliberately NOT created here: forecasting
-- is Part 4 (optional) per WORKFLOW.md. They can be added later as a new migration.
CREATE TABLE locality_event (
  event_id        SERIAL PRIMARY KEY,
  event_name      VARCHAR(120) NOT NULL,
  -- PDF text is clipped after 'LOCAL_EVEN'; LOCAL_EVENT is the documented completion.
  event_type      VARCHAR(40) CHECK (event_type IN
                    ('FESTIVAL','PUBLIC_HOLIDAY','EXAM_PERIOD','VACATION','LOCAL_EVENT')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  expected_impact SMALLINT CHECK (expected_impact BETWEEN -2 AND 2),   -- demand shift
  CONSTRAINT ck_event_dates CHECK (end_date >= start_date)
);

CREATE TABLE zone_event (                            -- M:N zone <-> locality_event
  zone_id  INT NOT NULL REFERENCES zone(zone_id) ON DELETE CASCADE,
  event_id INT NOT NULL REFERENCES locality_event(event_id) ON DELETE CASCADE,
  PRIMARY KEY (zone_id, event_id)
);

CREATE TABLE audit_log (                             -- populated by triggers (added in Part 3)
  audit_id   BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(60) NOT NULL,
  record_pk  VARCHAR(60) NOT NULL,
  action     CHAR(1) NOT NULL CHECK (action IN ('I','U','D')),
  changed_by INT REFERENCES app_user(user_id),
  old_row    JSONB,
  new_row    JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

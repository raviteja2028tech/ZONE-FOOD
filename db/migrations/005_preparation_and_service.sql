-- 005: dishes, service sessions, preparation batches and consumption.
CREATE TABLE dish (
  dish_id            SERIAL PRIMARY KEY,
  establishment_id   INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  dish_name          VARCHAR(120) NOT NULL,
  standard_portion_g NUMERIC(7,2) NOT NULL CHECK (standard_portion_g > 0),
  is_vegetarian      BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_dish UNIQUE (establishment_id, dish_name)
);

CREATE TABLE dish_ingredient (                       -- resolves M:N dish <-> food_item
  dish_id         INT NOT NULL REFERENCES dish(dish_id) ON DELETE CASCADE,
  food_id         INT NOT NULL REFERENCES food_item(food_id) ON DELETE RESTRICT,
  qty_per_portion NUMERIC(8,4) NOT NULL CHECK (qty_per_portion > 0),
  PRIMARY KEY (dish_id, food_id)
);

CREATE TABLE service_session (
  session_id         BIGSERIAL PRIMARY KEY,
  establishment_id   INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  service_date       DATE NOT NULL,
  slot               meal_slot NOT NULL,
  expected_headcount INT NOT NULL CHECK (expected_headcount >= 0),
  actual_headcount   INT CHECK (actual_headcount >= 0),
  is_closed          BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at          TIMESTAMPTZ,
  CONSTRAINT uq_session UNIQUE (establishment_id, service_date, slot),
  CONSTRAINT ck_closed_has_actuals CHECK (NOT is_closed OR actual_headcount IS NOT NULL)
);

CREATE TABLE preparation_batch (
  batch_id          BIGSERIAL PRIMARY KEY,
  session_id        BIGINT NOT NULL REFERENCES service_session(session_id) ON DELETE CASCADE,
  dish_id           INT NOT NULL REFERENCES dish(dish_id),
  prepared_qty_kg   NUMERIC(10,3) NOT NULL CHECK (prepared_qty_kg > 0),
  prepared_portions INT NOT NULL CHECK (prepared_portions > 0),
  prep_cost         NUMERIC(10,2) CHECK (prep_cost >= 0),
  prepared_at       TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_batch UNIQUE (session_id, dish_id)
);

CREATE TABLE consumption_record (
  batch_id        BIGINT PRIMARY KEY REFERENCES preparation_batch(batch_id) ON DELETE CASCADE,
  served_qty_kg   NUMERIC(10,3) NOT NULL CHECK (served_qty_kg >= 0),
  leftover_qty_kg NUMERIC(10,3) NOT NULL CHECK (leftover_qty_kg >= 0),
  plate_waste_kg  NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (plate_waste_kg >= 0),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by     INT REFERENCES app_user(user_id)
  -- served + leftover <= prepared spans two tables: enforced by trigger (migration 009)
);

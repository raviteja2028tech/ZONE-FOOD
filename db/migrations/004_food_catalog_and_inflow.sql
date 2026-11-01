-- 004: food reference data and inflow (procurement -> inventory lots).
CREATE TABLE food_category (
  food_category_id         SERIAL PRIMARY KEY,
  category_name            VARCHAR(60) NOT NULL UNIQUE,
  is_perishable            BOOLEAN NOT NULL DEFAULT TRUE,
  default_shelf_life_hours INT NOT NULL CHECK (default_shelf_life_hours > 0)
);

CREATE TABLE emission_factor (
  food_category_id    INT PRIMARY KEY REFERENCES food_category(food_category_id),
  kg_co2e_per_kg      NUMERIC(6,3) NOT NULL CHECK (kg_co2e_per_kg >= 0),
  litres_water_per_kg NUMERIC(8,2) CHECK (litres_water_per_kg >= 0),
  source_citation     VARCHAR(200)
);

CREATE TABLE food_item (
  food_id           SERIAL PRIMARY KEY,
  food_category_id  INT NOT NULL REFERENCES food_category(food_category_id),
  canonical_name    VARCHAR(120) NOT NULL UNIQUE,
  description       TEXT,
  base_unit         VARCHAR(10) NOT NULL DEFAULT 'kg' CHECK (base_unit IN ('kg','litre','unit')),
  avg_cost_per_unit NUMERIC(10,2) NOT NULL CHECK (avg_cost_per_unit >= 0),
  is_edible_as_is   BOOLEAN NOT NULL DEFAULT TRUE,
  name_embedding    vector(384),                     -- pgvector: name normalisation (filled in Part 2)
  search_doc        tsvector GENERATED ALWAYS AS
                      (to_tsvector('english', canonical_name || ' ' || COALESCE(description,''))) STORED
);

CREATE TABLE supplier (
  supplier_id   SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  zone_id       INT REFERENCES zone(zone_id),
  contact_phone VARCHAR(15),
  supplier_type VARCHAR(40) CHECK (supplier_type IN ('WHOLESALE','FARM','DISTRIBUTOR','RETAIL','OTHER'))
);

CREATE TABLE procurement (
  procurement_id   BIGSERIAL PRIMARY KEY,
  establishment_id INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  supplier_id      INT REFERENCES supplier(supplier_id) ON DELETE SET NULL,
  invoice_no       VARCHAR(50),
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_cost       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  recorded_by      INT REFERENCES app_user(user_id),
  CONSTRAINT uq_invoice UNIQUE (establishment_id, supplier_id, invoice_no)
);

CREATE TABLE procurement_line (
  line_id        BIGSERIAL PRIMARY KEY,
  procurement_id BIGINT NOT NULL REFERENCES procurement(procurement_id) ON DELETE CASCADE,
  food_id        INT NOT NULL REFERENCES food_item(food_id),
  quantity       NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  unit_cost      NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0),
  expiry_date    DATE,
  CONSTRAINT uq_proc_line UNIQUE (procurement_id, food_id)
);

CREATE TABLE inventory_lot (
  lot_id           BIGSERIAL PRIMARY KEY,
  establishment_id INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  food_id          INT NOT NULL REFERENCES food_item(food_id),
  source_line_id   BIGINT REFERENCES procurement_line(line_id) ON DELETE SET NULL,
  received_qty     NUMERIC(10,3) NOT NULL CHECK (received_qty > 0),
  remaining_qty    NUMERIC(10,3) NOT NULL CHECK (remaining_qty >= 0),
  unit_cost        NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0),
  received_at      TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_lot_balance CHECK (remaining_qty <= received_qty),
  CONSTRAINT ck_lot_dates   CHECK (expires_at > received_at)
);

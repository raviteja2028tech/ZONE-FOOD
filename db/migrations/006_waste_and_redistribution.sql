-- 006: waste (partitioned fact table) and surplus redistribution.
CREATE TABLE waste_reason (
  reason_id      SERIAL PRIMARY KEY,
  reason_code    VARCHAR(40) NOT NULL UNIQUE,        -- OVER_PREPARATION, LOW_TURNOUT, SPOILAGE ...
  description    VARCHAR(200) NOT NULL,
  is_preventable BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE disposal_route (
  route_id     SERIAL PRIMARY KEY,
  route_name   VARCHAR(40) NOT NULL UNIQUE,          -- LANDFILL, COMPOST, BIOGAS, ANIMAL_FEED, DONATION
  is_diversion BOOLEAN NOT NULL,                     -- anything but landfill = diverted
  cost_per_kg  NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (cost_per_kg >= 0)
);

-- Fact table: narrow, append-mostly, range-partitioned by month on occurred_on.
-- The partition key must be part of the primary key.
CREATE TABLE waste_event (
  waste_id         BIGSERIAL,
  establishment_id INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  food_id          INT REFERENCES food_item(food_id),
  session_id       BIGINT REFERENCES service_session(session_id) ON DELETE SET NULL,
  lot_id           BIGINT REFERENCES inventory_lot(lot_id) ON DELETE SET NULL,
  reason_id        INT NOT NULL REFERENCES waste_reason(reason_id),
  route_id         INT NOT NULL REFERENCES disposal_route(route_id),
  stage            waste_stage NOT NULL,
  quantity_kg      NUMERIC(10,3) NOT NULL CHECK (quantity_kg > 0),
  was_edible       BOOLEAN NOT NULL DEFAULT TRUE,
  cost_estimate    NUMERIC(10,2) CHECK (cost_estimate >= 0),   -- deliberate denormalisation (derived, stored)
  co2e_estimate    NUMERIC(10,3) CHECK (co2e_estimate >= 0),
  notes            TEXT,
  notes_embedding  vector(384),                      -- pgvector: root-cause clustering (filled in Part 2)
  occurred_on      DATE NOT NULL,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_doc_id    VARCHAR(30),                      -- Mongo _id of the raw submission this row came from
  PRIMARY KEY (waste_id, occurred_on),
  CONSTRAINT ck_waste_not_future CHECK (occurred_on <= CURRENT_DATE)
) PARTITION BY RANGE (occurred_on);

-- Monthly partitions 2025-10 .. 2027-12, plus a DEFAULT partition for anything outside that range.
DO $$
DECLARE m DATE := DATE '2025-10-01';
BEGIN
  WHILE m < DATE '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE %I PARTITION OF waste_event FOR VALUES FROM (%L) TO (%L)',
                   'waste_event_' || to_char(m, 'YYYY_MM'), m, (m + INTERVAL '1 month')::date);
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;
CREATE TABLE waste_event_default PARTITION OF waste_event DEFAULT;

CREATE TABLE surplus_listing (
  listing_id       BIGSERIAL PRIMARY KEY,
  establishment_id INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  food_id          INT REFERENCES food_item(food_id),
  session_id       BIGINT REFERENCES service_session(session_id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  desc_embedding   vector(384),                      -- pgvector: matching (filled in Part 2)
  offered_qty_kg   NUMERIC(10,3) NOT NULL CHECK (offered_qty_kg > 0),
  claimed_qty_kg   NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (claimed_qty_kg >= 0),
  is_cooked        BOOLEAN NOT NULL DEFAULT TRUE,
  is_vegetarian    BOOLEAN NOT NULL DEFAULT TRUE,
  available_from   TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  status           listing_status NOT NULL DEFAULT 'OPEN',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_listing_balance CHECK (claimed_qty_kg <= offered_qty_kg),
  CONSTRAINT ck_listing_window  CHECK (expires_at > available_from)
);

CREATE TABLE redistribution_claim (
  claim_id       BIGSERIAL PRIMARY KEY,
  listing_id     BIGINT NOT NULL REFERENCES surplus_listing(listing_id) ON DELETE CASCADE,
  recipient_id   INT NOT NULL REFERENCES recipient_org(recipient_id) ON DELETE CASCADE,
  claimed_qty_kg NUMERIC(10,3) NOT NULL CHECK (claimed_qty_kg > 0),
  match_score    NUMERIC(5,4) CHECK (match_score BETWEEN 0 AND 1),  -- cosine similarity at match time
  status         claim_status NOT NULL DEFAULT 'REQUESTED',
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at   TIMESTAMPTZ,
  CONSTRAINT uq_claim UNIQUE (listing_id, recipient_id),
  CONSTRAINT ck_collected CHECK (status <> 'COLLECTED' OR collected_at IS NOT NULL)
);

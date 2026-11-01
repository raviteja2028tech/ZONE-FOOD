-- 012: tables the Part 2 application needs on top of the Part 1 schema.
-- Master Plan s6.4 / B2.8 (food_alias cache, ETL run log). Additive only: no Part 1 table is altered.

-- Cache of raw (messy) food names -> canonical food_item, written by the ETL name-resolution cascade
-- (exact -> alias -> trigram -> vector). UNRESOLVED rows are the human-review queue.
CREATE TABLE food_alias (
  alias_id       SERIAL PRIMARY KEY,
  raw_name_norm  VARCHAR(150) NOT NULL UNIQUE,         -- lower-cased, punctuation-stripped raw name
  food_id        INT REFERENCES food_item(food_id) ON DELETE CASCADE,
  confidence     NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
  method         VARCHAR(10) NOT NULL CHECK (method IN ('EXACT','TRIGRAM','VECTOR','MANUAL','NONE')),
  status         VARCHAR(12) NOT NULL CHECK (status IN ('RESOLVED','UNRESOLVED')),
  hit_count      INT NOT NULL DEFAULT 1 CHECK (hit_count >= 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_alias_resolution CHECK ((status = 'RESOLVED' AND food_id IS NOT NULL) OR status = 'UNRESOLVED')
);
CREATE INDEX idx_alias_food ON food_alias (food_id) WHERE food_id IS NOT NULL;
CREATE INDEX idx_alias_unresolved ON food_alias (last_seen_at DESC) WHERE status = 'UNRESOLVED';

-- One row per ETL invocation (manual or scheduled): the audit trail behind the admin ETL page.
CREATE TABLE etl_run_log (
  run_id        BIGSERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  triggered_by  INT REFERENCES app_user(user_id) ON DELETE SET NULL,
  mode          VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (mode IN ('PENDING','RETRY')),
  docs_seen     INT NOT NULL DEFAULT 0 CHECK (docs_seen >= 0),
  docs_synced   INT NOT NULL DEFAULT 0 CHECK (docs_synced >= 0),
  docs_skipped  INT NOT NULL DEFAULT 0 CHECK (docs_skipped >= 0),   -- already in PostgreSQL (idempotent re-sync)
  docs_failed   INT NOT NULL DEFAULT 0 CHECK (docs_failed >= 0),
  rows_written  INT NOT NULL DEFAULT 0 CHECK (rows_written >= 0)
);
CREATE INDEX idx_etl_run_started ON etl_run_log (started_at DESC);

-- Idempotency guard for the ETL: rows written from one Mongo document carry its _id. The partitioned
-- waste_event cannot hold a unique index without the partition key, so this is a plain lookup index.
CREATE INDEX idx_waste_source_doc ON waste_event (source_doc_id) WHERE source_doc_id IS NOT NULL;

COMMENT ON TABLE food_alias IS 'ETL name-resolution cache: raw food name -> food_item (or UNRESOLVED review queue).';
COMMENT ON TABLE etl_run_log IS 'One row per Mongo->PostgreSQL ETL run, with counts.';

-- DEMONSTRATION (safe): the DDL lifecycle - CREATE, ALTER, DROP - on a scratch table, then rolled back.
-- Not a migration and never run at start-up. PostgreSQL DDL is transactional, so everything below disappears at ROLLBACK.
-- Run:  docker exec -i zonefood-postgres psql -U zonefood -d zonefood < db/demos/01_ddl_lifecycle.sql
-- The REAL ALTER/DROP that ZoneFood keeps is migration 014_alter_drop_ddl.sql (provenance column + unused index).

BEGIN;

-- CREATE: a table with a primary key, NOT NULL, a CHECK and a foreign key
CREATE TABLE demo_storage_audit (
  audit_id         SERIAL PRIMARY KEY,
  establishment_id INT NOT NULL REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  note             TEXT NOT NULL,
  temperature_c    NUMERIC(4,1) CHECK (temperature_c BETWEEN -30 AND 60)
);
INSERT INTO demo_storage_audit (establishment_id, note, temperature_c) VALUES (1, 'walk-in fridge reading', 4.5);

-- ALTER: add a column with a default (no rewrite), add a constraint, change a type, rename, add an index
ALTER TABLE demo_storage_audit ADD COLUMN inspected_on DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE demo_storage_audit ADD CONSTRAINT ck_demo_note_len CHECK (length(note) >= 5);
ALTER TABLE demo_storage_audit ALTER COLUMN note TYPE VARCHAR(200);
ALTER TABLE demo_storage_audit RENAME COLUMN temperature_c TO reading_c;
CREATE INDEX idx_demo_audit_est ON demo_storage_audit (establishment_id, inspected_on DESC);

-- the table now has the new shape
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'demo_storage_audit' ORDER BY ordinal_position;

-- the new constraint is enforced (savepoint so the demo can continue after the expected failure)
SAVEPOINT before_bad_insert;
DO $$ BEGIN
  BEGIN
    INSERT INTO demo_storage_audit (establishment_id, note, reading_c) VALUES (1, 'bad', 4);
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'refused as expected: %', SQLERRM;
  END;
END $$;
ROLLBACK TO SAVEPOINT before_bad_insert;

-- DROP: remove an index, a column, the constraint, then the table
DROP INDEX idx_demo_audit_est;
ALTER TABLE demo_storage_audit DROP CONSTRAINT ck_demo_note_len;
ALTER TABLE demo_storage_audit DROP COLUMN inspected_on;
DROP TABLE demo_storage_audit;

SELECT to_regclass('demo_storage_audit') IS NULL AS table_is_gone;

ROLLBACK;   -- nothing above was ever committed

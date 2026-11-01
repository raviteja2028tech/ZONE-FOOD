-- 017: triggers T3-T6 (T1 consumption balance and T2 cost/CO2e/provenance already exist).
--
-- Bulk-load switch: the Part 1 seed writes a finished, internally consistent history with COPY. Inside that
-- transaction it sets  SET LOCAL zonefood.bulk_load = 'on'  so T3 (stock) and T4 (audit) stay out of the way and
-- the already-final inventory quantities are not deducted a second time. Application sessions never set it.

-- T3: INVENTORY LEDGER. A waste_event that names a stock lot deducts exactly that quantity from the lot - once -
-- whichever way the row was written (UI, API, ETL, SQL console). Correcting or deleting the event moves the stock back.
CREATE OR REPLACE FUNCTION trg_lot_ledger() RETURNS TRIGGER AS $$
DECLARE v_lot RECORD;
BEGIN
  IF current_setting('zonefood.bulk_load', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- give back the old quantity (UPDATE of quantity/lot, or DELETE)
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.lot_id IS NOT NULL THEN
    UPDATE inventory_lot SET remaining_qty = LEAST(received_qty, remaining_qty + OLD.quantity_kg)
     WHERE lot_id = OLD.lot_id;
  END IF;

  -- take the new quantity (INSERT, or UPDATE)
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.lot_id IS NOT NULL THEN
    SELECT il.establishment_id, il.food_id, il.remaining_qty INTO v_lot
      FROM inventory_lot il WHERE il.lot_id = NEW.lot_id FOR UPDATE;       -- serialises concurrent write-offs
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock lot % does not exist', NEW.lot_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_lot.establishment_id <> NEW.establishment_id THEN
      RAISE EXCEPTION 'Stock lot % belongs to another establishment', NEW.lot_id USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.food_id IS NOT NULL AND NEW.food_id <> v_lot.food_id THEN
      RAISE EXCEPTION 'The food item does not match stock lot %', NEW.lot_id USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.quantity_kg > v_lot.remaining_qty THEN
      RAISE EXCEPTION 'Waste of % kg exceeds the % kg remaining in lot %',
        NEW.quantity_kg, v_lot.remaining_qty, NEW.lot_id USING ERRCODE = 'check_violation';
    END IF;
    UPDATE inventory_lot SET remaining_qty = remaining_qty - NEW.quantity_kg WHERE lot_id = NEW.lot_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

-- BEFORE, not AFTER - this is a deadlock fix found by the concurrency tests. The foreign key on waste_event.lot_id is
-- checked by an AFTER trigger that takes a shared lock (FOR KEY SHARE) on the lot. If this trigger also ran AFTER, two
-- concurrent write-offs would each hold that shared lock and then both ask for FOR UPDATE: a lock-upgrade deadlock.
-- Running BEFORE takes the exclusive lock first, so competing writers queue behind each other instead.
CREATE TRIGGER tr_lot_ledger_ins BEFORE INSERT ON waste_event
  FOR EACH ROW EXECUTE FUNCTION trg_lot_ledger();
CREATE TRIGGER tr_lot_ledger_upd BEFORE UPDATE OF quantity_kg, lot_id ON waste_event
  FOR EACH ROW EXECUTE FUNCTION trg_lot_ledger();
CREATE TRIGGER tr_lot_ledger_del BEFORE DELETE ON waste_event
  FOR EACH ROW EXECUTE FUNCTION trg_lot_ledger();

-- T4: AUDIT TRAIL. Who changed which row, with before/after images (embeddings stripped - they are large noise).
-- The application runs  SELECT set_config('app.current_user_id', '<id>', true)  at the start of each write
-- transaction, so rows are attributed to real users without threading the id through every statement.
CREATE OR REPLACE FUNCTION trg_audit() RETURNS TRIGGER AS $$
DECLARE v_old JSONB; v_new JSONB; v_pk TEXT := TG_ARGV[0];
BEGIN
  IF current_setting('zonefood.bulk_load', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'desc_embedding' - 'need_embedding' END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'desc_embedding' - 'need_embedding' END;
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN
    RETURN NEW;                                                    -- nothing observable changed (e.g. embedding refresh)
  END IF;
  INSERT INTO audit_log (table_name, record_pk, action, changed_by, old_row, new_row)
  VALUES (TG_TABLE_NAME, COALESCE(v_new ->> v_pk, v_old ->> v_pk), LEFT(TG_OP, 1),
          NULLIF(current_setting('app.current_user_id', true), '')::INT, v_old, v_new);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tr_audit_listing AFTER INSERT OR UPDATE OR DELETE ON surplus_listing
  FOR EACH ROW EXECUTE FUNCTION trg_audit('listing_id');
CREATE TRIGGER tr_audit_claim AFTER INSERT OR UPDATE OR DELETE ON redistribution_claim
  FOR EACH ROW EXECUTE FUNCTION trg_audit('claim_id');
CREATE TRIGGER tr_audit_establishment AFTER INSERT OR UPDATE OR DELETE ON establishment
  FOR EACH ROW EXECUTE FUNCTION trg_audit('establishment_id');
CREATE TRIGGER tr_audit_recipient AFTER INSERT OR UPDATE OR DELETE ON recipient_org
  FOR EACH ROW EXECUTE FUNCTION trg_audit('recipient_id');

-- T5: VALID STATE CHANGES for claims, enforced by the database whoever issues the UPDATE.
--   REQUESTED -> APPROVED | REJECTED ;  APPROVED -> COLLECTED | NO_SHOW ;  everything else is terminal.
--   The identity of a claim (listing, recipient, quantity) is immutable.
CREATE OR REPLACE FUNCTION trg_claim_guard() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.listing_id <> OLD.listing_id OR NEW.recipient_id <> OLD.recipient_id OR NEW.claimed_qty_kg <> OLD.claimed_qty_kg THEN
    RAISE EXCEPTION 'A claim''s listing, recipient and quantity cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED', 'REJECTED'))
    OR (OLD.status = 'APPROVED'  AND NEW.status IN ('COLLECTED', 'NO_SHOW'))) THEN
    RAISE EXCEPTION 'Illegal claim transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tr_claim_guard BEFORE UPDATE ON redistribution_claim
  FOR EACH ROW EXECUTE FUNCTION trg_claim_guard();

-- T6: a cancelled listing can never be resurrected.
CREATE OR REPLACE FUNCTION trg_listing_guard() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'A cancelled listing cannot be reopened' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tr_listing_guard BEFORE UPDATE OF status ON surplus_listing
  FOR EACH ROW EXECUTE FUNCTION trg_listing_guard();

COMMENT ON FUNCTION trg_lot_ledger() IS 'T3: keeps inventory_lot.remaining_qty equal to received minus written-off, exactly once.';
COMMENT ON FUNCTION trg_audit() IS 'T4: generic audit trail into audit_log (arg = primary-key column).';
COMMENT ON FUNCTION trg_claim_guard() IS 'T5: legal claim transitions only; claim identity is immutable.';
COMMENT ON FUNCTION trg_listing_guard() IS 'T6: cancelled listings stay cancelled.';

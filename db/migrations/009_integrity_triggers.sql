-- 009: integrity triggers for rules a CHECK constraint cannot express (Master Plan s5.4, T1 and T2).
-- T3 (lot deduction), T4 (audit), stored procedures and views are Part 3 (Phase 3.2).

-- T1: served + leftover may not exceed what was prepared; plate waste cannot exceed served.
CREATE OR REPLACE FUNCTION trg_validate_consumption() RETURNS TRIGGER AS $$
DECLARE v_prepared NUMERIC;
BEGIN
  SELECT prepared_qty_kg INTO v_prepared FROM preparation_batch WHERE batch_id = NEW.batch_id;
  IF NEW.served_qty_kg + NEW.leftover_qty_kg > v_prepared + 0.001 THEN
    RAISE EXCEPTION 'served (%) + leftover (%) exceeds prepared (%) for batch %',
      NEW.served_qty_kg, NEW.leftover_qty_kg, v_prepared, NEW.batch_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.plate_waste_kg > NEW.served_qty_kg THEN
    RAISE EXCEPTION 'plate waste (%) cannot exceed served quantity (%)',
      NEW.plate_waste_kg, NEW.served_qty_kg
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tr_consumption_balance
  BEFORE INSERT OR UPDATE ON consumption_record
  FOR EACH ROW EXECUTE FUNCTION trg_validate_consumption();

-- T2: derive cost and carbon from the food catalogue, so the application can never store
-- inconsistent economics. Default factor 2.5 kg CO2e/kg when a category has no emission_factor row.
CREATE OR REPLACE FUNCTION trg_enrich_waste() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.food_id IS NOT NULL THEN
    SELECT NEW.quantity_kg * fi.avg_cost_per_unit,
           NEW.quantity_kg * COALESCE(ef.kg_co2e_per_kg, 2.5)
      INTO NEW.cost_estimate, NEW.co2e_estimate
      FROM food_item fi
      LEFT JOIN emission_factor ef ON ef.food_category_id = fi.food_category_id
     WHERE fi.food_id = NEW.food_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tr_waste_enrich
  BEFORE INSERT ON waste_event
  FOR EACH ROW EXECUTE FUNCTION trg_enrich_waste();

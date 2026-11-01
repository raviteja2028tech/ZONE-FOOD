-- DEMONSTRATION (safe): transactions, savepoints and rollback with the stock ledger - everything is rolled back at the end.
-- Run:  docker exec -i zonefood-postgres psql -U zonefood -d zonefood < db/demos/02_transactions_and_rollback.sql
-- (add -v ON_ERROR_STOP=0 to see every statement even after the expected refusals)

BEGIN;

-- pick a lot with plenty of stock and remember its quantity
CREATE TEMP TABLE demo_lot ON COMMIT DROP AS
  SELECT lot_id, establishment_id, food_id, remaining_qty AS before_qty FROM inventory_lot WHERE remaining_qty > 10 ORDER BY lot_id LIMIT 1;
SELECT 'start' AS step, lot_id, before_qty AS remaining FROM demo_lot;

-- STEP 1: a normal write-off. Trigger tr_lot_ledger deducts 3 kg exactly once.
INSERT INTO waste_event (establishment_id, food_id, lot_id, reason_id, route_id, stage, quantity_kg, occurred_on)
SELECT d.establishment_id, d.food_id, d.lot_id, (SELECT reason_id FROM waste_reason WHERE reason_code = 'SPOILAGE'),
       (SELECT route_id FROM disposal_route WHERE route_name = 'COMPOST'), 'PRE_CONSUMER_SPOILAGE', 3, CURRENT_DATE FROM demo_lot d;
SELECT 'after 3 kg write-off' AS step, l.lot_id, l.remaining_qty AS remaining FROM inventory_lot l JOIN demo_lot d USING (lot_id);

-- STEP 2: SAVEPOINT, then a write-off that is too big. The database refuses it, and ROLLBACK TO SAVEPOINT undoes only that step.
SAVEPOINT try_overdraw;
DO $$ BEGIN
  BEGIN
    INSERT INTO waste_event (establishment_id, food_id, lot_id, reason_id, route_id, stage, quantity_kg, occurred_on)
    SELECT d.establishment_id, d.food_id, d.lot_id, (SELECT reason_id FROM waste_reason WHERE reason_code = 'SPOILAGE'),
           (SELECT route_id FROM disposal_route WHERE route_name = 'COMPOST'), 'PRE_CONSUMER_SPOILAGE', 100000, CURRENT_DATE FROM demo_lot d;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'overdraw refused: %', SQLERRM;
  END;
END $$;
ROLLBACK TO SAVEPOINT try_overdraw;
SELECT 'after refused overdraw (3 kg step still applied)' AS step, l.remaining_qty AS remaining FROM inventory_lot l JOIN demo_lot d USING (lot_id);

-- STEP 3: the whole transaction is abandoned - stock returns to where it started.
ROLLBACK;

SELECT 'after ROLLBACK' AS step, l.remaining_qty AS remaining FROM inventory_lot l WHERE l.lot_id = (SELECT min(lot_id) FROM inventory_lot WHERE remaining_qty > 10);

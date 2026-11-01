-- 018: index found necessary by the Part 3 query catalogue.
--
-- Evidence: catalogue query Q20 (supplier -> procurement -> line -> lot -> waste) joins waste_event on lot_id.
-- Without an index every one of ~20,000 lots forced a scan of the whole 55k-row partitioned table; the query
-- exceeded a 30 second timeout. The same lookup is needed by the stock-ledger trigger's DELETE path and by the
-- ON DELETE SET NULL foreign key from waste_event to inventory_lot. See docs/EXPLAIN_EVIDENCE.md for the
-- before/after plans.
--
-- PARTIAL: only rows that name a lot (most waste is not tied to a lot), which keeps the index small.
CREATE INDEX idx_waste_lot ON waste_event (lot_id) WHERE lot_id IS NOT NULL;

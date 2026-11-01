-- 008: indexes, each tied to a concrete query pattern (Master Plan s5.1).
-- Indexes on the partitioned waste_event are created on the parent and cascade to every partition.

-- Dashboards filter the fact table by establishment + date range.
CREATE INDEX idx_waste_estab_date ON waste_event (establishment_id, occurred_on DESC);
-- "Top wasted foods in a zone" scans by food across all establishments.
CREATE INDEX idx_waste_food_date ON waste_event (food_id, occurred_on);
-- Stage breakdown is a low-cardinality filter: covering index enables index-only scans.
CREATE INDEX idx_waste_stage_cover ON waste_event (occurred_on, stage) INCLUDE (quantity_kg, establishment_id);

-- Partial index: the marketplace only ever queries claimable listings (a small fraction of rows).
CREATE INDEX idx_listing_open ON surplus_listing (expires_at)
  WHERE status IN ('OPEN','PARTIALLY_CLAIMED');
-- Expiry sweeps only look at lots that still hold stock.
CREATE INDEX idx_lot_expiry ON inventory_lot (establishment_id, expires_at)
  WHERE remaining_qty > 0;

-- Full-text search and typo-tolerant fallback on the food catalogue.
CREATE INDEX idx_food_fts  ON food_item USING GIN (search_doc);
CREATE INDEX idx_food_trgm ON food_item USING GIN (canonical_name gin_trgm_ops);

-- Vector indexes (HNSW, cosine). Columns are NULL until the Part 2 embedding backfill.
CREATE INDEX idx_food_name_vec ON food_item      USING hnsw (name_embedding  vector_cosine_ops);
CREATE INDEX idx_listing_vec   ON surplus_listing USING hnsw (desc_embedding  vector_cosine_ops);
CREATE INDEX idx_recipient_vec ON recipient_org   USING hnsw (need_embedding  vector_cosine_ops);
CREATE INDEX idx_wastenote_vec ON waste_event     USING hnsw (notes_embedding vector_cosine_ops);

-- Append-only, time-ordered audit table: BRIN is far smaller than a B-tree here.
CREATE INDEX idx_audit_brin ON audit_log USING BRIN (changed_at);

-- Foreign-key / join-path indexes for the demonstrated query patterns.
CREATE INDEX idx_establishment_zone     ON establishment (zone_id);
CREATE INDEX idx_establishment_category ON establishment (category_id);
CREATE INDEX idx_session_estab_date     ON service_session (establishment_id, service_date DESC);
CREATE INDEX idx_procurement_estab_date ON procurement (establishment_id, received_at DESC);
CREATE INDEX idx_proc_line_food         ON procurement_line (food_id);
CREATE INDEX idx_lot_food               ON inventory_lot (food_id);
CREATE INDEX idx_listing_estab          ON surplus_listing (establishment_id, created_at DESC);
CREATE INDEX idx_claim_recipient        ON redistribution_claim (recipient_id, status);
CREATE INDEX idx_user_establishment     ON app_user (establishment_id) WHERE establishment_id IS NOT NULL;
CREATE INDEX idx_user_recipient         ON app_user (recipient_id)     WHERE recipient_id IS NOT NULL;
CREATE INDEX idx_zone_parent            ON zone (parent_zone_id);

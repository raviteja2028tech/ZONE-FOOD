-- 011: table/column comments so the generated data dictionary (scripts/gen_docs.py) is self-describing.
COMMENT ON TABLE zone IS 'Locality hierarchy (sector > block > street); self-referencing for recursive roll-ups.';
COMMENT ON TABLE establishment IS 'Supertype for every food-handling entity (restaurant, mess, household block ...).';
COMMENT ON TABLE commercial_profile IS 'Subtype of establishment for COMMERCIAL kinds (1:1, PK = FK).';
COMMENT ON TABLE institutional_profile IS 'Subtype of establishment for EDUCATIONAL/ORGANIZATIONAL/HEALTHCARE kinds (1:1, PK = FK).';
COMMENT ON TABLE residential_profile IS 'Subtype of establishment for RESIDENTIAL kinds (1:1, PK = FK).';
COMMENT ON TABLE app_user IS 'Application users; ck_user_scope ties each role to the right tenant column.';
COMMENT ON TABLE food_item IS 'Canonical food catalogue; carries FTS (search_doc) and semantic (name_embedding) columns.';
COMMENT ON TABLE inventory_lot IS 'Stock lots created from procurement lines; remaining_qty never exceeds received_qty.';
COMMENT ON TABLE service_session IS 'One meal service (establishment, date, slot); closing it freezes the actual headcount.';
COMMENT ON TABLE preparation_batch IS 'Quantity of one dish prepared for one session.';
COMMENT ON TABLE consumption_record IS 'Served / leftover / plate-waste outcome for one preparation batch (1:1).';
COMMENT ON TABLE waste_event IS 'Fact table: one row per waste occurrence. RANGE-partitioned monthly on occurred_on.';
COMMENT ON TABLE surplus_listing IS 'Edible surplus offered for redistribution.';
COMMENT ON TABLE redistribution_claim IS 'A recipient organisation''s claim against a surplus listing.';
COMMENT ON TABLE audit_log IS 'Trigger-written change history (triggers are added in Part 3).';

COMMENT ON COLUMN waste_event.stage IS 'Where in the food lifecycle the waste arose (pre- vs post-consumer).';
COMMENT ON COLUMN waste_event.was_edible IS 'TRUE if the food was still fit to eat when discarded (i.e. avoidable waste).';
COMMENT ON COLUMN waste_event.cost_estimate IS 'Derived by trigger as quantity_kg x food_item.avg_cost_per_unit; stored so historical reports do not drift.';
COMMENT ON COLUMN waste_event.co2e_estimate IS 'Derived by trigger from emission_factor (illustrative synthetic factors).';
COMMENT ON COLUMN waste_event.source_doc_id IS 'MongoDB _id (hex) of the raw submission this row was normalised from, if any.';
COMMENT ON COLUMN waste_event.notes_embedding IS 'pgvector(384) of notes; NULL until the Part 2 embedding backfill.';
COMMENT ON COLUMN establishment.capacity IS 'Size in the unit given by establishment_category.capacity_metric (seats, students, residents ...).';
COMMENT ON COLUMN inventory_lot.remaining_qty IS 'Stock still on hand; 0 <= remaining_qty <= received_qty.';
COMMENT ON COLUMN surplus_listing.claimed_qty_kg IS 'Sum of APPROVED and COLLECTED claim quantities; <= offered_qty_kg.';
COMMENT ON COLUMN redistribution_claim.match_score IS 'Cosine similarity between listing and recipient need at match time (0..1).';
COMMENT ON COLUMN app_user.password_hash IS 'bcrypt hash; the plaintext password is never stored.';

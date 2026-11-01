-- title: DELETE with a subquery - purge one imported document's rows so it can be re-synced
-- concepts: DELETE ... WHERE (scalar subquery), RETURNING, lineage column source_doc_id, trigger T3 restoring stock on delete
-- purpose: If a MongoDB field log was corrected after import, its rows can be removed by lineage and the document re-queued. Only rows carrying that document's id are touched. Executed inside a rolled-back transaction, so nothing is actually lost.
-- mode: dml
-- reading: Returns the rows removed for one document's lineage (rolled back afterwards); stock for any lot-linked row would be restored by trigger T3.
DELETE FROM waste_event
 WHERE source_doc_id = (SELECT source_doc_id FROM waste_event
                         WHERE source_doc_id IS NOT NULL
                         ORDER BY occurred_on DESC, waste_id LIMIT 1)
RETURNING waste_id, establishment_id, occurred_on, quantity_kg, source_doc_id, measurement_source;

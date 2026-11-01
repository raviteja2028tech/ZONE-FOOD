-- title: INSERT ... ON CONFLICT (upsert) - teach the name matcher a new alias
-- concepts: UPSERT (ON CONFLICT DO UPDATE), scalar subquery for the foreign key, EXCLUDED pseudo-table, idempotent write
-- purpose: A reviewer confirms that "panneer masala" means Paneer Butter Masala. The statement inserts the alias, or - if the raw name was already queued as unresolved - updates that row instead of failing, so running it twice is harmless. Executed inside a rolled-back transaction.
-- mode: dml
-- reading: A single row: the alias inserted, or updated if it already existed (hit_count 1 on first insert, incremented on conflict).
INSERT INTO food_alias (raw_name_norm, food_id, confidence, method, status)
VALUES ('panneer masala',
        (SELECT food_id FROM food_item WHERE canonical_name = 'Paneer Butter Masala'),
        1.0, 'MANUAL', 'RESOLVED')
ON CONFLICT (raw_name_norm)
DO UPDATE SET food_id = EXCLUDED.food_id, confidence = EXCLUDED.confidence, method = EXCLUDED.method,
              status = 'RESOLVED', hit_count = food_alias.hit_count + 1, last_seen_at = now()
RETURNING alias_id, raw_name_norm, food_id, method, status, hit_count;

-- title: INSERT ... SELECT - list near-expiry, still-edible stock as surplus
-- concepts: INSERT with SELECT source, RETURNING, expression columns, trigger T4 (audit) firing on insert
-- purpose: A kitchen can turn stock that is about to expire into a rescue listing in one statement. One new surplus listing is created per qualifying lot (at most 3 here) and the inserted rows are returned. The catalogue always runs this inside a transaction that is ROLLED BACK, so the demo data is never kept.
-- mode: dml
-- reading: Returns the listings that WOULD be created (the transaction is rolled back afterwards). expires_at is the earlier of the lot's expiry and 48 hours.
INSERT INTO surplus_listing (establishment_id, food_id, description, offered_qty_kg, is_cooked, is_vegetarian, available_from, expires_at)
SELECT l.establishment_id, l.food_id,
       format('%s kg of %s approaching its expiry date - offered before it is wasted', ROUND(l.remaining_qty, 1), fi.canonical_name),
       l.remaining_qty, FALSE, TRUE, now(), LEAST(l.expires_at, now() + interval '48 hours')
  FROM inventory_lot l
  JOIN food_item fi ON fi.food_id = l.food_id
 WHERE l.remaining_qty >= 5 AND fi.is_edible_as_is
   AND l.expires_at > now() + interval '1 hour' AND l.expires_at <= now() + interval '5 days'
 ORDER BY l.expires_at
 LIMIT 3
RETURNING listing_id, establishment_id, offered_qty_kg, status, expires_at;

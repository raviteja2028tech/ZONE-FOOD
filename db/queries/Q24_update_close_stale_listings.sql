-- title: UPDATE - mark listings that passed their expiry as EXPIRED
-- concepts: UPDATE with a WHERE predicate on a partial-index column, RETURNING, enum status, triggers T4 (audit) and T6 (status guard)
-- purpose: Housekeeping that keeps the stored status honest: listings still flagged OPEN or PARTIALLY_CLAIMED although their pick-up window has closed are moved to EXPIRED. (The application also derives expiry live, so users never see a stale status; this makes the stored value agree.) Executed inside a rolled-back transaction.
-- mode: dml
-- reading: Returns each stale listing moved to EXPIRED (rolled back afterwards); the row count is how many were out of date.
UPDATE surplus_listing
   SET status = 'EXPIRED'
 WHERE status IN ('OPEN', 'PARTIALLY_CLAIMED')
   AND expires_at < now()
   AND claimed_qty_kg < offered_qty_kg
RETURNING listing_id, establishment_id, offered_qty_kg, claimed_qty_kg, expires_at, status;

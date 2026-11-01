# Two-terminal concurrency demo (the PDF's "claim race")

Two `psql` windows, one listing, two claimants. This shows `SELECT ... FOR UPDATE` serialising competitors and the loser being refused.
(`python scripts/gen_part3_docs.py --only concurrency` automates the same race and prints a timestamped timeline - see `docs/CONCURRENCY_EVIDENCE.md`.)

**Setup (any window)** - creates one 10 kg listing and two 6 kg requests; note the printed ids:

```sql
-- psql: docker exec -it zonefood-postgres psql -U zonefood -d zonefood
INSERT INTO surplus_listing (establishment_id, description, offered_qty_kg, is_cooked, is_vegetarian, available_from, expires_at)
VALUES (1, 'demo race', 10, FALSE, TRUE, now() - interval '1 hour', now() + interval '6 hours') RETURNING listing_id;   -- say 9001
SELECT fn_claim_surplus(9001, 1, 6, 0.5);   -- claim A  -> say 5001
SELECT fn_claim_surplus(9001, 2, 6, 0.5);   -- claim B  -> say 5002
```

**Window 1**

```sql
BEGIN;
SELECT * FROM fn_transition_claim(5001, 'approve', 1, NULL);   -- succeeds; row lock on the listing is now HELD
-- ... leave this window open for ~10 seconds ...
COMMIT;                                                         -- lock released
```

**Window 2** (start while window 1 is still open)

```sql
BEGIN;
SELECT * FROM fn_transition_claim(5002, 'approve', 1, NULL);   -- BLOCKS here until window 1 commits
-- after the COMMIT in window 1 it fails:
-- ERROR:  Only 4.0 kg are still unreserved; this claim needs 6.0 kg.
ROLLBACK;
```

**Cleanup**: `DELETE FROM surplus_listing WHERE listing_id = 9001;` (claims cascade; audit rows remain by design).

**What to say:** the second session did not read stale data - it waited for the lock, then saw the quantity the first had reserved. Without the lock both would have approved and the listing would promise 12 kg from 10 kg.

# Concurrency evidence

_Generated 2026-11-01 19:29 on a disposable database (created and dropped by `scripts/gen_part3_docs.py`). Two real PostgreSQL connections run in parallel threads; times are measured, not scripted._

## Experiment 1 - two approvers race for the last kilograms (the PDF's two-terminal test)

Listing offers **10 kg**. Claim A and claim B each ask for **6 kg**, so only one can be approved. `fn_transition_claim` locks the listing row with `SELECT ... FOR UPDATE`.

| t (s) | session | event |
|---|---|---|
| 7.69 | setup | listing 876 offers 10 kg; claim A wants 6 kg, claim B wants 6 kg (both REQUESTED) |
| 7.71 | A | BEGIN |
| 7.72 | A | approved claim A (6 kg reserved) - holds the row lock on the listing, NOT yet committed |
| 8.23 | B | BEGIN |
| 8.23 | B | approve claim B -> SELECT ... FOR UPDATE on the same listing: BLOCKED, waiting for A |
| 10.72 | A | COMMIT - lock released |
| 10.73 | B | ERROR after the wait: "Only 4.0 kg are still unreserved; this claim needs 6.0 kg." -> ROLLBACK |

Final state: listing claimed = **6.000 kg**, status **PARTIALLY_CLAIMED**; claims: 778→APPROVED, 779→REQUESTED.

**What it proves:** session B was *blocked* (its error arrives only after A commits, ~3 s later), then saw the quantity A had reserved and was refused. Without the row lock both would have read 10 kg available and the listing would be over-subscribed (12 kg promised from 10 kg).

## Experiment 2 - six simultaneous write-offs against a 10 kg stock lot

Six sessions each try to write off **3 kg** from the same lot at the same instant. Trigger `tr_lot_ledger` locks the lot and deducts exactly once per accepted event.

| session | outcome |
|---|---|
| 1 | refused - Waste of 3.000 kg exceeds the 1.000 kg remaining in lot 213 |
| 2 | refused - Waste of 3.000 kg exceeds the 1.000 kg remaining in lot 213 |
| 3 | ok - deducted 3 kg |
| 4 | refused - Waste of 3.000 kg exceeds the 1.000 kg remaining in lot 213 |
| 5 | ok - deducted 3 kg |
| 6 | ok - deducted 3 kg |

Result: **3** accepted, **3** refused; lot remaining = **1.000 kg** (= 10 − 3×3); never negative, never deducted twice.

## The deadlock this test caught during development

The first version of the ledger trigger was an `AFTER INSERT` trigger. Under exactly this test PostgreSQL reported:

```
psycopg.errors.DeadlockDetected: deadlock detected
DETAIL:  Process 10914 waits for ShareLock on transaction 5680; blocked by process 10917.
```

Cause: the foreign key `waste_event.lot_id → inventory_lot` is checked by an AFTER trigger that first takes a *shared* (`FOR KEY SHARE`) lock on the lot. Each session held that shared lock and then asked for `FOR UPDATE` - a lock-*upgrade* deadlock. Fix (migration 017): make the ledger a **BEFORE** trigger so the exclusive lock is taken first and writers queue instead of deadlocking.

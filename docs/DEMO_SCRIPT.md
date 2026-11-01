# Faculty demo script (12 minutes)

Follows plan §15, with the Part 3 additions. Every step is something that runs on the real system; the "say" lines name the database concept behind what is on screen.

## Before you start (once, 5 minutes earlier)

```powershell
docker compose up -d --wait
python scripts/setup_db.py            # only if the databases are empty / you want a clean slate (add --reset)
npm run demo:prepare                  # embeddings + a few live synthetic listings
npm run build ; npm start             # or: npm run dev   -> http://localhost:3000
```

Accounts (password = `DEMO_USER_PASSWORD` from your `.env`): `admin@zonefood.example`, `auditor@zonefood.example`,
`manager.greenfield.academy.canteen@zonefood.example`, `agent.annapoorna.community.kitchen@zonefood.example`.
Open three browser windows (admin / manager / recipient) or use private windows. Keep a `psql` terminal ready:
`docker exec -it zonefood-postgres psql -U zonefood -d zonefood`.

| Time | Step | What to do | What to say (database concept) |
|---|---|---|---|
| 0:00 | **1. Problem** | Admin dashboard (`/`) | Waste is a zone-level system problem: where, why, and could the surplus reach someone. Three databases, each for what it is best at (relational integrity / flexible documents / semantic vectors). KPIs, sparklines and the zone chart are live SQL aggregates, not stored numbers. |
| 0:45 | **2. Schema** | `docs/ER_DIAGRAM.md`, then Lab → *Database objects* | 31 tables (incl. `schema_migrations`, `waste_event` partition parent): self-referencing zone tree, disjoint subtypes, M:N tables, a monthly **partitioned** fact table. The Lab lists every table, index, view, function and trigger from the live catalog. |
| 1:45 | **3. Establishment flow** | Manager window: Procurement → record a delivery (one line) → Inventory shows the new lot → Service → open a session → add a batch → close with leftovers | One transaction for header + lines + lots. Closing calls **`sp_close_service_session`**: consumption, plate waste, and an automatic surplus listing — show the *"Created automatically"* card. |
| 3:45 | **4. Constraint refusal** | Close another session with served + leftover larger than prepared | Trigger **T1** refuses it; the UI shows the database's own message and **nothing was written** (the session is still open). Three layers: zod → CHECK → trigger. |
| 4:45 | **5. Stock exactly once** | Waste → write off 3 kg from a lot; Inventory shows exactly −3 kg. Then Lab → *Live constraint demos* → **D03** (over-draw refused) and **D04** (deducted once) | Trigger **T3** is the only code that touches lot stock; the app no longer does. D03/D04 run in a transaction that is rolled back, so nothing changes. |
| 5:45 | **6. Mongo → ETL → Postgres** | Manager: Field logs → submit a household log and a restaurant log (different shapes, messy dish names). Admin: Data sync → Run sync | Variable-schema documents belong in MongoDB (`MONGODB_DESIGN.md`). The ETL is idempotent (`source_doc_id`) and leased; messy names resolve through exact → alias → trigram → **vector** lookup; cost and CO₂e appear from trigger **T2** and the row is labelled `ETL_IMPORT`. |
| 7:45 | **7. Semantic matching + claim** | Manager: Surplus → open a listing → *ranked recipients* with score bars. Recipient: Available surplus → claim. Manager: Claims → approve | SQL hard filters first (locality, cooked-food policy, capacity, window), then 0.60 semantic + 0.25 capacity + 0.15 proximity. Claim = `fn_claim_surplus` (row lock); approve = `fn_transition_claim`. |
| 9:00 | **8. Race** | `psql` two windows per `db/demos/03_two_terminal_race.md` (or show `docs/CONCURRENCY_EVIDENCE.md`) | Second session **blocks** on the listing row lock, then is refused ("Only 4.0 kg are still unreserved"). Without the lock the listing would promise 12 kg from 10 kg. |
| 9:45 | **9. Analytics** | Admin: Analytics. Hover the trend (anomaly markers), weekday bars, diversion line, peer ranking, rescue funnel, supplier table. Toggle *Table view* | Name the SQL behind each chart: z-score window frame (Q15), `LAG` month-on-month (Q13), `RANK/PERCENT_RANK` (Q17), recursive CTE roll-up (Q18), conditional aggregates (Q10), multi-hop join (Q20). Every chart has a table alternative. |
| 11:00 | **10. Performance** | Lab → SQL catalogue → Q20 → *Run with EXPLAIN ANALYZE*; show `EXPLAIN_EVIDENCE.md` §2 (partition pruning) | 1 partition (versus 27 without the key) scanned for a month filter; the partial index took Q20 from a 30 s timeout to under a second; the materialised view is hundreds of times faster than aggregating the base table (figures in the document). |
| 11:45 | **11. Repo** | `README.md`, `docs/TEST_REPORT.md` | Run `python scripts/run_all_tests.py` yourself in the background. All counts in the report come from the machine-readable test output. |

## Backup demonstrations (if time or questions allow)

| Question | Show |
|---|---|
| "Is the audit trail real?" | Audit log page → open a recent claim change → field-level diff, attributed to the user (T4 + `app.current_user_id`). Lab demo **D11**. |
| "What if two people write off the same stock?" | `pytest tests/test_part3.py -k concurrent -v` — 10 simultaneous sessions, exactly 3 succeed. |
| "Show ALTER and DROP." | `docker exec -i zonefood-postgres psql -U zonefood -d zonefood < db/demos/01_ddl_lifecycle.sql   # bash; in PowerShell: Get-Content dbdemos< db/demos/01_ddl_lifecycle.sql1_ddl_lifecycle.sql | docker exec -i zonefood-postgres psql -U zonefood -d zonefood` (rolled back, nothing remains). Migration `014_alter_drop_ddl.sql` is the permanent one. |
| "Transactions and savepoints?" | `db/demos/02_transactions_and_rollback.sql`. |
| "Where is full-text search?" | Food catalogue search box: type `panner` (typo) or `biriyani`. |
| "Is the matching actually semantic?" | Name matching page: type `veg biriyani special`; then Q22 in the Lab. |
| "Another tenant's data?" | Log in as the manager, open `/establishments/1` of a different establishment → access denied / 404; `POST /api/etl/sync` as recipient → 403. |
| "Who can see the Lab?" | Only admin / auditor; only the admin may refresh the materialised view. DML in the Lab is always rolled back. |

## If something goes wrong

* **Blank charts / no data:** `python scripts/verify_db.py`; then `python scripts/setup_db.py --reset` and `npm run demo:prepare` (≈ 2 minutes).
* **Embeddings missing:** run `npm run demo:prepare` (first run downloads a ~23 MB model into `.cache/`; needs internet once).
* **Port already in use:** change `POSTGRES_PORT` / `MONGO_PORT` in `.env`, then `docker compose up -d --wait`.
* **Login fails after a reset:** the shared password is `DEMO_USER_PASSWORD` in `.env` at the time the seed ran; re-seed after changing it.
* **Lockout after 5 wrong passwords:** wait 15 minutes or restart the server (in-memory limiter).

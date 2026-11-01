# CURRENT STATUS - ZoneFood

_Single source of truth. Last updated 2026-11-01 after completing Part 3 (Phases 3.1-3.5)._

**Parts 1 and 2:** complete, approved. **Part 3 (3.1 query catalogue · 3.2 advanced DBMS · 3.3 UI polish · 3.4 testing · 3.5 documentation): COMPLETE and verified. STOPPED - awaiting your approval.**
Part 4: optional, **not started**.

## What Part 3 delivers

| Phase | Delivered |
|---|---|
| 3.1 | **26 catalogue queries** in `db/queries/` (22 analytic + 4 DML), each with title, concepts, purpose, SQL and a reading guide; generated [QUERY_CATALOGUE.md](docs/QUERY_CATALOGUE.md) with real results; all executed and semantically verified |
| 3.2 | Migrations **014-018**: ALTER + DROP DDL (014), 3 views + 1 materialised view (015), 5 functions + 1 stored procedure (016), triggers T3-T6 (017), `idx_waste_lot` (018). **Stock is deducted exactly once, by trigger T3**; EXPLAIN evidence, partition pruning, concurrency evidence, FTS, pgvector documentation, safe DDL/transaction/race demos |
| 3.3 | Analytics page, DBMS Lab (catalogue runner with EXPLAIN ANALYZE, 12 live constraint demos, database-object browser, MV refresh), Audit log, command palette (Ctrl+K), count-up KPIs and sparklines, anomaly-marked charts with a table view, redesigned lists/dashboards; light/dark; no overflow at 390 / 820 / 1440 px |
| 3.4 | `scripts/run_all_tests.py` runs everything and writes [docs/TEST_REPORT.md](docs/TEST_REPORT.md) from machine-readable results |
| 3.5 | README, ER diagram, data dictionary, PostgreSQL + MongoDB design, architecture, query catalogue, advanced-DBMS document, object reference, EXPLAIN + concurrency evidence, test report, traceability matrix (Req. 1-18), demo script, viva Q&A, project report, screenshots |

## Actual test results (run 2026-11-01 by `python scripts/run_all_tests.py`)

| Suite | Result |
|---|---|
| pytest - database layer (Part 1 37 · Part 3 31 · catalogue 48 · demos 4) | **120 / 120** |
| TypeScript type-check · ESLint | clean · clean |
| vitest unit | **46 / 46** |
| vitest integration (disposable `zonefood_webtest` DB + Mongo; Part 2 59 + Part 3 20) | **79 / 79** |
| Production build | PASS (68 routes) |
| **Total automated tests** | **245 / 245** |
| `python scripts/verify_db.py` on the working database | 55 / 55 |
| `python scripts/gen_docs.py --check` | ER diagram + data dictionary match the live schema |
| **Fresh-copy check** (only files git would track, new venv, new databases `zf_fresh`, `.env` from the existing credentials) | `setup_db.py` built schema + seed, verify 55/55; `npm ci`, type-check, lint, unit 46/46, build, pytest 120/120; server started, admin login 200, dashboard/analytics 200, Lab query API returned rows. The temporary databases and folder were removed afterwards |
| Browser QA (headless Chromium) | dashboards, Analytics, Lab (query, EXPLAIN, demos, objects), Audit, lists; light/dark; phone/tablet widths; zero console errors |

Concurrency (real simultaneous connections): 10 write-offs of 3 kg on a 10 kg lot → **3 succeed, 1 kg left**; 8 approvals of 4 kg on a 10 kg listing → **2 approved**; 6 identical claims → **1 claim**; 5 concurrent closes of one session → **1 close**. Details and the timestamped lock-wait trace: [docs/CONCURRENCY_EVIDENCE.md](docs/CONCURRENCY_EVIDENCE.md).

## Database changes in Part 3 (migrations 014-018; Part 1-2 data preserved)

| Migration | Change |
|---|---|
| 014 | `ALTER TABLE waste_event ADD measurement_source` + CHECK, back-fill; T2 redefined to derive provenance; `DROP INDEX idx_wastenote_vec` |
| 015 | `v_daily_waste`, `v_preparation_efficiency`, `v_redistribution_performance`, `mv_zone_monthly` (+ unique index) |
| 016 | `fn_waste_intensity`, `fn_search_food`, `fn_claim_surplus`, `fn_transition_claim`, `sp_close_service_session`, `fn_ensure_waste_partitions` |
| 017 | T3 `tr_lot_ledger` (BEFORE), T4 `tr_audit`, T5 `tr_claim_guard`, T6 `tr_listing_guard` |
| 018 | `idx_waste_lot` (Q20: 30 s timeout → under 1 s) |

Part 1 files touched minimally: `seed.py` (bulk-load switch, MV refresh), `verify_db.py` (new tables; embedding/sync checks generalised), `tests/test_part1.py` (one claim test now uses an APPROVED claim because T5 forbids skipping states).

## Application changes in Part 3

Repositories now call the database routines (`claims.ts`, `kitchen.ts`, `waste.ts`, `catalog.ts`); new `insights.ts`, `audit.ts`, `db-objects.ts`; `lib/lab.ts` (catalogue loader, demos); API routes `/api/lab/{run,demo,refresh}`; `withTransaction({userId})` sets the audit user; `int8` parsed as numbers; error mapping for the new SQLSTATEs. New permissions `analytics:view`, `lab:use`, `audit:read`.

## Errors met and resolved (Part 3)

| Problem | Resolution |
|---|---|
| 10-way concurrent write-off **deadlocked** (AFTER trigger + FK `KEY SHARE` lock upgrade) | T3 became a BEFORE trigger (migration 017, before it was ever committed); explained in CONCURRENCY_EVIDENCE.md and DECISIONS 38 |
| Q20 exceeded the 30 s timeout (seq scan per lot) | `idx_waste_lot` (migration 018), measured in EXPLAIN_EVIDENCE.md |
| Part 1 test conflicted with the claim state machine T5 | test updated to use an APPROVED claim (documented) |
| Seed would re-deduct stock / flood the audit log | transaction-local `zonefood.bulk_load` switch, tested both ways |
| Q24 empty on a freshly seeded DB | test ages OPEN listings (time passes) instead of weakening the query |
| Phone overflow from grid `min-width: auto` | `min-w-0` on Card, `minWidth` prop on tables |
| Chart bars "missing" in full-page screenshots | Recharts animation restarts on capture; verified 62 bars exist; screenshots are viewport captures |
| `run_all_tests.py` crashed printing box-drawing characters on Windows cp1252 | stdout reconfigured to UTF-8 |
| `docs/ARCHITECTURE.md` was accidentally emptied by a failed scripted edit | rebuilt in full from content already read, plus the Part 3 sections |

## Remaining issues and honest notes

1. **Git:** the repository root is your home directory (`C:/Users/ravit`, branch `mai`, one unrelated commit); this project is untracked inside it. Nothing was initialised, committed or pushed. Req. 15 (per-member commit history) needs your decision.
2. **Req. 2** (team members and responsibilities) cannot be supplied from the repository; `docs/PROJECT_REPORT.md` §2 holds a placeholder.
3. **Deviations from the plan** (reasons in [REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md)): Q21 is data provenance, not forecast accuracy (forecasting = Part 4); ALTER/DROP targets differ from the plan's example; `tr_lot_ledger` instead of `tr_lot_deduct`; ~55k waste rows instead of 400k (index gains on small tables are plan-shape evidence; the evidence says where an index does not help).
4. Embedding model is small and English-only (88 % name resolution measured, one false positive).
5. The working database holds the synthetic seed plus QA walkthrough leftovers; `python scripts/setup_db.py --reset` restores a clean seed. Timings in the generated evidence documents vary slightly per regeneration.
6. The original course-requirements PDF is not in the repository; Req. numbers follow the plan's §14.
7. `npm audit` still reports a moderate dev-tooling advisory (ESLint's `minimatch`), not shipped to runtime.

## Run commands

```powershell
docker compose up -d --wait
python scripts/setup_db.py            # add --reset for a clean rebuild (needs the venv: .\.venv\Scripts\python)
npm install
npm run demo:prepare                  # embeddings + live demo listings
npm run dev                           # http://localhost:3000     (or: npm run build ; npm start)
python scripts/run_all_tests.py       # everything + docs/TEST_REPORT.md
python scripts/gen_part3_docs.py      # regenerate generated evidence documents
```

## Next step

Awaiting your approval of Part 3. Part 4 (forecasting, similar-incident search) is optional and will not be started without it.

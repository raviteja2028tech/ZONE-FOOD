# Test report

_Generated 2026-11-01 17:31 by `python scripts/run_all_tests.py`. Every figure below was produced by running the suites in this repository; the per-test lists are parsed from their machine-readable reports (`reports/`)._

**Overall: ALL SUITES PASSED - 245 of 245 automated tests passed**, plus type-check, lint and a production build.

## Environment

- PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2); migrations applied: 18; MongoDB 7 (Docker); pgvector 0.8
- Node v24.18.0, Python 3.14.6, Windows 11
- Integration tests run against a **disposable database** (`zonefood_webtest`) built from the real migrations and seed; pytest uses its own throw-away databases. The working database is never touched by the suites.

## Summary

| Suite | Command | Passed | Failed | Time | Result |
|---|---|---|---|---|---|
| Database layer (pytest) | `python -m pytest -q` | 120/120 | 0 | 51s | PASS |
| TypeScript type-check | `npm run typecheck` | clean | - | 6s | PASS |
| ESLint | `npm run lint` | clean | - | 14s | PASS |
| Unit tests (vitest) | `npm test` | 46/46 | 0 | 3s | PASS |
| Integration tests (vitest, disposable DB) | `npm run test:integration` | 79/79 | 0 | 78s | PASS |
| Production build (Next.js) | `npm run build` | 68 routes compiled | - | 14s | PASS |

## How to reproduce

```powershell
docker compose up -d --wait
python scripts/run_all_tests.py      # everything + this report
# or individually:
python -m pytest -q                  # database layer
npm test                             # unit
npm run test:integration            # API + workflows + Mongo + ETL + concurrency
npm run build
```

## What each suite proves

| Suite | Covers |
|---|---|
| pytest `test_part1.py` | migrations from empty, idempotent re-run, checksum tamper rejection, constraints (PK/FK/UNIQUE/CHECK), triggers T1/T2, partition pruning, seed determinism, MongoDB shapes/validators/indexes, docs match schema |
| pytest `test_part3.py` | ALTER/DROP DDL, views, materialised view refresh, stored functions/procedure, triggers T3-T6, stock consistency, transactions & rollback, partition function, **real multi-connection concurrency** |
| pytest `test_catalogue.py` | all 26 catalogue queries execute on a clean seeded database and their results are semantically correct; DML leaves data untouched |
| pytest `test_demos.py` | the safe DDL/transaction demonstration scripts run and leave no trace |
| vitest unit | permission matrix, claim state machine, scoring maths, name-matching policy, ETL adapters, rate limiter, validation schemas, env |
| vitest integration | authentication, sessions, RBAC (403/404), registration atomicity, every lifecycle workflow, API validation, concurrency (claims, approvals, write-offs), session-close procedure, audit attribution, DBMS Lab API (all queries + demos), MongoDB submissions, ETL idempotency/retry/lease, pgvector name matching, analytics = catalogue, dashboard correctness |

## Detailed results

### Database layer (pytest)

<details><summary><code>test_catalogue</code> - 48/48 passed</summary>

- ✅ test_the_catalogue_has_at_least_22_queries_with_complete_documentation
- ✅ test_query_executes_and_returns_rows[Q01]
- ✅ test_query_executes_and_returns_rows[Q02]
- ✅ test_query_executes_and_returns_rows[Q03]
- ✅ test_query_executes_and_returns_rows[Q04]
- ✅ test_query_executes_and_returns_rows[Q05]
- ✅ test_query_executes_and_returns_rows[Q06]
- ✅ test_query_executes_and_returns_rows[Q07]
- ✅ test_query_executes_and_returns_rows[Q08]
- ✅ test_query_executes_and_returns_rows[Q09]
- ✅ test_query_executes_and_returns_rows[Q10]
- ✅ test_query_executes_and_returns_rows[Q11]
- ✅ test_query_executes_and_returns_rows[Q12]
- ✅ test_query_executes_and_returns_rows[Q13]
- ✅ test_query_executes_and_returns_rows[Q14]
- ✅ test_query_executes_and_returns_rows[Q15]
- ✅ test_query_executes_and_returns_rows[Q16]
- ✅ test_query_executes_and_returns_rows[Q17]
- ✅ test_query_executes_and_returns_rows[Q18]
- ✅ test_query_executes_and_returns_rows[Q19]
- ✅ test_query_executes_and_returns_rows[Q20]
- ✅ test_query_executes_and_returns_rows[Q21]
- ✅ test_query_executes_and_returns_rows[Q22]
- ✅ test_query_executes_and_returns_rows[Q23]
- ✅ test_query_executes_and_returns_rows[Q24]
- ✅ test_query_executes_and_returns_rows[Q25]
- ✅ test_query_executes_and_returns_rows[Q26]
- ✅ test_dml_queries_leave_the_data_untouched
- ✅ test_catalogue_covers_the_required_sql_features
- ✅ test_q01_rows_are_per_block_and_kind_and_non_negative
- ✅ test_q02_shares_are_consistent
- ✅ test_q03_correlated_form_equals_the_window_rewrite
- ✅ test_q04_rollup_total_equals_sum_of_kinds
- ✅ test_q05_only_repeat_offenders_and_planted_school_is_found
- ✅ test_q06_correlations_are_valid
- ✅ test_q07_has_all_seven_weekdays
- ✅ test_q09_is_sorted_by_value_and_inside_the_window
- ✅ test_q10_funnel_never_gains_food
- ✅ test_q12_median_is_not_above_p90
- ✅ test_q13_months_are_ordered_and_first_change_is_null
- ✅ test_q15_every_row_really_exceeds_the_threshold
- ✅ test_q16_rolling_average_matches_a_manual_calculation
- ✅ test_q17_each_category_has_exactly_one_rank_one
- ✅ test_q18_parent_roll_up_equals_sum_of_children
- ✅ test_q20_finds_the_planted_high_spoilage_supplier
- ✅ test_q21_provenance_percentages_add_up
- ✅ test_q22_returns_at_most_five_feasible_recipients_best_first
- ✅ test_dml_queries_return_what_they_claim

</details>

<details><summary><code>test_demos</code> - 4/4 passed</summary>

- ✅ test_ddl_lifecycle_demo_runs_refuses_the_bad_row_and_leaves_no_trace
- ✅ test_transaction_demo_shows_deduction_savepoint_and_full_rollback
- ✅ test_every_demo_script_is_present_and_documented[01_ddl_lifecycle.sql]
- ✅ test_every_demo_script_is_present_and_documented[02_transactions_and_rollback.sql]

</details>

<details><summary><code>test_part1</code> - 37/37 passed</summary>

- ✅ test_migrations_apply_from_empty_and_are_idempotent
- ✅ test_reset_rebuilds_schema_without_manual_sql
- ✅ test_tampering_with_applied_migration_is_rejected
- ✅ test_integrity_verification_passes_on_seeded_data
- ✅ test_seed_is_deterministic_for_a_fixed_end_date
- ✅ test_trigger_rejects_served_plus_leftover_above_prepared
- ✅ test_trigger_rejects_plate_waste_above_served
- ✅ test_waste_negative_quantity_violates_check
- ✅ test_waste_future_date_violates_check
- ✅ test_waste_unknown_establishment_violates_foreign_key
- ✅ test_listing_claimed_above_offered_violates_check
- ✅ test_manager_without_establishment_violates_user_scope
- ✅ test_admin_with_establishment_violates_user_scope
- ✅ test_residential_occupants_below_households_violates_check
- ✅ test_deleting_zone_with_establishments_is_restricted
- ✅ test_duplicate_service_session_violates_unique
- ✅ test_duplicate_claim_for_same_listing_and_recipient_violates_unique
- ✅ test_collected_claim_requires_collection_time
- ✅ test_lot_remaining_above_received_violates_check
- ✅ test_zone_cannot_be_its_own_parent
- ✅ test_invalid_enum_value_is_rejected
- ✅ test_closed_session_requires_actual_headcount
- ✅ test_phone_must_be_ten_digits
- ✅ test_waste_trigger_derives_cost_and_co2e
- ✅ test_waste_rows_route_to_monthly_partition
- ✅ test_single_month_query_prunes_to_one_partition
- ✅ test_hierarchy_has_sector_blocks_and_streets
- ✅ test_vector_column_accepts_384_dim_embedding_and_similarity_query
- ✅ test_full_text_and_trigram_search_find_food
- ✅ test_planted_signals_exist
- ✅ test_mongo_validator_rejects_bad_documents
- ✅ test_mongo_stores_and_returns_documents_with_different_shapes
- ✅ test_mongo_aggregation_over_nested_arrays_returns_results
- ✅ test_mongo_text_index_and_multikey_index_are_usable
- ✅ test_mongo_timeseries_and_capped_collections
- ✅ test_mongo_etl_queue_index_serves_pending_query
- ✅ test_er_diagram_and_data_dictionary_match_live_schema

</details>

<details><summary><code>test_part3</code> - 31/31 passed</summary>

- ✅ test_part3_migrations_are_applied_in_order
- ✅ test_alter_added_provenance_column_with_check_rule
- ✅ test_provenance_is_derived_by_the_trigger_not_the_application
- ✅ test_drop_index_was_applied_and_unused_index_really_had_no_data
- ✅ test_ddl_lifecycle_create_alter_drop_is_transactional
- ✅ test_v_daily_waste_matches_the_base_table_and_excludes_redistributed_food
- ✅ test_v_preparation_efficiency_is_sane
- ✅ test_v_redistribution_performance_does_not_double_count
- ✅ test_materialised_view_equals_its_definition_and_refreshes_concurrently
- ✅ test_fn_waste_intensity
- ✅ test_fn_search_food_is_typo_tolerant_and_full_text
- ✅ test_fn_ensure_waste_partitions_is_idempotent
- ✅ test_waste_with_lot_deducts_stock_exactly_once
- ✅ test_changing_or_deleting_the_event_moves_stock_back
- ✅ test_stock_ledger_refuses_overdraw_foreign_lot_and_wrong_food
- ✅ test_bulk_load_switch_bypasses_the_ledger_only_when_set
- ✅ test_after_the_seed_no_lot_is_negative_or_overfull
- ✅ test_audit_trigger_attributes_changes_to_the_session_user_and_strips_embeddings
- ✅ test_claim_guard_allows_only_legal_transitions_and_freezes_identity
- ✅ test_cancelled_listing_cannot_be_reopened
- ✅ test_claim_function_validates_every_hard_rule
- ✅ test_claim_function_refuses_expired_cancelled_unavailable_and_over_capacity
- ✅ test_transition_function_full_lifecycle_with_stock_and_redistribution_record
- ✅ test_transition_function_sides_and_illegal_moves
- ✅ test_close_procedure_records_consumption_waste_and_auto_lists_surplus
- ✅ test_close_procedure_is_all_or_nothing
- ✅ test_transaction_rolls_back_every_step_when_a_later_step_fails
- ✅ test_concurrent_approvals_cannot_oversubscribe_a_listing
- ✅ test_concurrent_duplicate_claims_produce_exactly_one_claim
- ✅ test_concurrent_write_offs_cannot_drive_stock_negative_or_deduct_twice
- ✅ test_concurrent_close_of_the_same_session_closes_it_once

</details>


### Unit tests (vitest)

<details><summary><code>domain.test.ts</code> - 30/30 passed</summary>

- ✅ role-based permissions auditors can read but hold no write permission anywhere
- ✅ role-based permissions only recipients can claim; only establishment roles can write kitchen data
- ✅ role-based permissions approving claims is a manager-only power; staff can only hand over
- ✅ role-based permissions administration (ETL, embeddings, zones, establishment management) is zone-admin only
- ✅ role-based permissions Part 3 pages: the DBMS Lab and audit log are authority-only; refreshing the materialised view is admin-only; analytics is for everyone but recipients
- ✅ role-based permissions navigation mirrors permissions: a role sees exactly the links it may open
- ✅ claim state machine allows exactly the documented transitions
- ✅ claim state machine terminal states accept no action
- ✅ claim state machine only approved/collected claims hold quantity
- ✅ claim state machine roles may only perform their actions
- ✅ claim state machine derives listing status from quantities, expiry and cancellation
- ✅ matching score weights sum to 1 and combine as 0.60 / 0.25 / 0.15
- ✅ matching score treats a missing embedding as zero semantic contribution (never invents one)
- ✅ matching score converts cosine distance to similarity and clamps
- ✅ matching score capacity fit peaks when the offer equals capacity and falls off both ways
- ✅ matching score haversine distance and proximity
- ✅ food-name resolution policy normalises case, punctuation and bracketed qualifiers
- ✅ food-name resolution policy applies the cascade in order with the documented thresholds
- ✅ ETL shape adapters commercial: plates x grams -> kg, buffet and spoilage rows with their stages
- ✅ ETL shape adapters residential: bins map to stages; routing depends on segregation
- ✅ ETL shape adapters educational, retail, organisational, healthcare and recreational shapes
- ✅ ETL shape adapters rejects junk quantities and unknown shapes without guessing
- ✅ login rate limiter locks after N failures inside the window and unlocks as failures age out
- ✅ login rate limiter a success resets the counter
- ✅ input validation schemas passwords need length, a letter and a number
- ✅ input validation schemas procurement needs lines, positive quantities and unique foods
- ✅ input validation schemas listing window must end after it starts
- ✅ input validation schemas recipient registration validates the pickup window and need-profile length
- ✅ input validation schemas each establishment kind has its own submission shape
- ✅ formatting helpers computes period-over-period change and relative times

</details>

<details><summary><code>env.test.ts</code> - 7/7 passed</summary>

- ✅ parseEnv applies non-secret defaults (loopback hosts, Part 1 ports)
- ✅ parseEnv coerces ports from strings
- ✅ parseEnv names every missing secret and never invents defaults for them
- ✅ parseEnv treats an empty value like a missing one
- ✅ parseEnv rejects a short or placeholder session secret
- ✅ parseEnv rejects invalid ports
- ✅ parseEnv does not echo secret values in error messages

</details>

<details><summary><code>logger-and-validation.test.ts</code> - 9/9 passed</summary>

- ✅ log redaction scrubs credentials inside connection strings
- ✅ log redaction redacts sensitive keys, including nested ones
- ✅ log redaction flattens errors without stack traces
- ✅ validation helpers returns typed data when valid
- ✅ validation helpers throws a 422 AppError with per-field messages
- ✅ validation helpers validates search params
- ✅ validation helpers maps malformed JSON to 400 and bad shapes to 422
- ✅ error envelope returns AppError details with the request id
- ✅ error envelope hides internals of unexpected errors

</details>


### Integration tests (vitest, disposable DB)

<details><summary><code>auth.test.ts</code> - 17/17 passed</summary>

- ✅ authentication logs in a seeded user and sets an httpOnly, SameSite=Lax session cookie
- ✅ authentication rejects a wrong password and an unknown e-mail with the SAME generic error
- ✅ authentication stores only bcrypt hashes, never plaintext
- ✅ authentication validates login input (422 with field errors)
- ✅ authentication locks an address after repeated failures (429) without affecting other accounts
- ✅ authentication returns 401 for protected routes without a session, with a tampered cookie, or after logout
- ✅ authentication rejects cross-site state-changing requests (Origin check)
- ✅ authentication ends a session immediately when the user is deactivated
- ✅ registration registers an establishment + manager atomically, hashes the password and signs the user in
- ✅ registration rolls back the whole registration when the account step fails (no orphan establishment)
- ✅ registration rejects weak passwords and invalid input with field-level errors
- ✅ registration registers a recipient organisation and its agent
- ✅ role-based access control (server side) auditor is read-only: can read waste, cannot write
- ✅ role-based access control (server side) recipients cannot reach establishment operations; establishment users cannot reach the feed or the ETL
- ✅ role-based access control (server side) establishment users only ever see their own establishment's waste, even when asking for another
- ✅ role-based access control (server side) an establishment user cannot read or edit another establishment; staff cannot edit their own
- ✅ role-based access control (server side) a zone admin can deactivate an establishment, which immediately locks out its users

</details>

<details><summary><code>databases.test.ts</code> - 9/9 passed</summary>

- ✅ PostgreSQL layer connects to PostgreSQL 16 with pgvector and all Part 1 migrations
- ✅ PostgreSQL layer binds parameters instead of interpolating them (SQL injection is inert)
- ✅ PostgreSQL layer rolls a transaction back on error and commits on success
- ✅ PostgreSQL layer returns real, non-empty dataset counts from the seeded schema
- ✅ MongoDB layer connects and reports the five Part 1 collections
- ✅ MongoDB layer can read seeded documents through the driver
- ✅ health API routes GET /api/health returns 200 and a healthy envelope with a request id
- ✅ health API routes GET /api/health/postgres and /mongo return 200
- ✅ health API routes never leaks credentials in any health response

</details>

<details><summary><code>etl-semantic.test.ts</code> - 11/11 passed</summary>

- ✅ MongoDB submissions: genuinely different document shapes stores restaurant, household and college logs with different structures and reads them back
- ✅ MongoDB submissions: genuinely different document shapes validates the payload for the establishment's kind and the date; refuses the wrong role
- ✅ MongoDB submissions: genuinely different document shapes stores variable-structure inspection reports (manager: own establishment only; auditor: read-only)
- ✅ ETL: MongoDB -> PostgreSQL imports a PENDING document into waste_event with lineage, trigger-derived cost and resolved names
- ✅ ETL: MongoDB -> PostgreSQL is idempotent: a second run writes nothing, and a crash-recovery re-sync creates no duplicates
- ✅ ETL: MongoDB -> PostgreSQL marks bad documents FAILED with a safe error, writes nothing for them, and supports retry after a fix
- ✅ ETL: MongoDB -> PostgreSQL two overlapping runs never process the same document twice (lease)
- ✅ semantic name matching (pgvector + trigram cascade) all four embedding columns' coverage reaches 100% after the idempotent backfill
- ✅ semantic name matching (pgvector + trigram cascade) explains every stage of the cascade and resolves typos, case and punctuation
- ✅ semantic name matching (pgvector + trigram cascade) learns: a fuzzy hit is cached in food_alias and answered from the cache next time; misses are queued for review
- ✅ semantic name matching (pgvector + trigram cascade) measures accuracy on the seed's messy names (honest evaluation, not a guarantee)

</details>

<details><summary><code>failures.test.ts</code> - 4/4 passed</summary>

- ✅ failure handling reports a clear setup error when required variables are missing (HTTP 503, names only)
- ✅ failure handling reports PostgreSQL as down (not a crash) when it is unreachable
- ✅ failure handling reports MongoDB as down when it is unreachable
- ✅ failure handling overall status is 'degraded' with 503 when one database is down

</details>

<details><summary><code>part3.test.ts</code> - 20/20 passed</summary>

- ✅ stock consistency: deducted exactly once, from every path an API write-off deducts the lot once (not twice: the application no longer deducts, the trigger does)
- ✅ stock consistency: deducted exactly once, from every path a direct SQL write-off deducts exactly once too, and a bulk-load session does not
- ✅ stock consistency: deducted exactly once, from every path eight simultaneous API write-offs of 3 kg against a 10 kg lot: exactly three win, stock never goes negative
- ✅ stock consistency: deducted exactly once, from every path the ledger is exact for every lot written off through the application in this run
- ✅ concurrent claims and approvals cannot produce inconsistent results eight recipients claim 4 kg each of a 10 kg listing, the manager approves all eight at once: exactly two fit
- ✅ concurrent claims and approvals cannot produce inconsistent results six simultaneous identical claims by one organisation create exactly one claim
- ✅ concurrent claims and approvals cannot produce inconsistent results the database refuses an illegal claim status change even when the application is bypassed
- ✅ closing a session through the stored procedure records consumption, creates plate-waste events and an auto surplus listing, atomically
- ✅ audit trail attributes changes to the signed-in user creating and cancelling a listing through the API writes audit rows with the manager's id
- ✅ DBMS Lab API only zone admins and auditors may use it; unknown ids and raw SQL are rejected
- ✅ DBMS Lab API runs every catalogue query (26) and returns rows; EXPLAIN ANALYZE returns a plan
- ✅ DBMS Lab API DML queries leave the data untouched (they are rolled back)
- ✅ DBMS Lab API every live demonstration behaves as documented and rolls back
- ✅ DBMS Lab API only a zone admin can refresh the materialised view; the refresh makes it current
- ✅ analytics repositories agree with the SQL catalogue weekday profile == Q07; diversion trend == Q13; supplier ranking == Q20
- ✅ analytics repositories agree with the SQL catalogue every anomaly on the page is one the catalogue query finds (Q15)
- ✅ analytics repositories agree with the SQL catalogue peer ranking marks exactly one rank-1 establishment per category and agrees with Q17's ordering
- ✅ analytics repositories agree with the SQL catalogue stored function fn_waste_intensity feeds the establishment dashboard
- ✅ analytics repositories agree with the SQL catalogue rescue funnel and provenance are internally consistent
- ✅ full-text and typo-tolerant food search is served by the stored function finds a food despite a typo, ranks exact names first, and returns nothing for gibberish

</details>

<details><summary><code>workflows.test.ts</code> - 18/18 passed</summary>

- ✅ procurement and inventory records a delivery as one transaction: header + lines + one inventory lot per line, cost computed server-side
- ✅ procurement and inventory writes NOTHING when one line is invalid (atomic rollback)
- ✅ procurement and inventory validates quantities and duplicate lines; duplicate invoices are a 409
- ✅ service sessions, preparation and consumption opens a session, adds a batch and refuses duplicates and future dates
- ✅ service sessions, preparation and consumption refuses another establishment's session and another establishment's dishes (tenant scoping)
- ✅ service sessions, preparation and consumption closing with served + leftover > prepared is rejected by the DB trigger and rolls everything back
- ✅ service sessions, preparation and consumption requires consumption for every batch, then closes atomically; a closed session is immutable
- ✅ waste recording deducts the lot and derives cost/CO2e in the database (trigger), in one transaction
- ✅ waste recording refuses to write off more than the lot holds, a lot from another establishment, a future date and a system reason
- ✅ surplus listings, claims and redistribution full lifecycle: list -> claim -> approve -> collect, with quantities, statuses and the redistribution record
- ✅ surplus listings, claims and redistribution no-show releases the reserved quantity; cancelling a listing rejects its pending requests
- ✅ surplus listings, claims and redistribution two simultaneous approvals that together exceed the listing: exactly one succeeds (row locking)
- ✅ surplus listings, claims and redistribution claims are validated: accepts-cooked rule, capacity, expired and unavailable listings
- ✅ surplus listings, claims and redistribution validates listing input: description, quantity and time window
- ✅ surplus listings, claims and redistribution ranks only FEASIBLE recipients by hybrid score; the recipient feed applies the same hard filters
- ✅ surplus listings, claims and redistribution claims and listings are scoped to the caller's side
- ✅ dashboard and zone analytics use live database numbers each role gets its own dashboard shape with non-hardcoded figures
- ✅ dashboard and zone analytics use live database numbers zone roll-up aggregates children into parents (recursive CTE) and is restricted to authority roles

</details>


# Data model

Schema source of truth: `db/migrations/*.sql`. Generated companions: [ER_DIAGRAM.md](ER_DIAGRAM.md) and
[DATA_DICTIONARY.md](DATA_DICTIONARY.md) (both produced from the live catalog; the test-suite fails if they drift).

## 1. What lives where

| Data | Store | Reason |
|---|---|---|
| Zones, establishments, users, food catalogue, procurement, inventory, dishes, sessions, batches, consumption, waste, listings, claims, events, audit | **PostgreSQL** | Every row is a quantity that must balance or a reference that must resolve; needs CHECKs, FKs, triggers, ACID transactions (e.g. two NGOs racing for the same 12 kg). |
| `waste_submissions` | **MongoDB** | Raw daily field logs whose shape depends on establishment kind. Raw stays in Mongo (audit trail, re-processable); a Part 2 ETL projects the validated common subset into `waste_event`. |
| `inspection_reports` | MongoDB | Nested checklists whose sections change between audit rounds — a relational schema would need a migration each round. |
| `bin_readings` | MongoDB (time-series collection) | Append-only sensor-like series with native bucketing; no joins. |
| `establishment_meta` | MongoDB | Opening hours, tags, seasonal notes: ~60% of attributes would be NULL relationally because every kind differs. |
| `activity_stream` | MongoDB (capped) | High-write, insert-only UI event log, bounded by size. |
| Embeddings | PostgreSQL `vector(384)` columns | Same engine as the facts they describe, so similarity search can be combined with relational filters. Populated by the local embedding backfill (`npm run demo:prepare` or the Data sync page); rows stay valid with NULL embeddings if the model is unavailable. |

MongoDB never duplicates the relational schema: the only join key is `establishment_id` (and
`waste_event.source_doc_id` ↔ Mongo `_id`, with `sql_waste_ids` pointing back).

## 2. Relational design (28 domain tables)

Groups (see the diagram for all columns and keys):

* **Geography & entities** — `zone` (self-referencing sector 1 > block 2 > street 3, level 4 reserved),
  `establishment_category`, `establishment` (supertype), and three disjoint 1:1 subtypes
  `commercial_profile` / `institutional_profile` / `residential_profile` (PK = FK).
  Subtype mapping: COMMERCIAL, RETAIL_FOOD, RECREATIONAL → commercial; EDUCATIONAL, ORGANIZATIONAL, HEALTHCARE →
  institutional; RESIDENTIAL → residential (verified by `verify_db.py`: exactly one profile per establishment).
* **Identity** — `recipient_org`, `app_user` (`ck_user_scope` ties each role to the correct tenant column), `audit_log`.
* **Food & inflow** — `food_category`, `emission_factor` (1:1 with category), `food_item`, `supplier`,
  `procurement` → `procurement_line` → `inventory_lot`.
* **Preparation & service** — `dish`, `dish_ingredient` (M:N), `service_session`, `preparation_batch`,
  `consumption_record` (1:1 with batch).
* **Waste** — `waste_reason`, `disposal_route`, `waste_event` (**fact table**, RANGE-partitioned monthly on `occurred_on`;
  27 monthly partitions 2025-10 … 2027-12 plus a DEFAULT partition).
* **Redistribution** — `surplus_listing`, `redistribution_claim`.
* **Context** — `locality_event`, `zone_event` (M:N).

Forecasting tables (`forecast_model`, `demand_forecast`), `user_session`, `waste_cause_cluster` and the Part C/T4 tables are Part 4 (optional) and not created. `etl_run_log` and `food_alias` were added in Part 2 (migrations 012-013).

### Integrity rules enforced in the database

| Rule | Mechanism |
|---|---|
| Quantities positive / non-negative, ranges, enums | `CHECK`, ENUM types |
| `claimed_qty ≤ offered_qty`, `remaining ≤ received`, `expires > received` | `ck_listing_balance`, `ck_lot_balance`, `ck_lot_dates`, `ck_listing_window` |
| A closed session must have an actual headcount | `ck_closed_has_actuals` |
| A COLLECTED claim must have a collection time | `ck_collected` |
| Role ↔ tenant coherence (manager needs an establishment, recipient agent needs an org, admin needs neither) | `ck_user_scope` |
| Occupants ≥ households | `ck_occupants_ge_households` |
| Zone cannot be its own parent; root names unique | `ck_zone_not_self`, partial unique index `uq_zone_root_name` |
| One session per (establishment, date, slot); one claim per (listing, recipient); one dish per (establishment, name) | `UNIQUE` constraints |
| Cannot delete a zone that still has establishments | `ON DELETE RESTRICT` |
| `served + leftover ≤ prepared`, `plate waste ≤ served` (cross-table) | trigger `tr_consumption_balance` (migration 009) |
| Cost and CO₂e on waste rows are always derived from the catalogue | trigger `tr_waste_enrich` (migration 009) |
| No future-dated waste | `ck_waste_not_future` |

Added in Part 3 (migrations 014-018): `measurement_source` + `ck_waste_measurement_source` (ALTER); inventory ledger T3 (stock leaves a lot exactly once), audit T4, claim state machine T5, listing guard T6; functions `fn_claim_surplus`, `fn_transition_claim`, procedure `sp_close_service_session`; views `v_daily_waste`, `v_preparation_efficiency`, `v_redistribution_performance`, materialised view `mv_zone_monthly`. See [ADVANCED_DBMS.md](ADVANCED_DBMS.md) and the generated [DB_OBJECTS.md](DB_OBJECTS.md).

### Normalisation (report note)

Starting from the raw Mongo submission `{establishment_name, address, zone, items:[{food_name, category, kg, reason_text, disposal}]}`:
**1NF** — flatten `items[]` to one row per item (no repeating groups). **2NF** — establishment name, address and zone depend
only on the establishment, so they move to `establishment`. **3NF** — food category and emission factor depend on the food item
(transitively on `food_id`), not on the waste event, so they move to `food_item` / `food_category` / `emission_factor`.
`waste_event` keeps only facts about the occurrence plus foreign keys.
*Deliberate denormalisation:* `waste_event.cost_estimate` and `co2e_estimate` are derived (`quantity × unit cost/factor`) but stored,
because prices drift and a report for an earlier month must reproduce that month's numbers; the trigger guarantees they are
never inconsistent at write time.

### Indexes (migration 008, 23 indexes + `uq_zone_root_name`)

* Fact table: `idx_waste_estab_date (establishment_id, occurred_on DESC)` for dashboards; `idx_waste_food_date` for "top wasted foods";
  `idx_waste_stage_cover (occurred_on, stage) INCLUDE (quantity_kg, establishment_id)` for index-only stage breakdowns.
* Partial: `idx_listing_open` (only claimable listings), `idx_lot_expiry` (only lots with stock).
* Search: GIN `idx_food_fts` (tsvector) and `idx_food_trgm` (typo tolerance); HNSW cosine indexes on the four vector columns.
* `idx_audit_brin` — BRIN for the append-only audit table.
* Join-path indexes on the remaining foreign keys that the planned queries traverse.
Part 3 additions: partial `idx_waste_lot` (migration 018). `idx_wastenote_vec` was dropped (migration 014; its column is NULL everywhere). Measured before/after evidence: [EXPLAIN_EVIDENCE.md](EXPLAIN_EVIDENCE.md).

## 3. MongoDB design

Created idempotently by `scripts/mongo_init.py`.

| Collection | Shape | Indexes / options |
|---|---|---|
| `waste_submissions` | Common envelope `{establishment_id, estab_kind, service_date, submitted_at, sync_status, payload, [submitted_by, sql_waste_ids, sync_error]}` validated by `$jsonSchema`; **`payload` is free-form per kind** | `(establishment_id, service_date)`, **ETL queue** `(sync_status, submitted_at)`, multikey `payload.dish_waste.dish_name`, text `payload.free_text` |
| `inspection_reports` | `{establishment_id, inspected_at, sections[{name, items[]}], template_version, photos?}` | `(establishment_id, inspected_at)`; validator |
| `bin_readings` | `{ts, meta:{bin_id, establishment_id, stream}, weight_kg, fill_pct}` | time-series (`timeField: ts`, `metaField: meta`, minutes), `(meta.bin_id, ts)` |
| `establishment_meta` | arbitrary per-kind attributes | unique `establishment_id` |
| `activity_stream` | `{user_id, ts, event, details{...}}` | capped (5 MB / 5000 docs), `(user_id, ts)` |

Example payload shapes in the seed (15 distinct key-sets across 7 establishment kinds):
restaurant `{slot, covers_served, dish_waste[{dish_name, portions_prepared, portions_sold, returned_plates, avg_plate_leftover_g}], buffet_counter_leftovers_kg?, raw_spoilage?[]}`;
household `{bins{vegetable_peels_kg, cooked_leftovers_kg?, expired_packaged_kg?}, segregated, occupants_present, photo_url?, free_text?}`;
college `{meal_slot, headcount{present, guests}, counters[{counter, plates_served, leftover_kg}], exam_day?}`;
supermarket `{skus[{barcode, sku_name, markdown_pct, units_expiring, units_discarded}], chiller_temp_c?}`;
hospital `{ward_meals[], diet_types{}}`; and more. Dish names are deliberately messy (`Veg Biriyani`, `VEG. BIRYANI`,
`Panner Butter Masala`) so the Part 2 name-resolution step has something to resolve.

Sync lifecycle (`sync_status`): `PENDING` → `SYNCED` (with `sql_waste_ids`, `synced_at`) or `FAILED` (with `sync_error`,
`sync_attempts`). The seed contains a PENDING backlog for the ETL to process, ~200 SYNCED documents whose SQL rows exist
with matching `source_doc_id`, and ~34 FAILED ones. The ETL is described in ARCHITECTURE.md (data flow 2).

## 4. Seed data

Generated by `scripts/seed.py` (deterministic for a given `--rng-seed` and `--end-date`). See the script header for the planted
signals and `scripts/seed_catalog.py` for the (fictional) names. Scale is deliberately smaller than the plan's 450k-row target:
quick on a laptop (~10 s) yet large enough for meaningful joins, windows, partition pruning and dashboards.

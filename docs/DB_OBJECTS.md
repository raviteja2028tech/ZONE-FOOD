# Database object inventory

_Generated 2026-11-01 17:24 from the live catalogue (`pg_class`, `pg_index`, `pg_proc`, `pg_trigger`). The app's DBMS Lab → Objects tab shows the same, live._

Extensions: pg_trgm 1.6, plpgsql 1.0, vector 0.8.7.

## Tables (31; `waste_event` has 28 partitions)

| Table | Kind | ≈ rows |
|---|---|---|
| app_user | table | 80 |
| audit_log | table | 1 |
| commercial_profile | table | 20 |
| consumption_record | table | 21975 |
| dish | table | 264 |
| dish_ingredient | table | 835 |
| disposal_route | table | 5 |
| emission_factor | table | 15 |
| establishment | table | 56 |
| establishment_category | table | 13 |
| etl_run_log | table | 2 |
| food_alias | table | 18 |
| food_category | table | 15 |
| food_item | table | 81 |
| institutional_profile | table | 12 |
| inventory_lot | table | 19873 |
| locality_event | table | 6 |
| preparation_batch | table | 21986 |
| procurement | table | 7895 |
| procurement_line | table | 19873 |
| recipient_org | table | 8 |
| redistribution_claim | table | 3936 |
| residential_profile | table | 24 |
| schema_migrations | table | 18 |
| service_session | table | 9510 |
| supplier | table | 9 |
| surplus_listing | table | 4430 |
| waste_event | partitioned | 55537 |
| waste_reason | table | 10 |
| zone | table | 31 |
| zone_event | table | 7 |

## Views and materialised views (4)

| Name | Kind | Comment |
|---|---|---|
| mv_zone_monthly | materialized view | Street-level waste by month and kind. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly. |
| v_daily_waste | view | Per-establishment per-day waste (excl. redistributed food), edible/diverted split, cost, CO2e, per-capita. |
| v_preparation_efficiency | view | Per closed session: prepared vs served kg, utilisation %, turnout % vs expected headcount. |
| v_redistribution_performance | view | Per establishment: listings, offered/reserved/collected kg, rescue rate, hours to first pickup. |

## Indexes on parent tables (77)

| Index | Table | Method | Partial | Unique | Size |
|---|---|---|---|---|---|
| app_user_email_key | app_user | btree |  | yes | 16 kB |
| app_user_pkey | app_user | btree |  | yes | 16 kB |
| idx_user_establishment | app_user | btree | yes |  | 16 kB |
| idx_user_recipient | app_user | btree | yes |  | 16 kB |
| audit_log_pkey | audit_log | btree |  | yes | 16 kB |
| idx_audit_brin | audit_log | brin |  |  | 24 kB |
| commercial_profile_fssai_license_key | commercial_profile | btree |  | yes | 16 kB |
| commercial_profile_pkey | commercial_profile | btree |  | yes | 16 kB |
| consumption_record_pkey | consumption_record | btree |  | yes | 496 kB |
| dish_pkey | dish | btree |  | yes | 16 kB |
| uq_dish | dish | btree |  | yes | 32 kB |
| dish_ingredient_pkey | dish_ingredient | btree |  | yes | 40 kB |
| disposal_route_pkey | disposal_route | btree |  | yes | 16 kB |
| disposal_route_route_name_key | disposal_route | btree |  | yes | 16 kB |
| emission_factor_pkey | emission_factor | btree |  | yes | 16 kB |
| establishment_pkey | establishment | btree |  | yes | 16 kB |
| idx_establishment_category | establishment | btree |  |  | 16 kB |
| idx_establishment_zone | establishment | btree |  |  | 16 kB |
| uq_estab_name_zone | establishment | btree |  | yes | 16 kB |
| establishment_category_category_name_key | establishment_category | btree |  | yes | 16 kB |
| establishment_category_pkey | establishment_category | btree |  | yes | 16 kB |
| etl_run_log_pkey | etl_run_log | btree |  | yes | 16 kB |
| idx_etl_run_started | etl_run_log | btree |  |  | 16 kB |
| food_alias_pkey | food_alias | btree |  | yes | 16 kB |
| food_alias_raw_name_norm_key | food_alias | btree |  | yes | 16 kB |
| idx_alias_food | food_alias | btree | yes |  | 16 kB |
| idx_alias_unresolved | food_alias | btree | yes |  | 16 kB |
| food_category_category_name_key | food_category | btree |  | yes | 16 kB |
| food_category_pkey | food_category | btree |  | yes | 16 kB |
| food_item_canonical_name_key | food_item | btree |  | yes | 16 kB |
| food_item_pkey | food_item | btree |  | yes | 16 kB |
| idx_food_fts | food_item | gin |  |  | 40 kB |
| idx_food_name_vec | food_item | hnsw |  |  | 176 kB |
| idx_food_trgm | food_item | gin |  |  | 88 kB |
| institutional_profile_pkey | institutional_profile | btree |  | yes | 16 kB |
| idx_lot_expiry | inventory_lot | btree | yes |  | 16 kB |
| idx_lot_food | inventory_lot | btree |  |  | 192 kB |
| inventory_lot_pkey | inventory_lot | btree |  | yes | 456 kB |
| locality_event_pkey | locality_event | btree |  | yes | 16 kB |
| uq_mv_zone_monthly | mv_zone_monthly | btree |  | yes | 16 kB |
| preparation_batch_pkey | preparation_batch | btree |  | yes | 496 kB |
| uq_batch | preparation_batch | btree |  | yes | 696 kB |
| idx_procurement_estab_date | procurement | btree |  |  | 352 kB |
| procurement_pkey | procurement | btree |  | yes | 192 kB |
| uq_invoice | procurement | btree |  | yes | 440 kB |
| idx_proc_line_food | procurement_line | btree |  |  | 192 kB |
| procurement_line_pkey | procurement_line | btree |  | yes | 456 kB |
| uq_proc_line | procurement_line | btree |  | yes | 632 kB |
| idx_recipient_vec | recipient_org | hnsw |  |  | 24 kB |
| recipient_org_org_name_key | recipient_org | btree |  | yes | 16 kB |
| recipient_org_pkey | recipient_org | btree |  | yes | 16 kB |
| idx_claim_recipient | redistribution_claim | btree |  |  | 56 kB |
| redistribution_claim_pkey | redistribution_claim | btree |  | yes | 104 kB |
| uq_claim | redistribution_claim | btree |  | yes | 136 kB |
| residential_profile_pkey | residential_profile | btree |  | yes | 16 kB |
| schema_migrations_pkey | schema_migrations | btree |  | yes | 16 kB |
| idx_session_estab_date | service_session | btree |  |  | 256 kB |
| service_session_pkey | service_session | btree |  | yes | 224 kB |
| uq_session | service_session | btree |  | yes | 312 kB |
| supplier_pkey | supplier | btree |  | yes | 16 kB |
| idx_listing_estab | surplus_listing | btree |  |  | 184 kB |
| idx_listing_open | surplus_listing | btree | yes |  | 16 kB |
| idx_listing_vec | surplus_listing | hnsw |  |  | 56 kB |
| surplus_listing_pkey | surplus_listing | btree |  | yes | 120 kB |
| idx_waste_estab_date | waste_event | btree |  |  | 0 bytes |
| idx_waste_food_date | waste_event | btree |  |  | 0 bytes |
| idx_waste_lot | waste_event | btree | yes |  | 0 bytes |
| idx_waste_source_doc | waste_event | btree | yes |  | 0 bytes |
| idx_waste_stage_cover | waste_event | btree |  |  | 0 bytes |
| waste_event_pkey | waste_event | btree |  | yes | 0 bytes |
| waste_reason_pkey | waste_reason | btree |  | yes | 16 kB |
| waste_reason_reason_code_key | waste_reason | btree |  | yes | 16 kB |
| idx_zone_parent | zone | btree |  |  | 16 kB |
| uq_zone_name_parent | zone | btree |  | yes | 16 kB |
| uq_zone_root_name | zone | btree | yes | yes | 16 kB |
| zone_pkey | zone | btree |  | yes | 16 kB |
| zone_event_pkey | zone_event | btree |  | yes | 16 kB |

## Functions and procedures (141)

| Name | Kind | Arguments | Purpose |
|---|---|---|---|
| sp_close_service_session | procedure | IN p_session bigint, IN p_establishment integer, IN p_actual_headcount integer, IN p_user integer, IN p_records jsonb, … | Close a session atomically: consumption, plate-waste events, auto surplus listings. |
| array_to_halfvec | function | double precision[], integer, boolean | convert float8 array to halfvec |
| array_to_halfvec | function | numeric[], integer, boolean | convert numeric array to halfvec |
| array_to_halfvec | function | integer[], integer, boolean | convert int4 array to halfvec |
| array_to_halfvec | function | real[], integer, boolean | convert float4 array to halfvec |
| array_to_sparsevec | function | double precision[], integer, boolean | convert float8 array to sparsevec |
| array_to_sparsevec | function | numeric[], integer, boolean | convert numeric array to sparsevec |
| array_to_sparsevec | function | integer[], integer, boolean | convert int4 array to sparsevec |
| array_to_sparsevec | function | real[], integer, boolean | convert float4 array to sparsevec |
| array_to_vector | function | double precision[], integer, boolean | convert float8 array to vector |
| array_to_vector | function | numeric[], integer, boolean | convert numeric array to vector |
| array_to_vector | function | real[], integer, boolean | convert float4 array to vector |
| array_to_vector | function | integer[], integer, boolean | convert int4 array to vector |
| binary_quantize | function | vector | binary quantize |
| binary_quantize | function | halfvec | binary quantize |
| cosine_distance | function | halfvec, halfvec | cosine distance |
| cosine_distance | function | sparsevec, sparsevec | cosine distance |
| cosine_distance | function | vector, vector | cosine distance |
| fn_claim_surplus | function | p_listing bigint, p_recipient integer, p_qty numeric, p_score numeric | Locks the listing, validates every hard rule, inserts a REQUESTED claim. |
| fn_ensure_waste_partitions | function | p_months_ahead integer | Create monthly waste_event partitions for the next N months if missing. |
| fn_search_food | function | p_q text, p_limit integer | Full-text + trigram + substring food search, best match first. |
| fn_transition_claim | function | p_claim bigint, p_action text, p_establishment integer, p_recipient integer | approve/reject/collect/no_show with stock reservation and the redistribution record. |
| fn_waste_intensity | function | p_estab integer, p_from date, p_to date | kg wasted per kg served for an establishment and window; NULL if nothing served. |
| gin_extract_query_trgm | function | text, internal, smallint, internal, internal, internal, internal |  |
| gin_extract_value_trgm | function | text, internal |  |
| gin_trgm_consistent | function | internal, smallint, text, integer, internal, internal, internal, internal |  |
| gin_trgm_triconsistent | function | internal, smallint, text, integer, internal, internal, internal |  |
| halfvec | function | halfvec, integer, boolean | adjust halfvec to typmod |
| halfvec_accum | function | double precision[], halfvec | aggregate transition function |
| halfvec_add | function | halfvec, halfvec | implementation of + operator |
| halfvec_avg | function | double precision[] | aggregate final function |
| halfvec_cmp | function | halfvec, halfvec | less-equal-greater |
| halfvec_combine | function | double precision[], double precision[] | aggregate combine function |
| halfvec_concat | function | halfvec, halfvec | implementation of \|\| operator |
| halfvec_eq | function | halfvec, halfvec | implementation of = operator |
| halfvec_ge | function | halfvec, halfvec | implementation of >= operator |
| halfvec_gt | function | halfvec, halfvec | implementation of > operator |
| halfvec_in | function | cstring, oid, integer | I/O |
| halfvec_l2_squared_distance | function | halfvec, halfvec | squared Euclidean distance |
| halfvec_le | function | halfvec, halfvec | implementation of <= operator |
| halfvec_lt | function | halfvec, halfvec | implementation of < operator |
| halfvec_mul | function | halfvec, halfvec | implementation of * operator |
| halfvec_ne | function | halfvec, halfvec | implementation of <> operator |
| halfvec_negative_inner_product | function | halfvec, halfvec | negative inner product |
| halfvec_out | function | halfvec | I/O |
| halfvec_recv | function | internal, oid, integer | I/O |
| halfvec_send | function | halfvec | I/O |
| halfvec_spherical_distance | function | halfvec, halfvec | spherical distance |
| halfvec_sub | function | halfvec, halfvec | implementation of - operator |
| halfvec_to_float4 | function | halfvec, integer, boolean | convert halfvec to float4 array |
| halfvec_to_sparsevec | function | halfvec, integer, boolean | convert halfvec to sparsevec |
| halfvec_to_vector | function | halfvec, integer, boolean | convert halfvec to vector |
| halfvec_typmod_in | function | cstring[] | I/O typmod |
| hamming_distance | function | bit, bit | Hamming distance |
| hnsw_bit_support | function | internal | hnsw bit support |
| hnsw_halfvec_support | function | internal | hnsw halfvec support |
| hnsw_sparsevec_support | function | internal | hnsw sparsevec support |
| hnswhandler | function | internal | hnsw index access method handler |
| inner_product | function | halfvec, halfvec | inner product |
| inner_product | function | sparsevec, sparsevec | inner product |
| inner_product | function | vector, vector | inner product |
| ivfflat_bit_support | function | internal | ivfflat bit support |
| ivfflat_halfvec_support | function | internal | ivfflat halfvec support |
| ivfflathandler | function | internal | ivfflat index access method handler |
| jaccard_distance | function | bit, bit | Jaccard distance |
| l1_distance | function | sparsevec, sparsevec | taxicab distance |
| l1_distance | function | halfvec, halfvec | taxicab distance |
| l1_distance | function | vector, vector | taxicab distance |
| l2_distance | function | sparsevec, sparsevec | Euclidean distance |
| l2_distance | function | halfvec, halfvec | Euclidean distance |
| l2_distance | function | vector, vector | Euclidean distance |
| l2_norm | function | sparsevec | Euclidean norm |
| l2_norm | function | halfvec | Euclidean norm |
| l2_normalize | function | halfvec | normalize with Euclidean norm |
| l2_normalize | function | vector | normalize with Euclidean norm |
| l2_normalize | function | sparsevec | normalize with Euclidean norm |
| set_limit | function | real |  |
| show_limit | function |  |  |
| show_trgm | function | text |  |
| similarity | function | text, text |  |
| similarity_dist | function | text, text |  |
| similarity_op | function | text, text |  |
| sparsevec | function | sparsevec, integer, boolean | adjust sparsevec to typmod |
| sparsevec_cmp | function | sparsevec, sparsevec | less-equal-greater |
| sparsevec_eq | function | sparsevec, sparsevec | implementation of = operator |
| sparsevec_ge | function | sparsevec, sparsevec | implementation of >= operator |
| sparsevec_gt | function | sparsevec, sparsevec | implementation of > operator |
| sparsevec_in | function | cstring, oid, integer | I/O |
| sparsevec_l2_squared_distance | function | sparsevec, sparsevec | squared Euclidean distance |
| sparsevec_le | function | sparsevec, sparsevec | implementation of <= operator |
| sparsevec_lt | function | sparsevec, sparsevec | implementation of < operator |
| sparsevec_ne | function | sparsevec, sparsevec | implementation of <> operator |
| sparsevec_negative_inner_product | function | sparsevec, sparsevec | negative inner product |
| sparsevec_out | function | sparsevec | I/O |
| sparsevec_recv | function | internal, oid, integer | I/O |
| sparsevec_send | function | sparsevec | I/O |
| sparsevec_to_halfvec | function | sparsevec, integer, boolean | convert sparsevec to halfvec |
| sparsevec_to_vector | function | sparsevec, integer, boolean | convert sparsevec to vector |
| sparsevec_typmod_in | function | cstring[] | I/O typmod |
| strict_word_similarity | function | text, text |  |
| strict_word_similarity_commutator_op | function | text, text |  |
| strict_word_similarity_dist_commutator_op | function | text, text |  |
| strict_word_similarity_dist_op | function | text, text |  |
| strict_word_similarity_op | function | text, text |  |
| subvector | function | halfvec, integer, integer | subvector |
| subvector | function | vector, integer, integer | subvector |
| vector | function | vector, integer, boolean | adjust vector to typmod |
| vector_accum | function | double precision[], vector | aggregate transition function |
| vector_add | function | vector, vector | implementation of + operator |
| vector_avg | function | double precision[] | aggregate final function |
| vector_cmp | function | vector, vector | less-equal-greater |
| vector_combine | function | double precision[], double precision[] | aggregate combine function |
| vector_concat | function | vector, vector | implementation of \|\| operator |
| vector_dims | function | halfvec | number of dimensions |
| vector_dims | function | vector | number of dimensions |
| vector_eq | function | vector, vector | implementation of = operator |
| vector_ge | function | vector, vector | implementation of >= operator |
| vector_gt | function | vector, vector | implementation of > operator |
| vector_in | function | cstring, oid, integer | I/O |
| vector_l2_squared_distance | function | vector, vector | squared Euclidean distance |
| vector_le | function | vector, vector | implementation of <= operator |
| vector_lt | function | vector, vector | implementation of < operator |
| vector_mul | function | vector, vector | implementation of * operator |
| vector_ne | function | vector, vector | implementation of <> operator |
| vector_negative_inner_product | function | vector, vector | negative inner product |
| vector_norm | function | vector | Euclidean norm |
| vector_out | function | vector | I/O |
| vector_recv | function | internal, oid, integer | I/O |
| vector_send | function | vector | I/O |
| vector_spherical_distance | function | vector, vector | spherical distance |
| vector_sub | function | vector, vector | implementation of - operator |
| vector_to_float4 | function | vector, integer, boolean | convert vector to float4 array |
| vector_to_halfvec | function | vector, integer, boolean | convert vector to halfvec |
| vector_to_sparsevec | function | vector, integer, boolean | convert vector to sparsevec |
| vector_typmod_in | function | cstring[] | I/O typmod |
| word_similarity | function | text, text |  |
| word_similarity_commutator_op | function | text, text |  |
| word_similarity_dist_commutator_op | function | text, text |  |
| word_similarity_dist_op | function | text, text |  |
| word_similarity_op | function | text, text |  |
| zone_root | function | p_zone_id integer | Top-level ancestor of a zone (recursive CTE over zone.parent_zone_id). |

## Triggers (11)

| Trigger | Table | Timing | Events | Function |
|---|---|---|---|---|
| tr_consumption_balance | consumption_record | BEFORE | INSERT OR UPDATE | trg_validate_consumption |
| tr_audit_establishment | establishment | AFTER | INSERT OR DELETE OR UPDATE | trg_audit |
| tr_audit_recipient | recipient_org | AFTER | INSERT OR DELETE OR UPDATE | trg_audit |
| tr_audit_claim | redistribution_claim | AFTER | INSERT OR DELETE OR UPDATE | trg_audit |
| tr_claim_guard | redistribution_claim | BEFORE | UPDATE | trg_claim_guard |
| tr_audit_listing | surplus_listing | AFTER | INSERT OR DELETE OR UPDATE | trg_audit |
| tr_listing_guard | surplus_listing | BEFORE | UPDATE | trg_listing_guard |
| tr_lot_ledger_del | waste_event | BEFORE | DELETE | trg_lot_ledger |
| tr_lot_ledger_ins | waste_event | BEFORE | INSERT | trg_lot_ledger |
| tr_lot_ledger_upd | waste_event | BEFORE | UPDATE | trg_lot_ledger |
| tr_waste_enrich | waste_event | BEFORE | INSERT | trg_enrich_waste |

-- 016: stored functions and procedures.
--
-- Error convention (mapped to HTTP statuses by the application):
--   P0002 (no_data_found)             -> 404   the record does not exist or is not yours
--   55000 (object_not_in_prereq_state)-> 409   the record is in the wrong state (expired, closed, illegal transition)
--   23514 (check_violation)           -> 422   a business rule refuses the input
--   42501 (insufficient_privilege)    -> 403   the caller's side may not perform this action
--   23505 (unique_violation)          -> 409   duplicate (raised by constraints, e.g. uq_claim)

-- 1. Reusable metric: kg wasted per kg served for one establishment over a window (NULL when nothing was served).
CREATE OR REPLACE FUNCTION fn_waste_intensity(p_estab INT, p_from DATE, p_to DATE)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE v_waste NUMERIC; v_served NUMERIC;
BEGIN
  SELECT COALESCE(SUM(w.quantity_kg), 0) INTO v_waste
    FROM waste_event w JOIN waste_reason r ON r.reason_id = w.reason_id
   WHERE w.establishment_id = p_estab AND r.reason_code <> 'REDISTRIBUTED'
     AND w.occurred_on BETWEEN p_from AND p_to;
  SELECT COALESCE(SUM(cr.served_qty_kg), 0) INTO v_served
    FROM consumption_record cr
    JOIN preparation_batch pb ON pb.batch_id = cr.batch_id
    JOIN service_session ss ON ss.session_id = pb.session_id
   WHERE ss.establishment_id = p_estab AND ss.service_date BETWEEN p_from AND p_to;
  IF v_served = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(v_waste / v_served, 4);
END $$;

-- 2. Typo-tolerant food search: full-text rank, trigram similarity and substring, best first.
CREATE OR REPLACE FUNCTION fn_search_food(p_q TEXT, p_limit INT DEFAULT 15)
RETURNS TABLE (food_id INT, canonical_name VARCHAR, category_name VARCHAR, base_unit VARCHAR,
               avg_cost_per_unit NUMERIC, is_edible_as_is BOOLEAN, has_embedding BOOLEAN, score REAL)
LANGUAGE sql STABLE AS $$
  SELECT f.food_id, f.canonical_name, c.category_name, f.base_unit, f.avg_cost_per_unit, f.is_edible_as_is,
         f.name_embedding IS NOT NULL,
         GREATEST(ts_rank(f.search_doc, plainto_tsquery('english', p_q)), similarity(f.canonical_name, p_q))::real
    FROM food_item f JOIN food_category c USING (food_category_id)
   WHERE f.search_doc @@ plainto_tsquery('english', p_q)
      OR f.canonical_name % p_q                                   -- pg_trgm: uses idx_food_trgm
      OR position(lower(p_q) IN lower(f.canonical_name)) > 0
   ORDER BY (lower(f.canonical_name) = lower(p_q)) DESC,
            GREATEST(ts_rank(f.search_doc, plainto_tsquery('english', p_q)), similarity(f.canonical_name, p_q)) DESC,
            f.canonical_name
   LIMIT p_limit
$$;

-- 3. Concurrency-safe claim request. The listing row is locked FOR UPDATE, so competing claimants are serialised
--    and each sees the quantity left by the previous one. Every hard rule lives here, not in the application.
--    A request does not reserve stock; approval does (fn_transition_claim).
CREATE OR REPLACE FUNCTION fn_claim_surplus(p_listing BIGINT, p_recipient INT, p_qty NUMERIC, p_score NUMERIC DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE l RECORD; r RECORD; v_remaining NUMERIC; v_claim BIGINT;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Claim quantity must be greater than 0' USING ERRCODE = 'check_violation';
  END IF;
  SELECT sl.offered_qty_kg, sl.claimed_qty_kg, sl.is_cooked, sl.available_from, sl.expires_at, sl.status,
         e.zone_id AS est_zone, e.is_active
    INTO l
    FROM surplus_listing sl JOIN establishment e ON e.establishment_id = sl.establishment_id
   WHERE sl.listing_id = p_listing
     FOR UPDATE OF sl;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surplus listing not found' USING ERRCODE = 'P0002'; END IF;

  SELECT zone_id, accepts_cooked, daily_capacity_kg INTO r FROM recipient_org WHERE recipient_id = p_recipient;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipient organisation not found' USING ERRCODE = 'P0002'; END IF;

  IF l.status = 'CANCELLED' OR NOT l.is_active THEN
    RAISE EXCEPTION 'This listing is no longer available (cancelled).' USING ERRCODE = '55000';
  ELSIF l.claimed_qty_kg >= l.offered_qty_kg THEN
    RAISE EXCEPTION 'This listing is no longer available (fully claimed).' USING ERRCODE = '55000';
  ELSIF l.expires_at <= now() THEN
    RAISE EXCEPTION 'This listing is no longer available (expired).' USING ERRCODE = '55000';
  ELSIF l.available_from > now() THEN
    RAISE EXCEPTION 'This listing is not yet available for pickup.' USING ERRCODE = '55000';
  END IF;
  IF zone_root(r.zone_id) IS DISTINCT FROM zone_root(l.est_zone) THEN
    RAISE EXCEPTION 'This listing is outside your organisation''s locality.' USING ERRCODE = 'check_violation';
  END IF;
  IF l.is_cooked AND NOT r.accepts_cooked THEN
    RAISE EXCEPTION 'Your organisation does not accept cooked food.' USING ERRCODE = 'check_violation';
  END IF;
  v_remaining := l.offered_qty_kg - l.claimed_qty_kg;
  IF p_qty > v_remaining THEN
    RAISE EXCEPTION 'Only % kg remain on this listing.', ROUND(v_remaining, 1) USING ERRCODE = 'check_violation';
  END IF;
  IF p_qty > r.daily_capacity_kg THEN
    RAISE EXCEPTION 'Your daily capacity is % kg.', ROUND(r.daily_capacity_kg, 1) USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO redistribution_claim (listing_id, recipient_id, claimed_qty_kg, match_score, status)
  VALUES (p_listing, p_recipient, p_qty, p_score, 'REQUESTED')   -- uq_claim turns a duplicate into 23505
  RETURNING claim_id INTO v_claim;
  RETURN v_claim;
END $$;

-- 4. Claim lifecycle: approve | reject | collect | no_show.
--    Lock order is ALWAYS listing then claim, so concurrent transitions cannot deadlock.
--    approve reserves stock (re-checked under the lock), no_show releases it, collect writes the redistribution record.
--    The side calling is identified by p_establishment / p_recipient (the application passes the session's ids);
--    anyone who is neither the offering establishment nor the claiming recipient gets "not found".
CREATE OR REPLACE FUNCTION fn_transition_claim(p_claim BIGINT, p_action TEXT, p_establishment INT, p_recipient INT)
RETURNS TABLE (o_claim_status claim_status, o_listing_status listing_status) LANGUAGE plpgsql AS $$
DECLARE v_listing BIGINT; l RECORD; c RECORD; v_next claim_status; v_claimed NUMERIC; v_lstatus listing_status; v_org TEXT;
BEGIN
  SELECT rc.listing_id INTO v_listing FROM redistribution_claim rc WHERE rc.claim_id = p_claim;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found' USING ERRCODE = 'P0002'; END IF;

  SELECT sl.establishment_id, sl.offered_qty_kg, sl.claimed_qty_kg, sl.expires_at, sl.status, sl.food_id
    INTO l FROM surplus_listing sl WHERE sl.listing_id = v_listing FOR UPDATE;
  SELECT rc.recipient_id, rc.claimed_qty_kg, rc.status
    INTO c FROM redistribution_claim rc WHERE rc.claim_id = p_claim FOR UPDATE;

  IF NOT ((p_establishment IS NOT NULL AND p_establishment = l.establishment_id)
       OR (p_recipient IS NOT NULL AND p_recipient = c.recipient_id)) THEN
    RAISE EXCEPTION 'Claim not found' USING ERRCODE = 'P0002';    -- never reveal other tenants' claims
  END IF;
  IF p_action IN ('approve', 'reject', 'no_show') AND p_establishment IS DISTINCT FROM l.establishment_id THEN
    RAISE EXCEPTION 'Only the offering establishment can % a claim', p_action USING ERRCODE = '42501';
  END IF;

  v_next := CASE
    WHEN c.status = 'REQUESTED' AND p_action = 'approve' THEN 'APPROVED'::claim_status
    WHEN c.status = 'REQUESTED' AND p_action = 'reject'  THEN 'REJECTED'::claim_status
    WHEN c.status = 'APPROVED'  AND p_action = 'collect' THEN 'COLLECTED'::claim_status
    WHEN c.status = 'APPROVED'  AND p_action = 'no_show' THEN 'NO_SHOW'::claim_status
  END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'A claim that is % cannot be %.', lower(replace(c.status::text, '_', ' ')),
      CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected'
                    WHEN 'collect' THEN 'marked collected' WHEN 'no_show' THEN 'marked as no-show' ELSE p_action END
      USING ERRCODE = '55000';
  END IF;

  IF p_action = 'approve' THEN
    IF l.status = 'CANCELLED' OR l.expires_at <= now() THEN
      RAISE EXCEPTION 'This listing is % ; the claim cannot be approved.',
        CASE WHEN l.status = 'CANCELLED' THEN 'cancelled' ELSE 'expired' END USING ERRCODE = '55000';
    END IF;
    IF c.claimed_qty_kg > l.offered_qty_kg - l.claimed_qty_kg + 0.0000001 THEN
      RAISE EXCEPTION 'Only % kg are still unreserved; this claim needs % kg.',
        ROUND(l.offered_qty_kg - l.claimed_qty_kg, 1), ROUND(c.claimed_qty_kg, 1) USING ERRCODE = '55000';
    END IF;
    UPDATE surplus_listing SET claimed_qty_kg = claimed_qty_kg + c.claimed_qty_kg WHERE listing_id = v_listing;
  ELSIF p_action = 'no_show' THEN
    UPDATE surplus_listing SET claimed_qty_kg = GREATEST(claimed_qty_kg - c.claimed_qty_kg, 0) WHERE listing_id = v_listing;
  END IF;

  UPDATE redistribution_claim
     SET status = v_next, collected_at = CASE WHEN v_next = 'COLLECTED' THEN now() ELSE collected_at END
   WHERE claim_id = p_claim;                                       -- trigger tr_claim_guard re-validates the move

  IF p_action = 'collect' THEN
    SELECT ro.org_name INTO v_org FROM recipient_org ro WHERE ro.recipient_id = c.recipient_id;
    INSERT INTO waste_event (establishment_id, food_id, reason_id, route_id, stage, quantity_kg, was_edible, notes, occurred_on)
    SELECT l.establishment_id, l.food_id, r.reason_id, d.route_id, 'POST_CONSUMER_SERVICE', c.claimed_qty_kg, TRUE,
           format('Redistributed to %s (claim %s)', COALESCE(v_org, 'recipient'), p_claim), CURRENT_DATE
      FROM waste_reason r, disposal_route d
     WHERE r.reason_code = 'REDISTRIBUTED' AND d.route_name = 'DONATION';
  END IF;

  SELECT sl.claimed_qty_kg INTO v_claimed FROM surplus_listing sl WHERE sl.listing_id = v_listing;
  v_lstatus := CASE
    WHEN l.status = 'CANCELLED'                 THEN 'CANCELLED'
    WHEN v_claimed >= l.offered_qty_kg          THEN 'FULLY_CLAIMED'
    WHEN l.expires_at <= now()                  THEN 'EXPIRED'
    WHEN v_claimed > 0                          THEN 'PARTIALLY_CLAIMED'
    ELSE 'OPEN' END;
  UPDATE surplus_listing SET status = v_lstatus WHERE listing_id = v_listing;

  RETURN QUERY SELECT v_next, v_lstatus;
END $$;

-- 5. The core write procedure: closing a service session, all-or-nothing.
--    - records consumption for EVERY batch (trigger T1 refuses served+leftover > prepared, plate waste > served)
--    - closes the session
--    - plate waste (never edible) becomes a waste_event
--    - edible leftovers >= p_min_surplus_kg are auto-listed as surplus for rescue
--    - smaller leftovers are not worth a pickup: recorded as over-preparation waste so nothing disappears
--    p_records: JSON array of {batch_id, served_qty_kg, leftover_qty_kg, plate_waste_kg}.
--    Returns (INOUT) the number of waste events written and the ids of the surplus listings created.
CREATE OR REPLACE PROCEDURE sp_close_service_session(
  p_session BIGINT, p_establishment INT, p_actual_headcount INT, p_user INT, p_records JSONB,
  p_min_surplus_kg NUMERIC DEFAULT 2,
  INOUT o_waste_events INT DEFAULT 0, INOUT o_listing_ids BIGINT[] DEFAULT '{}')
LANGUAGE plpgsql AS $$
DECLARE s RECORD; r RECORD; v_batches INT; v_given INT; v_distinct INT; v_matched INT;
        v_plate_reason INT; v_over_reason INT; v_route INT; v_food INT; v_listing BIGINT;
BEGIN
  o_waste_events := 0; o_listing_ids := '{}';
  SELECT ss.is_closed, ss.service_date, ss.slot INTO s
    FROM service_session ss WHERE ss.session_id = p_session AND ss.establishment_id = p_establishment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service session not found' USING ERRCODE = 'P0002'; END IF;
  IF s.is_closed THEN RAISE EXCEPTION 'This session is already closed.' USING ERRCODE = '55000'; END IF;

  SELECT COUNT(*) INTO v_batches FROM preparation_batch WHERE session_id = p_session;
  IF v_batches = 0 THEN
    RAISE EXCEPTION 'Add at least one prepared batch before closing the session.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COUNT(*), COUNT(DISTINCT x.batch_id),
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM preparation_batch pb WHERE pb.batch_id = x.batch_id AND pb.session_id = p_session))
    INTO v_given, v_distinct, v_matched
    FROM jsonb_to_recordset(p_records) AS x(batch_id BIGINT, served_qty_kg NUMERIC, leftover_qty_kg NUMERIC, plate_waste_kg NUMERIC);
  IF v_given <> v_batches OR v_distinct <> v_given OR v_matched <> v_given THEN
    RAISE EXCEPTION 'Record consumption exactly once for every batch in this session.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO consumption_record (batch_id, served_qty_kg, leftover_qty_kg, plate_waste_kg, recorded_by)
  SELECT x.batch_id, x.served_qty_kg, x.leftover_qty_kg, COALESCE(x.plate_waste_kg, 0), p_user
    FROM jsonb_to_recordset(p_records) AS x(batch_id BIGINT, served_qty_kg NUMERIC, leftover_qty_kg NUMERIC, plate_waste_kg NUMERIC);

  UPDATE service_session SET actual_headcount = p_actual_headcount, is_closed = TRUE, closed_at = now()
   WHERE session_id = p_session;

  SELECT reason_id INTO v_plate_reason FROM waste_reason WHERE reason_code = 'PLATE_LEFTOVER';
  SELECT reason_id INTO v_over_reason  FROM waste_reason WHERE reason_code = 'OVER_PREPARATION';
  SELECT route_id  INTO v_route        FROM disposal_route WHERE route_name = 'COMPOST';

  FOR r IN
    SELECT d.dish_name, d.is_vegetarian, cr.leftover_qty_kg, cr.plate_waste_kg
      FROM preparation_batch pb
      JOIN consumption_record cr ON cr.batch_id = pb.batch_id
      JOIN dish d ON d.dish_id = pb.dish_id
     WHERE pb.session_id = p_session
     ORDER BY pb.batch_id
  LOOP
    SELECT fi.food_id INTO v_food FROM food_item fi WHERE lower(fi.canonical_name) = lower(r.dish_name);
    IF r.plate_waste_kg > 0 THEN
      INSERT INTO waste_event (establishment_id, food_id, session_id, reason_id, route_id, stage, quantity_kg,
                               was_edible, notes, occurred_on, measurement_source)
      VALUES (p_establishment, v_food, p_session, v_plate_reason, v_route, 'POST_CONSUMER_PLATE', r.plate_waste_kg,
              FALSE, format('Plate waste, %s (auto-recorded at session close)', r.dish_name), s.service_date, 'SYSTEM');
      o_waste_events := o_waste_events + 1;
    END IF;
    IF r.leftover_qty_kg >= p_min_surplus_kg THEN
      INSERT INTO surplus_listing (establishment_id, food_id, session_id, description, offered_qty_kg, is_cooked,
                                   is_vegetarian, available_from, expires_at)
      VALUES (p_establishment, v_food, p_session,
              format('%s kg %s left after %s service, freshly cooked and unserved (auto-listed at session close)',
                     ROUND(r.leftover_qty_kg, 1), r.dish_name, lower(s.slot::text)),
              r.leftover_qty_kg, TRUE, r.is_vegetarian, now(), now() + interval '4 hours')
      RETURNING listing_id INTO v_listing;
      o_listing_ids := o_listing_ids || v_listing;
    ELSIF r.leftover_qty_kg > 0 THEN
      INSERT INTO waste_event (establishment_id, food_id, session_id, reason_id, route_id, stage, quantity_kg,
                               was_edible, notes, occurred_on, measurement_source)
      VALUES (p_establishment, v_food, p_session, v_over_reason, v_route, 'POST_CONSUMER_SERVICE', r.leftover_qty_kg,
              TRUE, format('Small leftover, %s (below the %s kg surplus threshold)', r.dish_name, p_min_surplus_kg), s.service_date, 'SYSTEM');
      o_waste_events := o_waste_events + 1;
    END IF;
  END LOOP;
END $$;

-- 6. Partition maintenance: make sure monthly waste_event partitions exist for the next N months (idempotent).
CREATE OR REPLACE FUNCTION fn_ensure_waste_partitions(p_months_ahead INT DEFAULT 12)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE m DATE := date_trunc('month', CURRENT_DATE)::date; v_name TEXT; v_created INT := 0;
BEGIN
  FOR i IN 0..p_months_ahead LOOP
    v_name := 'waste_event_' || to_char(m, 'YYYY_MM');
    IF to_regclass(v_name) IS NULL THEN
      EXECUTE format('CREATE TABLE %I PARTITION OF waste_event FOR VALUES FROM (%L) TO (%L)',
                     v_name, m, (m + interval '1 month')::date);
      v_created := v_created + 1;
    END IF;
    m := (m + interval '1 month')::date;
  END LOOP;
  RETURN v_created;
END $$;

COMMENT ON FUNCTION fn_waste_intensity(INT, DATE, DATE) IS 'kg wasted per kg served for an establishment and window; NULL if nothing served.';
COMMENT ON FUNCTION fn_search_food(TEXT, INT) IS 'Full-text + trigram + substring food search, best match first.';
COMMENT ON FUNCTION fn_claim_surplus(BIGINT, INT, NUMERIC, NUMERIC) IS 'Locks the listing, validates every hard rule, inserts a REQUESTED claim.';
COMMENT ON FUNCTION fn_transition_claim(BIGINT, TEXT, INT, INT) IS 'approve/reject/collect/no_show with stock reservation and the redistribution record.';
COMMENT ON PROCEDURE sp_close_service_session(BIGINT, INT, INT, INT, JSONB, NUMERIC, INT, BIGINT[]) IS 'Close a session atomically: consumption, plate-waste events, auto surplus listings.';
COMMENT ON FUNCTION fn_ensure_waste_partitions(INT) IS 'Create monthly waste_event partitions for the next N months if missing.';

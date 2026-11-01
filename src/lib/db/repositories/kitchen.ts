import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { conflict, n, notFoundError, paged, type Page, unprocessable } from "@/lib/db/sql";
import { tryEmbedLiteral } from "@/lib/embeddings/embedder";
import type { z } from "zod";
import type { batchSchema, closeSessionSchema, dishSchema, openSessionSchema } from "@/lib/validation/schemas";

/* Preparation and consumption: service_session -> preparation_batch -> consumption_record. */

export interface SessionRow {
  session_id: number;
  establishment_id: number;
  establishment_name: string;
  service_date: string;
  slot: string;
  expected_headcount: number;
  actual_headcount: number | null;
  is_closed: boolean;
  batch_count: number;
  prepared_kg: number;
  leftover_kg: number;
}

export async function listSessions(scope: { establishmentId?: number }, page: Page) {
  const est = scope.establishmentId ? "WHERE s.establishment_id = $1" : "";
  const args = scope.establishmentId ? [scope.establishmentId] : [];
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM service_session s ${est}`, args);
  const rows = await query<SessionRow>(
    `SELECT s.session_id, s.establishment_id, e.name AS establishment_name, s.service_date::text AS service_date, s.slot,
            s.expected_headcount, s.actual_headcount, s.is_closed,
            count(b.batch_id)::int AS batch_count, COALESCE(sum(b.prepared_qty_kg), 0) AS prepared_kg,
            COALESCE(sum(cr.leftover_qty_kg), 0) AS leftover_kg
       FROM service_session s JOIN establishment e USING (establishment_id)
       LEFT JOIN preparation_batch b ON b.session_id = s.session_id
       LEFT JOIN consumption_record cr ON cr.batch_id = b.batch_id
       ${est} GROUP BY s.session_id, e.name
      ORDER BY s.service_date DESC, s.session_id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, page.pageSize, page.offset],
  );
  return paged(rows.map((r) => ({ ...r, prepared_kg: n(r.prepared_kg), leftover_kg: n(r.leftover_kg) })), total?.n ?? 0, page);
}

export interface BatchRow {
  batch_id: number;
  dish_id: number;
  dish_name: string;
  prepared_qty_kg: number;
  prepared_portions: number;
  prep_cost: number | null;
  served_qty_kg: number | null;
  leftover_qty_kg: number | null;
  plate_waste_kg: number | null;
}

export async function getSession(sessionId: number, scope: { establishmentId?: number }) {
  const params: unknown[] = [sessionId];
  let est = "";
  if (scope.establishmentId) {
    params.push(scope.establishmentId);
    est = "AND s.establishment_id = $2";
  }
  const session = await queryOne<SessionRow>(
    `SELECT s.session_id, s.establishment_id, e.name AS establishment_name, s.service_date::text AS service_date, s.slot,
            s.expected_headcount, s.actual_headcount, s.is_closed, 0 AS batch_count, 0 AS prepared_kg, 0 AS leftover_kg
       FROM service_session s JOIN establishment e USING (establishment_id) WHERE s.session_id = $1 ${est}`,
    params,
  );
  if (!session) throw notFoundError("Service session");
  const batches = await query<BatchRow>(
    `SELECT b.batch_id, b.dish_id, d.dish_name, b.prepared_qty_kg, b.prepared_portions, b.prep_cost,
            cr.served_qty_kg, cr.leftover_qty_kg, cr.plate_waste_kg
       FROM preparation_batch b JOIN dish d USING (dish_id) LEFT JOIN consumption_record cr ON cr.batch_id = b.batch_id
      WHERE b.session_id = $1 ORDER BY b.batch_id`,
    [sessionId],
  );
  return {
    session,
    batches: batches.map((b) => ({
      ...b,
      prepared_qty_kg: n(b.prepared_qty_kg),
      prep_cost: b.prep_cost === null ? null : n(b.prep_cost),
      served_qty_kg: b.served_qty_kg === null ? null : n(b.served_qty_kg),
      leftover_qty_kg: b.leftover_qty_kg === null ? null : n(b.leftover_qty_kg),
      plate_waste_kg: b.plate_waste_kg === null ? null : n(b.plate_waste_kg),
    })),
  };
}

export async function openSession(establishmentId: number, input: z.infer<typeof openSessionSchema>): Promise<number> {
  const today = await queryOne<{ d: string }>("SELECT CURRENT_DATE::text AS d");
  if (input.serviceDate > (today?.d ?? input.serviceDate)) throw unprocessable("A service session cannot be opened for a future date.", { serviceDate: "Cannot be in the future" });
  const row = await queryOne<{ session_id: number }>(
    `INSERT INTO service_session (establishment_id, service_date, slot, expected_headcount) VALUES ($1, $2, $3::meal_slot, $4) RETURNING session_id`,
    [establishmentId, input.serviceDate, input.slot, input.expectedHeadcount],
  );
  return row!.session_id;
}

export const listDishes = (establishmentId: number) =>
  query<{ dish_id: number; dish_name: string; standard_portion_g: number; is_vegetarian: boolean }>(
    "SELECT dish_id, dish_name, standard_portion_g, is_vegetarian FROM dish WHERE establishment_id = $1 ORDER BY dish_name",
    [establishmentId],
  );

export async function createDish(establishmentId: number, input: z.infer<typeof dishSchema>): Promise<number> {
  const row = await queryOne<{ dish_id: number }>(
    `INSERT INTO dish (establishment_id, dish_name, standard_portion_g, is_vegetarian) VALUES ($1, $2, $3, $4) RETURNING dish_id`,
    [establishmentId, input.dishName, input.standardPortionG, input.isVegetarian],
  );
  return row!.dish_id;
}

/** Adds a prepared batch to an OPEN session of this establishment, using only this establishment's dishes. */
export async function addBatch(establishmentId: number, sessionId: number, input: z.infer<typeof batchSchema>): Promise<number> {
  return withTransaction(async (c) => {
    const s = await c.query<{ is_closed: boolean }>(
      "SELECT is_closed FROM service_session WHERE session_id = $1 AND establishment_id = $2 FOR UPDATE",
      [sessionId, establishmentId],
    );
    if (!s.rows[0]) throw notFoundError("Service session");
    if (s.rows[0].is_closed) throw conflict("This session is closed; batches can no longer be added.");
    const dish = await c.query("SELECT 1 FROM dish WHERE dish_id = $1 AND establishment_id = $2", [input.dishId, establishmentId]);
    if (!dish.rows[0]) throw unprocessable("That dish does not belong to your establishment.", { dishId: "Choose one of your dishes" });
    const b = await c.query<{ batch_id: number }>(
      `INSERT INTO preparation_batch (session_id, dish_id, prepared_qty_kg, prepared_portions, prep_cost, prepared_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING batch_id`,
      [sessionId, input.dishId, input.preparedQtyKg, input.preparedPortions, input.prepCost ?? null],
    );
    return b.rows[0]!.batch_id;
  });
}

/** Edible leftovers at or above this size are auto-listed as surplus; smaller ones are recorded as waste. */
export const MIN_SURPLUS_KG = 2;

/**
 * Closes a session through the stored procedure sp_close_service_session - one all-or-nothing database operation:
 * it records consumption for EVERY batch (trigger T1 refuses served + leftover > prepared), closes the session,
 * writes plate-waste events, auto-lists edible leftovers as surplus and records small leftovers as waste.
 * Any failure rolls the whole close back. Afterwards the new listings get their semantic embedding (best effort).
 */
export async function closeSession(establishmentId: number, userId: number, sessionId: number, input: z.infer<typeof closeSessionSchema>) {
  const records = input.records.map((r) => ({ batch_id: r.batchId, served_qty_kg: r.servedQtyKg, leftover_qty_kg: r.leftoverQtyKg, plate_waste_kg: r.plateWasteKg }));
  const out = await withTransaction(async (c) => {
    const r = await c.query<{ o_waste_events: number; o_listing_ids: number[] }>(
      "CALL sp_close_service_session($1, $2, $3, $4, $5::jsonb, $6, NULL::int, NULL::bigint[])",
      [sessionId, establishmentId, input.actualHeadcount, userId, JSON.stringify(records), MIN_SURPLUS_KG],
    );
    return r.rows[0]!;
  }, { userId });

  const listingIds = out.o_listing_ids ?? [];
  let embedded = 0;
  for (const id of listingIds) {
    const row = await queryOne<{ description: string }>("SELECT description FROM surplus_listing WHERE listing_id = $1", [id]);
    const literal = row ? await tryEmbedLiteral(row.description) : null;
    if (literal) {
      await query("UPDATE surplus_listing SET desc_embedding = $1::vector WHERE listing_id = $2", [literal, id]);
      embedded++;
    }
  }
  return { sessionId, batchesClosed: input.records.length, wasteEvents: out.o_waste_events, listingIds, embedded };
}

import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { Params, likePattern, n, paged, type Page, unprocessable } from "@/lib/db/sql";
import type { z } from "zod";
import type { wasteSchema } from "@/lib/validation/schemas";

export interface WasteRow {
  waste_id: number;
  establishment_id: number;
  establishment_name: string;
  occurred_on: string;
  food_name: string | null;
  reason_code: string;
  reason_description: string;
  route_name: string;
  is_diversion: boolean;
  stage: string;
  quantity_kg: number;
  was_edible: boolean;
  cost_estimate: number | null;
  co2e_estimate: number | null;
  notes: string | null;
  from_etl: boolean;
  measurement_source: string;
}

export interface WasteFilters {
  establishmentId?: number; // forced to the user's own establishment for establishment roles
  from?: string;
  to?: string;
  stage?: string;
  reasonId?: number;
  q?: string;
}

function filterClause(f: WasteFilters, params: Params) {
  const where: string[] = [];
  if (f.establishmentId) where.push(`w.establishment_id = ${params.add(f.establishmentId)}`);
  if (f.from) where.push(`w.occurred_on >= ${params.add(f.from)}::date`);
  if (f.to) where.push(`w.occurred_on <= ${params.add(f.to)}::date`);
  if (f.stage) where.push(`w.stage = ${params.add(f.stage)}::waste_stage`);
  if (f.reasonId) where.push(`w.reason_id = ${params.add(f.reasonId)}`);
  if (f.q) where.push(`(fi.canonical_name ILIKE ${params.add(likePattern(f.q))} ESCAPE '\\' OR w.notes ILIKE ${params.add(likePattern(f.q))} ESCAPE '\\')`);
  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

const FROM = `FROM waste_event w
  JOIN establishment e ON e.establishment_id = w.establishment_id
  JOIN waste_reason r ON r.reason_id = w.reason_id
  JOIN disposal_route dr ON dr.route_id = w.route_id
  LEFT JOIN food_item fi ON fi.food_id = w.food_id`;

export async function listWaste(f: WasteFilters, page: Page) {
  const params = new Params();
  const clause = filterClause(f, params);
  const totals = await queryOne<{ n: number; kg: string; cost: string; co2: string }>(
    `SELECT count(*)::int AS n, COALESCE(sum(w.quantity_kg), 0) AS kg, COALESCE(sum(w.cost_estimate), 0) AS cost,
            COALESCE(sum(w.co2e_estimate), 0) AS co2 ${FROM} ${clause}`,
    params.values,
  );
  const rows = await query<WasteRow>(
    `SELECT w.waste_id, w.establishment_id, e.name AS establishment_name, w.occurred_on::text AS occurred_on,
            fi.canonical_name AS food_name, r.reason_code, r.description AS reason_description, dr.route_name, dr.is_diversion,
            w.stage, w.quantity_kg, w.was_edible, w.cost_estimate, w.co2e_estimate, w.notes, (w.source_doc_id IS NOT NULL) AS from_etl, w.measurement_source
       ${FROM} ${clause} ORDER BY w.occurred_on DESC, w.waste_id DESC LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  const result = paged(
    rows.map((r) => ({
      ...r,
      quantity_kg: n(r.quantity_kg),
      cost_estimate: r.cost_estimate === null ? null : n(r.cost_estimate),
      co2e_estimate: r.co2e_estimate === null ? null : n(r.co2e_estimate),
    })),
    totals?.n ?? 0,
    page,
  );
  return { ...result, sums: { kg: n(totals?.kg), cost: n(totals?.cost), co2e: n(totals?.co2) } };
}

/**
 * Records a waste event. When it names an inventory lot, the pre-check below gives friendly field errors, and the
 * database trigger `tr_lot_ledger` (T3) then deducts the quantity from the lot - exactly once, under a row lock - so
 * two staff members cannot write off the same stock. Cost, CO2e and provenance are derived by trigger `tr_waste_enrich`.
 */
export async function recordWaste(establishmentId: number, input: z.infer<typeof wasteSchema>) {
  return withTransaction(async (c) => {
    const reason = await c.query<{ reason_code: string }>("SELECT reason_code FROM waste_reason WHERE reason_id = $1", [input.reasonId]);
    if (!reason.rows[0]) throw unprocessable("Choose a valid reason.", { reasonId: "Unknown reason" });
    if (reason.rows[0].reason_code === "REDISTRIBUTED") {
      throw unprocessable("Redistribution is recorded automatically when a claim is collected.", { reasonId: "Not available for manual entry" });
    }

    let foodId = input.foodId ?? null;
    if (input.lotId) {
      const lot = await c.query<{ food_id: number; remaining_qty: string }>(
        "SELECT food_id, remaining_qty FROM inventory_lot WHERE lot_id = $1 AND establishment_id = $2 FOR UPDATE",
        [input.lotId, establishmentId],
      );
      if (!lot.rows[0]) throw unprocessable("That stock lot does not belong to your establishment.", { lotId: "Unknown lot" });
      if (input.quantityKg > n(lot.rows[0].remaining_qty) + 1e-9) {
        throw unprocessable(`Only ${n(lot.rows[0].remaining_qty)} remain in that lot.`, { quantityKg: "Exceeds the lot's remaining quantity" });
      }
      if (foodId !== null && foodId !== lot.rows[0].food_id) throw unprocessable("The selected food does not match the lot.", { foodId: "Does not match the lot" });
      foodId = lot.rows[0].food_id;
      // NO manual UPDATE of the lot here: trigger T3 (tr_lot_ledger) deducts the stock exactly once when the event is inserted.
    }
    if (input.sessionId) {
      const s = await c.query("SELECT 1 FROM service_session WHERE session_id = $1 AND establishment_id = $2", [input.sessionId, establishmentId]);
      if (!s.rows[0]) throw unprocessable("That session does not belong to your establishment.", { sessionId: "Unknown session" });
    }

    const row = await c.query<{ waste_id: number; cost_estimate: string | null; co2e_estimate: string | null }>(
      `INSERT INTO waste_event (establishment_id, food_id, session_id, lot_id, reason_id, route_id, stage, quantity_kg,
                                was_edible, notes, occurred_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7::waste_stage, $8, $9, $10, $11::date)
       RETURNING waste_id, cost_estimate, co2e_estimate`,
      [establishmentId, foodId, input.sessionId ?? null, input.lotId ?? null, input.reasonId, input.routeId, input.stage, input.quantityKg, input.wasEdible, input.notes ?? null, input.occurredOn],
    );
    const r = row.rows[0]!;
    return { wasteId: r.waste_id, costEstimate: r.cost_estimate === null ? null : n(r.cost_estimate), co2eEstimate: r.co2e_estimate === null ? null : n(r.co2e_estimate) };
  });
}

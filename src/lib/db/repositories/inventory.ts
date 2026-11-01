import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { APP_TZ, Params, likePattern, n, paged, type Page, unprocessable } from "@/lib/db/sql";
import type { z } from "zod";
import type { procurementSchema } from "@/lib/validation/schemas";

/* ----------------------------------------------------------------- procurement */

export interface ProcurementRow {
  procurement_id: number;
  establishment_id: number;
  establishment_name: string;
  supplier_name: string | null;
  invoice_no: string | null;
  received_at: string;
  total_cost: number;
  line_count: number;
  recorded_by_name: string | null;
}

/**
 * Records one delivery: header + N lines + N inventory lots in a SINGLE transaction. If any line is invalid
 * (unknown food, bad expiry, duplicate invoice) nothing is written - stock and cost stay consistent.
 * Lot expiry = the stated expiry date (end of that day in the locality's timezone) or, when none is given,
 * received time + the food category's default shelf life.
 */
export async function recordProcurement(establishmentId: number, userId: number, input: z.infer<typeof procurementSchema>): Promise<number> {
  return withTransaction(async (c) => {
    const foodIds = input.lines.map((l) => l.foodId);
    const foods = await c.query<{ food_id: number; shelf: number }>(
      `SELECT f.food_id, fc.default_shelf_life_hours AS shelf FROM food_item f
         JOIN food_category fc USING (food_category_id) WHERE f.food_id = ANY($1::int[])`,
      [foodIds],
    );
    const shelf = new Map(foods.rows.map((r) => [r.food_id, r.shelf]));
    const missing = foodIds.filter((id) => !shelf.has(id));
    if (missing.length) throw unprocessable("Unknown food item in delivery.", { lines: `Food item ${missing[0]} does not exist` });

    const received = input.receivedAt ?? new Date().toISOString();
    if (new Date(received).getTime() > Date.now() + 5 * 60_000) throw unprocessable("Received time cannot be in the future.", { receivedAt: "Cannot be in the future" });

    const total = input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
    const header = await c.query<{ procurement_id: number }>(
      `INSERT INTO procurement (establishment_id, supplier_id, invoice_no, received_at, total_cost, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING procurement_id`,
      [establishmentId, input.supplierId ?? null, input.invoiceNo ?? null, received, Math.round(total * 100) / 100, userId],
    );
    const procurementId = header.rows[0]!.procurement_id;

    for (const l of input.lines) {
      const line = await c.query<{ line_id: number }>(
        `INSERT INTO procurement_line (procurement_id, food_id, quantity, unit_cost, expiry_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING line_id`,
        [procurementId, l.foodId, l.quantity, l.unitCost, l.expiryDate ?? null],
      );
      const lot = await c.query(
        `INSERT INTO inventory_lot (establishment_id, food_id, source_line_id, received_qty, remaining_qty, unit_cost, received_at, expires_at)
         SELECT $1, $2, $3, $4, $4, $5, $6::timestamptz,
                CASE WHEN $7::date IS NOT NULL THEN (($7::date + time '23:59:59') AT TIME ZONE '${APP_TZ}')
                     ELSE $6::timestamptz + make_interval(hours => $8::int) END
         RETURNING lot_id`,
        [establishmentId, l.foodId, line.rows[0]!.line_id, l.quantity, l.unitCost, received, l.expiryDate ?? null, shelf.get(l.foodId)],
      ).catch((e: { constraint?: string }) => {
        if (e.constraint === "ck_lot_dates") throw unprocessable("A line's expiry date is before the delivery date.", { lines: "Expiry must be after the received date" });
        throw e;
      });
      void lot;
    }
    return procurementId;
  });
}

export async function listProcurements(scope: { establishmentId?: number }, page: Page) {
  const params = new Params();
  const clause = scope.establishmentId ? `WHERE p.establishment_id = ${params.add(scope.establishmentId)}` : "";
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM procurement p ${clause}`, params.values);
  const rows = await query<ProcurementRow>(
    `SELECT p.procurement_id, p.establishment_id, e.name AS establishment_name, s.name AS supplier_name, p.invoice_no,
            p.received_at, p.total_cost, (SELECT count(*)::int FROM procurement_line pl WHERE pl.procurement_id = p.procurement_id) AS line_count,
            u.full_name AS recorded_by_name
       FROM procurement p JOIN establishment e USING (establishment_id)
       LEFT JOIN supplier s ON s.supplier_id = p.supplier_id LEFT JOIN app_user u ON u.user_id = p.recorded_by
       ${clause} ORDER BY p.received_at DESC, p.procurement_id DESC LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  return paged(rows.map((r) => ({ ...r, total_cost: n(r.total_cost) })), total?.n ?? 0, page);
}

/* ------------------------------------------------------------------- inventory */

export interface LotRow {
  lot_id: number;
  establishment_id: number;
  establishment_name: string;
  food_id: number;
  food_name: string;
  base_unit: string;
  received_qty: number;
  remaining_qty: number;
  unit_cost: number;
  received_at: string;
  expires_at: string;
  hours_left: number;
  value_remaining: number;
}

export interface InventoryFilters {
  q?: string;
  state?: "all" | "fresh" | "expiring" | "expired";
}

export async function listLots(scope: { establishmentId?: number }, f: InventoryFilters, page: Page) {
  const params = new Params();
  const where = ["l.remaining_qty > 0"];
  if (scope.establishmentId) where.push(`l.establishment_id = ${params.add(scope.establishmentId)}`);
  if (f.q) where.push(`fi.canonical_name ILIKE ${params.add(likePattern(f.q))} ESCAPE '\\'`);
  if (f.state === "expired") where.push("l.expires_at <= now()");
  if (f.state === "expiring") where.push("l.expires_at > now() AND l.expires_at <= now() + interval '72 hours'");
  if (f.state === "fresh") where.push("l.expires_at > now() + interval '72 hours'");
  const clause = `WHERE ${where.join(" AND ")}`;
  const from = `FROM inventory_lot l JOIN food_item fi USING (food_id) JOIN establishment e ON e.establishment_id = l.establishment_id`;

  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n ${from} ${clause}`, params.values);
  const rows = await query<LotRow>(
    `SELECT l.lot_id, l.establishment_id, e.name AS establishment_name, l.food_id, fi.canonical_name AS food_name, fi.base_unit,
            l.received_qty, l.remaining_qty, l.unit_cost, l.received_at, l.expires_at,
            EXTRACT(EPOCH FROM (l.expires_at - now())) / 3600 AS hours_left, l.remaining_qty * l.unit_cost AS value_remaining
       ${from} ${clause} ORDER BY l.expires_at ASC, l.lot_id LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  return paged(
    rows.map((r) => ({
      ...r,
      received_qty: n(r.received_qty),
      remaining_qty: n(r.remaining_qty),
      unit_cost: n(r.unit_cost),
      hours_left: n(r.hours_left),
      value_remaining: n(r.value_remaining),
    })),
    total?.n ?? 0,
    page,
  );
}

export async function inventorySummary(scope: { establishmentId?: number }) {
  const params = new Params();
  const est = scope.establishmentId ? `AND l.establishment_id = ${params.add(scope.establishmentId)}` : "";
  const row = await queryOne<Record<string, string>>(
    `SELECT count(*)::int AS lots,
            count(*) FILTER (WHERE l.expires_at > now() AND l.expires_at <= now() + interval '72 hours')::int AS expiring,
            count(*) FILTER (WHERE l.expires_at <= now())::int AS expired,
            COALESCE(sum(l.remaining_qty * l.unit_cost), 0) AS value,
            COALESCE(sum(l.remaining_qty * l.unit_cost) FILTER (WHERE l.expires_at <= now() + interval '72 hours'), 0) AS value_at_risk
       FROM inventory_lot l WHERE l.remaining_qty > 0 ${est}`,
    params.values,
  );
  return {
    lots: n(row?.lots),
    expiring: n(row?.expiring),
    expired: n(row?.expired),
    value: n(row?.value),
    valueAtRisk: n(row?.value_at_risk),
  };
}

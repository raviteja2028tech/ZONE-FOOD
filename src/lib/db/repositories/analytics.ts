import "server-only";
import { query, queryOne } from "@/lib/db/postgres";
import { Params, EFFECTIVE_LISTING_STATUS, n } from "@/lib/db/sql";

/**
 * Dashboard analytics. Every number comes from a SQL aggregate over the live tables - nothing is hardcoded.
 * "Waste" excludes the system-written REDISTRIBUTED reason (food that was rescued, not wasted); redistributed
 * food is reported separately.
 */
export interface Scope {
  establishmentId?: number;
}

export interface Kpis {
  wasteKg: number;
  wasteKgPrev: number;
  costInr: number;
  co2eKg: number;
  diversionPct: number;
  redistributedKg: number;
  redistributedKgPrev: number;
  surplusAvailableKg: number;
  openListings: number;
}

export async function getKpis(scope: Scope, days = 30): Promise<Kpis> {
  const p = new Params();
  const est = scope.establishmentId ? `AND w.establishment_id = ${p.add(scope.establishmentId)}` : "";
  const d = p.add(days);
  const row = await queryOne<Record<string, string>>(
    `SELECT
        COALESCE(sum(w.quantity_kg) FILTER (WHERE r.reason_code <> 'REDISTRIBUTED' AND w.occurred_on > CURRENT_DATE - ${d}::int), 0) AS waste,
        COALESCE(sum(w.quantity_kg) FILTER (WHERE r.reason_code <> 'REDISTRIBUTED' AND w.occurred_on <= CURRENT_DATE - ${d}::int), 0) AS waste_prev,
        COALESCE(sum(w.cost_estimate) FILTER (WHERE r.reason_code <> 'REDISTRIBUTED' AND w.occurred_on > CURRENT_DATE - ${d}::int), 0) AS cost,
        COALESCE(sum(w.co2e_estimate) FILTER (WHERE r.reason_code <> 'REDISTRIBUTED' AND w.occurred_on > CURRENT_DATE - ${d}::int), 0) AS co2,
        COALESCE(sum(w.quantity_kg) FILTER (WHERE r.reason_code <> 'REDISTRIBUTED' AND dr.is_diversion AND w.occurred_on > CURRENT_DATE - ${d}::int), 0) AS diverted,
        COALESCE(sum(w.quantity_kg) FILTER (WHERE r.reason_code = 'REDISTRIBUTED' AND w.occurred_on > CURRENT_DATE - ${d}::int), 0) AS redistributed,
        COALESCE(sum(w.quantity_kg) FILTER (WHERE r.reason_code = 'REDISTRIBUTED' AND w.occurred_on <= CURRENT_DATE - ${d}::int), 0) AS redistributed_prev
       FROM waste_event w JOIN waste_reason r ON r.reason_id = w.reason_id JOIN disposal_route dr ON dr.route_id = w.route_id
      WHERE w.occurred_on > CURRENT_DATE - (${d}::int * 2) ${est}`,
    p.values,
  );
  const p2 = new Params();
  const est2 = scope.establishmentId ? `AND l.establishment_id = ${p2.add(scope.establishmentId)}` : "";
  const surplus = await queryOne<{ kg: string; n: number }>(
    `SELECT COALESCE(sum(l.offered_qty_kg - l.claimed_qty_kg), 0) AS kg, count(*)::int AS n
       FROM surplus_listing l WHERE l.status <> 'CANCELLED' AND l.expires_at > now() AND l.claimed_qty_kg < l.offered_qty_kg ${est2}`,
    p2.values,
  );
  const waste = n(row?.waste);
  return {
    wasteKg: waste,
    wasteKgPrev: n(row?.waste_prev),
    costInr: n(row?.cost),
    co2eKg: n(row?.co2),
    diversionPct: waste > 0 ? (n(row?.diverted) / waste) * 100 : 0,
    redistributedKg: n(row?.redistributed),
    redistributedKgPrev: n(row?.redistributed_prev),
    surplusAvailableKg: n(surplus?.kg),
    openListings: surplus?.n ?? 0,
  };
}

export interface TrendPoint {
  week: string;
  PRE_CONSUMER_PREP: number;
  PRE_CONSUMER_SPOILAGE: number;
  PRE_CONSUMER_EXPIRY: number;
  POST_CONSUMER_PLATE: number;
  POST_CONSUMER_SERVICE: number;
}

/** Weekly waste (kg) by pipeline stage for the last `weeks` weeks - drives the stacked area chart. */
export async function getWasteTrend(scope: Scope, weeks = 12): Promise<TrendPoint[]> {
  const p = new Params();
  const est = scope.establishmentId ? `AND w.establishment_id = ${p.add(scope.establishmentId)}` : "";
  const rows = await query<{ week: string; stage: keyof Omit<TrendPoint, "week">; kg: string }>(
    `SELECT to_char(date_trunc('week', w.occurred_on), 'YYYY-MM-DD') AS week, w.stage, sum(w.quantity_kg) AS kg
       FROM waste_event w JOIN waste_reason r ON r.reason_id = w.reason_id
      WHERE r.reason_code <> 'REDISTRIBUTED'
        AND w.occurred_on >= date_trunc('week', CURRENT_DATE) - (${p.add(weeks - 1)}::int * interval '1 week') ${est}
      GROUP BY 1, 2 ORDER BY 1`,
    p.values,
  );
  const byWeek = new Map<string, TrendPoint>();
  for (const r of rows) {
    const pt = byWeek.get(r.week) ?? { week: r.week, PRE_CONSUMER_PREP: 0, PRE_CONSUMER_SPOILAGE: 0, PRE_CONSUMER_EXPIRY: 0, POST_CONSUMER_PLATE: 0, POST_CONSUMER_SERVICE: 0 };
    pt[r.stage] = Math.round(n(r.kg) * 10) / 10;
    byWeek.set(r.week, pt);
  }
  return [...byWeek.values()];
}

export async function getTopWastedFoods(scope: Scope, days = 30, limit = 8) {
  const p = new Params();
  const est = scope.establishmentId ? `AND w.establishment_id = ${p.add(scope.establishmentId)}` : "";
  const rows = await query<{ name: string; kg: string; cost: string }>(
    `SELECT f.canonical_name AS name, sum(w.quantity_kg) AS kg, COALESCE(sum(w.cost_estimate), 0) AS cost
       FROM waste_event w JOIN food_item f ON f.food_id = w.food_id JOIN waste_reason r ON r.reason_id = w.reason_id
      WHERE r.reason_code <> 'REDISTRIBUTED' AND w.occurred_on > CURRENT_DATE - ${p.add(days)}::int ${est}
      GROUP BY f.canonical_name ORDER BY sum(w.quantity_kg) DESC LIMIT ${p.add(limit)}`,
    p.values,
  );
  return rows.map((r) => ({ name: r.name, kg: Math.round(n(r.kg) * 10) / 10, cost: Math.round(n(r.cost)) }));
}

/** Per-block (level-2 zone) comparison for the authority dashboard. */
export async function getZoneComparison(days = 30) {
  const rows = await query<{ zone: string; estabs: number; waste: string; redistributed: string }>(
    `SELECT b.zone_name AS zone, count(DISTINCT e.establishment_id)::int AS estabs,
            COALESCE(sum(w.quantity_kg) FILTER (WHERE r.reason_code <> 'REDISTRIBUTED'), 0) AS waste,
            COALESCE(sum(w.quantity_kg) FILTER (WHERE r.reason_code = 'REDISTRIBUTED'), 0) AS redistributed
       FROM zone b
       JOIN zone s ON s.parent_zone_id = b.zone_id
       JOIN establishment e ON e.zone_id = s.zone_id AND e.is_active
       LEFT JOIN waste_event w ON w.establishment_id = e.establishment_id AND w.occurred_on > CURRENT_DATE - $1::int
       LEFT JOIN waste_reason r ON r.reason_id = w.reason_id
      WHERE b.zone_level = 2 GROUP BY b.zone_id, b.zone_name ORDER BY b.zone_name`,
    [days],
  );
  return rows.map((r) => ({
    zone: r.zone,
    establishments: r.estabs,
    wasteKg: Math.round(n(r.waste)),
    redistributedKg: Math.round(n(r.redistributed)),
    wastePerEstablishment: r.estabs ? Math.round(n(r.waste) / r.estabs) : 0,
  }));
}

export async function getCounts() {
  const row = await queryOne<Record<string, number>>(
    `SELECT (SELECT count(*) FROM establishment WHERE is_active)::int AS establishments,
            (SELECT count(*) FROM recipient_org)::int AS recipients,
            (SELECT count(*) FROM zone)::int AS zones`,
  );
  return { establishments: row?.establishments ?? 0, recipients: row?.recipients ?? 0, zones: row?.zones ?? 0 };
}

export interface ActivityItem {
  kind: "waste" | "listing" | "claim";
  at: string;
  who: string;
  text: string;
}

/** Latest events merged from three real tables (scoped), newest first. */
export async function getRecentActivity(scope: { establishmentId?: number; recipientId?: number }, limit = 8): Promise<ActivityItem[]> {
  const est = scope.establishmentId;
  const rec = scope.recipientId;
  const items: ActivityItem[] = [];

  if (!rec) {
    const p = new Params();
    const filter = est ? `AND w.establishment_id = ${p.add(est)}` : "";
    const waste = await query<{ at: string; who: string; kg: string; food: string | null; reason: string }>(
      `SELECT w.recorded_at AS at, e.name AS who, w.quantity_kg AS kg, f.canonical_name AS food, r.description AS reason
         FROM waste_event w JOIN establishment e USING (establishment_id) JOIN waste_reason r USING (reason_id) LEFT JOIN food_item f USING (food_id)
        WHERE r.reason_code <> 'REDISTRIBUTED' ${filter} ORDER BY w.recorded_at DESC LIMIT 6`,
      p.values,
    );
    for (const w of waste) items.push({ kind: "waste", at: w.at, who: w.who, text: `Logged ${n(w.kg).toFixed(1)} kg ${w.food ?? "food"} waste - ${w.reason.toLowerCase()}` });

    const p2 = new Params();
    const filter2 = est ? `WHERE l.establishment_id = ${p2.add(est)}` : "";
    const listings = await query<{ at: string; who: string; kg: string; description: string }>(
      `SELECT l.created_at AS at, e.name AS who, l.offered_qty_kg AS kg, l.description
         FROM surplus_listing l JOIN establishment e USING (establishment_id) ${filter2} ORDER BY l.created_at DESC LIMIT 6`,
      p2.values,
    );
    for (const l of listings) items.push({ kind: "listing", at: l.at, who: l.who, text: `Listed ${n(l.kg).toFixed(1)} kg surplus - ${l.description.slice(0, 70)}` });
  }

  const p3 = new Params();
  const where: string[] = [];
  if (est) where.push(`l.establishment_id = ${p3.add(est)}`);
  if (rec) where.push(`c.recipient_id = ${p3.add(rec)}`);
  const claims = await query<{ at: string; org: string; est: string; kg: string; status: string }>(
    `SELECT COALESCE(c.collected_at, c.requested_at) AS at, r.org_name AS org, e.name AS est, c.claimed_qty_kg AS kg, c.status
       FROM redistribution_claim c JOIN surplus_listing l USING (listing_id) JOIN establishment e USING (establishment_id) JOIN recipient_org r USING (recipient_id)
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY COALESCE(c.collected_at, c.requested_at) DESC LIMIT 6`,
    p3.values,
  );
  for (const c of claims) items.push({ kind: "claim", at: c.at, who: c.org, text: `${c.status.charAt(0) + c.status.slice(1).toLowerCase().replace("_", " ")} - ${n(c.kg).toFixed(1)} kg from ${c.est}` });

  return items.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, limit);
}

export async function getExpiringLots(establishmentId: number, limit = 5) {
  const rows = await query<{ lot_id: number; food: string; remaining: string; unit: string; hours: string; value: string }>(
    `SELECT l.lot_id, f.canonical_name AS food, l.remaining_qty AS remaining, f.base_unit AS unit,
            EXTRACT(EPOCH FROM (l.expires_at - now())) / 3600 AS hours, l.remaining_qty * l.unit_cost AS value
       FROM inventory_lot l JOIN food_item f USING (food_id)
      WHERE l.establishment_id = $1 AND l.remaining_qty > 0 AND l.expires_at <= now() + interval '72 hours'
      ORDER BY l.expires_at LIMIT $2`,
    [establishmentId, limit],
  );
  return rows.map((r) => ({ lotId: r.lot_id, food: r.food, remaining: n(r.remaining), unit: r.unit, hoursLeft: n(r.hours), value: n(r.value) }));
}

export async function getPendingClaimCount(establishmentId: number) {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM redistribution_claim c JOIN surplus_listing l USING (listing_id)
      WHERE l.establishment_id = $1 AND c.status = 'REQUESTED'`,
    [establishmentId],
  );
  return row?.n ?? 0;
}

export async function getRecipientStats(recipientId: number, days = 30) {
  const row = await queryOne<Record<string, string>>(
    `SELECT COALESCE(sum(claimed_qty_kg) FILTER (WHERE status = 'COLLECTED' AND collected_at > now() - ($2::int * interval '1 day')), 0) AS received,
            count(*) FILTER (WHERE status = 'REQUESTED')::int AS requested,
            count(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
            count(*) FILTER (WHERE status = 'COLLECTED')::int AS collected
       FROM redistribution_claim WHERE recipient_id = $1`,
    [recipientId, days],
  );
  return { receivedKg: n(row?.received), requested: n(row?.requested), approved: n(row?.approved), collected: n(row?.collected) };
}

export { EFFECTIVE_LISTING_STATUS };

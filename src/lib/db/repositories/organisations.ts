import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { Params, likePattern, notFoundError, paged, type Page, n } from "@/lib/db/sql";
import { embedRecipientNeed } from "@/lib/db/repositories/accounts";
import type { z } from "zod";
import type { updateEstablishmentSchema, updateRecipientSchema } from "@/lib/validation/schemas";

/* ----------------------------------------------------------------- establishments */

export interface EstablishmentRow {
  establishment_id: number;
  name: string;
  category_name: string;
  kind: string;
  zone_name: string;
  block_name: string;
  zone_id: number;
  capacity: number;
  capacity_metric: string;
  is_active: boolean;
  operational_since: string;
  address_line: string | null;
  waste_kg_30d: number;
}

export interface EstablishmentFilters {
  q?: string;
  zoneId?: number;
  kind?: string;
  status?: "active" | "inactive" | "all";
}

const SELECT_ESTABLISHMENT = `
  SELECT e.establishment_id, e.name, c.category_name, c.kind, z.zone_name, p.zone_name AS block_name, e.zone_id,
         e.capacity, c.capacity_metric, e.is_active, e.operational_since::text AS operational_since, e.address_line,
         COALESCE(w.kg, 0) AS waste_kg_30d
    FROM establishment e
    JOIN establishment_category c ON c.category_id = e.category_id
    JOIN zone z ON z.zone_id = e.zone_id
    LEFT JOIN zone p ON p.zone_id = z.parent_zone_id
    LEFT JOIN LATERAL (
         SELECT sum(w.quantity_kg) AS kg
           FROM waste_event w JOIN waste_reason r ON r.reason_id = w.reason_id
          WHERE w.establishment_id = e.establishment_id AND w.occurred_on >= CURRENT_DATE - 30
            AND r.reason_code <> 'REDISTRIBUTED') w ON TRUE`;

export async function listEstablishments(f: EstablishmentFilters, page: Page) {
  const params = new Params();
  const where: string[] = [];
  if (f.q) where.push(`e.name ILIKE ${params.add(likePattern(f.q))} ESCAPE '\\'`);
  if (f.zoneId) where.push(`(e.zone_id = ${params.add(f.zoneId)} OR z.parent_zone_id = ${params.add(f.zoneId)})`);
  if (f.kind) where.push(`c.kind = ${params.add(f.kind)}::establishment_kind`);
  if (f.status === "active") where.push("e.is_active");
  if (f.status === "inactive") where.push("NOT e.is_active");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM establishment e JOIN establishment_category c ON c.category_id = e.category_id
       JOIN zone z ON z.zone_id = e.zone_id ${clause}`,
    params.values,
  );
  const rows = await query<EstablishmentRow>(
    `${SELECT_ESTABLISHMENT} ${clause} ORDER BY e.name LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  return paged(rows.map((r) => ({ ...r, waste_kg_30d: n(r.waste_kg_30d) })), total?.n ?? 0, page);
}

export async function getEstablishment(id: number): Promise<EstablishmentRow & Record<string, unknown>> {
  const row = await queryOne<EstablishmentRow & Record<string, unknown>>(
    `${SELECT_ESTABLISHMENT.replace("COALESCE(w.kg, 0) AS waste_kg_30d", `COALESCE(w.kg, 0) AS waste_kg_30d,
         cp.cuisine_type, cp.seating_capacity, cp.avg_daily_covers, cp.has_buffet, cp.fssai_license,
         ip.enrolled_strength, ip.mess_type, ip.serves_meals_per_day,
         rp.household_count, rp.total_occupants, rp.has_common_kitchen, rp.segregation_compliant`)}
       LEFT JOIN commercial_profile cp ON cp.establishment_id = e.establishment_id
       LEFT JOIN institutional_profile ip ON ip.establishment_id = e.establishment_id
       LEFT JOIN residential_profile rp ON rp.establishment_id = e.establishment_id
      WHERE e.establishment_id = $1`,
    [id],
  );
  if (!row) throw notFoundError("Establishment");
  return { ...row, waste_kg_30d: n(row.waste_kg_30d) };
}

/** Whitelisted column updates only; `canAdminister` gates the admin-only fields (zone, active flag). */
export async function updateEstablishment(id: number, patch: z.infer<typeof updateEstablishmentSchema>, canAdminister: boolean, userId?: number) {
  const params = new Params();
  const sets: string[] = [];
  if (patch.name !== undefined) sets.push(`name = ${params.add(patch.name)}`);
  if (patch.addressLine !== undefined) sets.push(`address_line = ${params.add(patch.addressLine)}`);
  if (patch.capacity !== undefined) sets.push(`capacity = ${params.add(patch.capacity)}`);
  if (canAdminister && patch.zoneId !== undefined) sets.push(`zone_id = ${params.add(patch.zoneId)}`);
  if (canAdminister && patch.isActive !== undefined) sets.push(`is_active = ${params.add(patch.isActive)}`);
  if (!sets.length) return getEstablishment(id);
  const sql = `UPDATE establishment SET ${sets.join(", ")} WHERE establishment_id = ${params.add(id)} RETURNING establishment_id`;
  // In a transaction tagged with the user so audit trigger T4 records who made the change.
  const r = await withTransaction((c) => c.query(sql, params.values), { userId });
  if (!r.rows.length) throw notFoundError("Establishment");
  return getEstablishment(id);
}

/* -------------------------------------------------------------------- recipients */

export interface RecipientRow {
  recipient_id: number;
  org_name: string;
  org_type: string;
  zone_id: number;
  zone_name: string;
  need_profile: string;
  daily_capacity_kg: number;
  accepts_cooked: boolean;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  contact_phone: string | null;
  has_embedding: boolean;
  claims_collected: number;
  kg_received: number;
}

const SELECT_RECIPIENT = `
  SELECT r.recipient_id, r.org_name, r.org_type, r.zone_id, z.zone_name, r.need_profile, r.daily_capacity_kg,
         r.accepts_cooked, to_char(r.pickup_window_start, 'HH24:MI') AS pickup_window_start,
         to_char(r.pickup_window_end, 'HH24:MI') AS pickup_window_end, r.contact_phone,
         r.need_embedding IS NOT NULL AS has_embedding,
         COALESCE(s.n, 0) AS claims_collected, COALESCE(s.kg, 0) AS kg_received
    FROM recipient_org r JOIN zone z ON z.zone_id = r.zone_id
    LEFT JOIN LATERAL (SELECT count(*) AS n, sum(c.claimed_qty_kg) AS kg FROM redistribution_claim c
                        WHERE c.recipient_id = r.recipient_id AND c.status = 'COLLECTED') s ON TRUE`;

const mapRecipient = (r: RecipientRow): RecipientRow => ({
  ...r,
  daily_capacity_kg: n(r.daily_capacity_kg),
  claims_collected: n(r.claims_collected),
  kg_received: n(r.kg_received),
});

export async function listRecipients(q: string | undefined, page: Page) {
  const params = new Params();
  const clause = q ? `WHERE r.org_name ILIKE ${params.add(likePattern(q))} ESCAPE '\\'` : "";
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM recipient_org r ${clause}`, params.values);
  const rows = await query<RecipientRow>(
    `${SELECT_RECIPIENT} ${clause} ORDER BY r.org_name LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  return paged(rows.map(mapRecipient), total?.n ?? 0, page);
}

export async function getRecipient(id: number): Promise<RecipientRow> {
  const row = await queryOne<RecipientRow>(`${SELECT_RECIPIENT} WHERE r.recipient_id = $1`, [id]);
  if (!row) throw notFoundError("Recipient organisation");
  return mapRecipient(row);
}

export async function updateRecipient(id: number, patch: z.infer<typeof updateRecipientSchema>, userId?: number) {
  const params = new Params();
  const sets: string[] = [];
  const map: Array<[keyof typeof patch, string]> = [
    ["orgName", "org_name"],
    ["orgType", "org_type"],
    ["zoneId", "zone_id"],
    ["needProfile", "need_profile"],
    ["dailyCapacityKg", "daily_capacity_kg"],
    ["acceptsCooked", "accepts_cooked"],
    ["pickupWindowStart", "pickup_window_start"],
    ["pickupWindowEnd", "pickup_window_end"],
    ["contactPhone", "contact_phone"],
  ];
  for (const [key, col] of map) if (patch[key] !== undefined) sets.push(`${col} = ${params.add(patch[key])}`);
  if (!sets.length) return getRecipient(id);
  // A changed need profile invalidates the old embedding until it is recomputed below.
  if (patch.needProfile !== undefined) sets.push("need_embedding = NULL");
  const sql = `UPDATE recipient_org SET ${sets.join(", ")} WHERE recipient_id = ${params.add(id)} RETURNING recipient_id`;
  const r = await withTransaction((c) => c.query(sql, params.values), { userId });
  if (!r.rows.length) throw notFoundError("Recipient organisation");
  if (patch.needProfile !== undefined) await embedRecipientNeed(id, patch.needProfile);
  return getRecipient(id);
}

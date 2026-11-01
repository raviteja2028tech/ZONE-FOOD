import "server-only";
import { query, queryOne } from "@/lib/db/postgres";
import { n, notFoundError, unprocessable } from "@/lib/db/sql";

export interface ZoneRollup {
  zone_id: number;
  parent_zone_id: number | null;
  zone_name: string;
  zone_level: number;
  pincode: string | null;
  establishments: number;
  recipients: number;
  wasteKg: number;
  redistributedKg: number;
  surplusOpenKg: number;
}

/**
 * Locality hierarchy with roll-ups at every level. A recursive CTE expands each zone to ALL of its descendants
 * (zone -> blocks -> streets), so a sector's figures include everything beneath it, with one query.
 */
export async function getZoneRollup(days = 30): Promise<ZoneRollup[]> {
  const rows = await query<Record<string, string | number | null>>(
    `WITH RECURSIVE tree AS (
         SELECT zone_id AS root_id, zone_id FROM zone
         UNION ALL
         SELECT t.root_id, z.zone_id FROM tree t JOIN zone z ON z.parent_zone_id = t.zone_id
       ),
       waste AS (
         SELECT w.establishment_id,
                sum(w.quantity_kg) FILTER (WHERE r.reason_code <> 'REDISTRIBUTED') AS waste,
                sum(w.quantity_kg) FILTER (WHERE r.reason_code = 'REDISTRIBUTED') AS redistributed
           FROM waste_event w JOIN waste_reason r ON r.reason_id = w.reason_id
          WHERE w.occurred_on > CURRENT_DATE - $1::int GROUP BY w.establishment_id
       ),
       open_surplus AS (
         SELECT l.establishment_id, sum(l.offered_qty_kg - l.claimed_qty_kg) AS kg
           FROM surplus_listing l WHERE l.status <> 'CANCELLED' AND l.expires_at > now() AND l.claimed_qty_kg < l.offered_qty_kg
          GROUP BY l.establishment_id
       )
       SELECT z.zone_id, z.parent_zone_id, z.zone_name, z.zone_level, z.pincode,
              count(DISTINCT e.establishment_id) AS establishments,
              (SELECT count(*) FROM recipient_org ro WHERE ro.zone_id IN (SELECT zone_id FROM tree t2 WHERE t2.root_id = z.zone_id)) AS recipients,
              COALESCE(sum(w.waste), 0) AS waste, COALESCE(sum(w.redistributed), 0) AS redistributed, COALESCE(sum(s.kg), 0) AS surplus
         FROM zone z
         JOIN tree t ON t.root_id = z.zone_id
         LEFT JOIN establishment e ON e.zone_id = t.zone_id AND e.is_active
         LEFT JOIN waste w ON w.establishment_id = e.establishment_id
         LEFT JOIN open_surplus s ON s.establishment_id = e.establishment_id
        GROUP BY z.zone_id ORDER BY z.zone_level, z.zone_name`,
    [days],
  );
  return rows.map((r) => ({
    zone_id: Number(r.zone_id),
    parent_zone_id: r.parent_zone_id === null ? null : Number(r.parent_zone_id),
    zone_name: String(r.zone_name),
    zone_level: Number(r.zone_level),
    pincode: (r.pincode as string | null) ?? null,
    establishments: n(r.establishments),
    recipients: n(r.recipients),
    wasteKg: Math.round(n(r.waste)),
    redistributedKg: Math.round(n(r.redistributed)),
    surplusOpenKg: Math.round(n(r.surplus)),
  }));
}

export async function createZone(input: { zoneName: string; parentZoneId: number; pincode?: string }): Promise<number> {
  const parent = await queryOne<{ zone_level: number }>("SELECT zone_level FROM zone WHERE zone_id = $1", [input.parentZoneId]);
  if (!parent) throw unprocessable("The parent zone does not exist.", { parentZoneId: "Unknown zone" });
  if (parent.zone_level >= 4) throw unprocessable("Zones can be at most 4 levels deep.", { parentZoneId: "Too deep" });
  const row = await queryOne<{ zone_id: number }>(
    "INSERT INTO zone (parent_zone_id, zone_name, zone_level, pincode) VALUES ($1, $2, $3, $4) RETURNING zone_id",
    [input.parentZoneId, input.zoneName, parent.zone_level + 1, input.pincode ?? null],
  );
  return row!.zone_id;
}

export async function renameZone(zoneId: number, zoneName: string) {
  const row = await queryOne<{ zone_id: number }>("UPDATE zone SET zone_name = $2 WHERE zone_id = $1 RETURNING zone_id", [zoneId, zoneName]);
  if (!row) throw notFoundError("Zone");
  return row.zone_id;
}

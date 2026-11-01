import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { APP_TZ, EFFECTIVE_LISTING_STATUS, Params, conflict, likePattern, n, notFoundError, paged, type Page, unprocessable } from "@/lib/db/sql";
import { tryEmbedLiteral } from "@/lib/embeddings/embedder";
import { capacityFit, haversineKm, hybridScore, proximityScore, round4, similarityFromDistance } from "@/lib/domain/matching";
import type { z } from "zod";
import type { listingSchema } from "@/lib/validation/schemas";

export interface ListingRow {
  listing_id: number;
  establishment_id: number;
  establishment_name: string;
  food_name: string | null;
  description: string;
  offered_qty_kg: number;
  claimed_qty_kg: number;
  remaining_kg: number;
  is_cooked: boolean;
  is_vegetarian: boolean;
  available_from: string;
  expires_at: string;
  hours_left: number;
  status: string;
  has_embedding: boolean;
  claims_total: number;
  claims_pending: number;
}

const LISTING_COLUMNS = `
  l.listing_id, l.establishment_id, e.name AS establishment_name, fi.canonical_name AS food_name, l.description,
  l.offered_qty_kg, l.claimed_qty_kg, (l.offered_qty_kg - l.claimed_qty_kg) AS remaining_kg, l.is_cooked, l.is_vegetarian,
  l.available_from, l.expires_at, EXTRACT(EPOCH FROM (l.expires_at - now())) / 3600 AS hours_left,
  (${EFFECTIVE_LISTING_STATUS}) AS status, l.desc_embedding IS NOT NULL AS has_embedding,
  (SELECT count(*)::int FROM redistribution_claim c WHERE c.listing_id = l.listing_id) AS claims_total,
  (SELECT count(*)::int FROM redistribution_claim c WHERE c.listing_id = l.listing_id AND c.status = 'REQUESTED') AS claims_pending`;
const LISTING_FROM = `FROM surplus_listing l JOIN establishment e ON e.establishment_id = l.establishment_id
  LEFT JOIN food_item fi ON fi.food_id = l.food_id`;

const mapListing = (r: ListingRow): ListingRow => ({
  ...r,
  offered_qty_kg: n(r.offered_qty_kg),
  claimed_qty_kg: n(r.claimed_qty_kg),
  remaining_kg: n(r.remaining_kg),
  hours_left: n(r.hours_left),
});

export interface ListingFilters {
  establishmentId?: number;
  status?: string;
  q?: string;
}

export async function listListings(f: ListingFilters, page: Page) {
  const params = new Params();
  const where: string[] = [];
  if (f.establishmentId) where.push(`l.establishment_id = ${params.add(f.establishmentId)}`);
  if (f.q) where.push(`(l.description ILIKE ${params.add(likePattern(f.q))} ESCAPE '\\' OR e.name ILIKE ${params.add(likePattern(f.q))} ESCAPE '\\')`);
  if (f.status) where.push(`(${EFFECTIVE_LISTING_STATUS}) = ${params.add(f.status)}`);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n ${LISTING_FROM} ${clause}`, params.values);
  const rows = await query<ListingRow>(
    `SELECT ${LISTING_COLUMNS} ${LISTING_FROM} ${clause} ORDER BY l.created_at DESC, l.listing_id DESC LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  return paged(rows.map(mapListing), total?.n ?? 0, page);
}

export async function getListing(listingId: number, scope: { establishmentId?: number }): Promise<ListingRow> {
  const params = new Params();
  const est = scope.establishmentId ? `AND l.establishment_id = ${params.add(scope.establishmentId)}` : "";
  const row = await queryOne<ListingRow>(`SELECT ${LISTING_COLUMNS} ${LISTING_FROM} WHERE l.listing_id = ${params.add(listingId)} ${est}`, params.values);
  if (!row) throw notFoundError("Surplus listing");
  return mapListing(row);
}

export async function createListing(establishmentId: number, input: z.infer<typeof listingSchema>, userId?: number): Promise<{ listingId: number; embedded: boolean }> {
  if (new Date(input.expiresAt) <= new Date()) throw unprocessable("The listing has already expired.", { expiresAt: "Choose a future expiry" });

  const listingId = await withTransaction(async (c) => {
    if (input.sessionId) {
      const s = await c.query("SELECT 1 FROM service_session WHERE session_id = $1 AND establishment_id = $2", [input.sessionId, establishmentId]);
      if (!s.rows[0]) throw unprocessable("That session does not belong to your establishment.", { sessionId: "Unknown session" });
    }
    const r = await c.query<{ listing_id: number }>(
      `INSERT INTO surplus_listing (establishment_id, food_id, session_id, description, offered_qty_kg, is_cooked, is_vegetarian, available_from, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING listing_id`,
      [establishmentId, input.foodId ?? null, input.sessionId ?? null, input.description, input.offeredQtyKg, input.isCooked, input.isVegetarian, input.availableFrom, input.expiresAt],
    );
    return r.rows[0]!.listing_id;
  }, { userId });

  // Embedding happens after the commit: a model problem must never lose the listing (the backfill repairs NULLs).
  const literal = await tryEmbedLiteral(input.description);
  if (literal) await query("UPDATE surplus_listing SET desc_embedding = $1::vector WHERE listing_id = $2", [literal, listingId]);
  return { listingId, embedded: literal !== null };
}

/** Cancels a listing. Pending requests are rejected; a listing with approved/collected claims cannot be cancelled. */
export async function cancelListing(establishmentId: number, listingId: number, userId?: number) {
  return withTransaction(async (c) => {
    const l = await c.query<{ status: string; expires_at: string }>(
      "SELECT status, expires_at FROM surplus_listing WHERE listing_id = $1 AND establishment_id = $2 FOR UPDATE",
      [listingId, establishmentId],
    );
    if (!l.rows[0]) throw notFoundError("Surplus listing");
    if (l.rows[0].status === "CANCELLED") throw conflict("This listing is already cancelled.");
    const active = await c.query("SELECT 1 FROM redistribution_claim WHERE listing_id = $1 AND status IN ('APPROVED','COLLECTED') LIMIT 1", [listingId]);
    if (active.rows[0]) throw conflict("This listing has approved or collected claims and can no longer be cancelled.");
    const rejected = await c.query("UPDATE redistribution_claim SET status = 'REJECTED' WHERE listing_id = $1 AND status = 'REQUESTED'", [listingId]);
    await c.query("UPDATE surplus_listing SET status = 'CANCELLED' WHERE listing_id = $1", [listingId]);
    return { listingId, rejectedClaims: rejected.rowCount ?? 0 };
  }, { userId });
}

/* ---------------------------------------------------------------------------------------------
 * Matching (Master Plan B2.9):  SQL hard filters -> vector rank on the survivors -> hybrid score.
 * Hard constraints are applied in WHERE, never by score, so a perfect semantic match that is infeasible
 * (cooked food to a recipient that refuses cooked food, 40 kg to a 5 kg shelter) can never be offered.
 * -------------------------------------------------------------------------------------------- */

/** Pickup-window overlap in local time. Windows that cross midnight or span >= 24h are treated as overlapping. */
const WINDOW_OVERLAP = `(
  r.pickup_window_start IS NULL OR r.pickup_window_end IS NULL
  OR l.expires_at - l.available_from >= interval '24 hours'
  OR (l.expires_at AT TIME ZONE '${APP_TZ}')::time < (l.available_from AT TIME ZONE '${APP_TZ}')::time
  OR ((l.expires_at AT TIME ZONE '${APP_TZ}')::time > r.pickup_window_start
      AND (l.available_from AT TIME ZONE '${APP_TZ}')::time < r.pickup_window_end))`;

export interface MatchRow {
  recipient_id: number;
  org_name: string;
  org_type: string;
  zone_name: string;
  daily_capacity_kg: number;
  need_profile: string;
  semantic: number | null;
  capacity: number;
  proximity: number;
  distance_km: number | null;
  score: number;
}

interface RawMatch {
  recipient_id: number;
  org_name: string;
  org_type: string;
  zone_name: string;
  daily_capacity_kg: string;
  need_profile: string;
  distance: string | null;
  e_lat: string | null;
  e_lng: string | null;
  z_lat: string | null;
  z_lng: string | null;
  remaining: string;
}

/** Ranked recipients for one of an establishment's listings (feasible candidates only). */
export async function rankRecipientsForListing(listingId: number, scope: { establishmentId?: number }, limit = 5): Promise<MatchRow[]> {
  const params = new Params();
  const est = scope.establishmentId ? `AND l.establishment_id = ${params.add(scope.establishmentId)}` : "";
  const rows = await query<RawMatch>(
    `SELECT r.recipient_id, r.org_name, r.org_type, z.zone_name, r.daily_capacity_kg, r.need_profile,
            CASE WHEN r.need_embedding IS NULL OR l.desc_embedding IS NULL THEN NULL
                 ELSE (r.need_embedding <=> l.desc_embedding) END AS distance,
            e.lat AS e_lat, e.lng AS e_lng, z.centroid_lat AS z_lat, z.centroid_lng AS z_lng,
            (l.offered_qty_kg - l.claimed_qty_kg) AS remaining
       FROM surplus_listing l
       JOIN establishment e ON e.establishment_id = l.establishment_id
       JOIN recipient_org r ON zone_root(r.zone_id) = zone_root(e.zone_id)
       JOIN zone z ON z.zone_id = r.zone_id
      WHERE l.listing_id = ${params.add(listingId)} ${est}
        AND (NOT l.is_cooked OR r.accepts_cooked)
        AND r.daily_capacity_kg >= (l.offered_qty_kg - l.claimed_qty_kg) * 0.5
        AND ${WINDOW_OVERLAP}`,
    params.values,
  );
  if (!rows.length) {
    // Distinguish "no such listing" from "no feasible recipient".
    await getListing(listingId, scope);
    return [];
  }
  return rank(rows).slice(0, limit);
}

function rank(rows: RawMatch[]): MatchRow[] {
  const km = rows.map((r) => (r.e_lat && r.e_lng && r.z_lat && r.z_lng ? haversineKm(+r.e_lat, +r.e_lng, +r.z_lat, +r.z_lng) : null));
  const maxKm = Math.max(0.001, ...km.filter((v): v is number => v !== null));
  return rows
    .map((r, i) => {
      const semantic = r.distance === null ? null : similarityFromDistance(Number(r.distance));
      const capacity = capacityFit(n(r.remaining), n(r.daily_capacity_kg));
      const d = km[i] ?? null;
      const proximity = d === null ? 0.5 : proximityScore(d, maxKm);
      return {
        recipient_id: r.recipient_id,
        org_name: r.org_name,
        org_type: r.org_type,
        zone_name: r.zone_name,
        daily_capacity_kg: n(r.daily_capacity_kg),
        need_profile: r.need_profile,
        semantic: semantic === null ? null : round4(semantic),
        capacity: round4(capacity),
        proximity: round4(proximity),
        distance_km: d === null ? null : Math.round(d * 100) / 100,
        score: round4(hybridScore({ semantic, capacity, proximity })),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface FeedRow extends ListingRow {
  zone_name: string;
  semantic: number | null;
  capacity: number;
  proximity: number;
  score: number;
  distance_km: number | null;
  my_claim_status: string | null;
}

/** The recipient's feed: only listings that pass every hard constraint, ordered by hybrid score. */
export async function feedForRecipient(recipientId: number, limit = 30): Promise<FeedRow[]> {
  const rows = await query<ListingRow & { zone_name: string; distance: string | null; e_lat: string | null; e_lng: string | null; z_lat: string | null; z_lng: string | null; my_claim_status: string | null; cap: string }>(
    `SELECT ${LISTING_COLUMNS}, z.zone_name,
            CASE WHEN r.need_embedding IS NULL OR l.desc_embedding IS NULL THEN NULL ELSE (r.need_embedding <=> l.desc_embedding) END AS distance,
            e.lat AS e_lat, e.lng AS e_lng, rz.centroid_lat AS z_lat, rz.centroid_lng AS z_lng, r.daily_capacity_kg AS cap,
            (SELECT c.status FROM redistribution_claim c WHERE c.listing_id = l.listing_id AND c.recipient_id = r.recipient_id) AS my_claim_status
       FROM recipient_org r
       JOIN zone rz ON rz.zone_id = r.zone_id
       JOIN establishment e ON zone_root(e.zone_id) = zone_root(r.zone_id)
       JOIN zone z ON z.zone_id = e.zone_id
       JOIN surplus_listing l ON l.establishment_id = e.establishment_id
       LEFT JOIN food_item fi ON fi.food_id = l.food_id
      WHERE r.recipient_id = $1
        AND l.status <> 'CANCELLED' AND l.expires_at > now() AND l.claimed_qty_kg < l.offered_qty_kg AND e.is_active
        AND (NOT l.is_cooked OR r.accepts_cooked)
        AND r.daily_capacity_kg >= (l.offered_qty_kg - l.claimed_qty_kg) * 0.5
        AND ${WINDOW_OVERLAP}
      LIMIT 200`,
    [recipientId],
  );
  const km = rows.map((r) => (r.e_lat && r.e_lng && r.z_lat && r.z_lng ? haversineKm(+r.e_lat, +r.e_lng, +r.z_lat, +r.z_lng) : null));
  const maxKm = Math.max(0.001, ...km.filter((v): v is number => v !== null));
  return rows
    .map((r, i) => {
      const base = mapListing(r);
      const semantic = r.distance === null ? null : similarityFromDistance(Number(r.distance));
      const capacity = capacityFit(base.remaining_kg, n(r.cap));
      const d = km[i] ?? null;
      const proximity = d === null ? 0.5 : proximityScore(d, maxKm);
      return {
        ...base,
        zone_name: r.zone_name,
        semantic: semantic === null ? null : round4(semantic),
        capacity: round4(capacity),
        proximity: round4(proximity),
        distance_km: d === null ? null : Math.round(d * 100) / 100,
        score: round4(hybridScore({ semantic, capacity, proximity })),
        my_claim_status: r.my_claim_status,
      };
    })
    .sort((a, b) => b.score - a.score || a.hours_left - b.hours_left)
    .slice(0, limit);
}

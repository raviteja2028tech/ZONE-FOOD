import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { Params, n, notFoundError, paged, type Page } from "@/lib/db/sql";
import { AppError } from "@/lib/http/errors";
import { forbidden, type SessionUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { allowedActions, roleMayPerform, type ClaimAction, type ClaimStatus } from "@/lib/domain/claims";
import { capacityFit, haversineKm, hybridScore, proximityScore, round4, similarityFromDistance } from "@/lib/domain/matching";

export interface ClaimRow {
  claim_id: number;
  listing_id: number;
  recipient_id: number;
  org_name: string;
  establishment_id: number;
  establishment_name: string;
  description: string;
  food_name: string | null;
  claimed_qty_kg: number;
  offered_qty_kg: number;
  match_score: number | null;
  status: ClaimStatus;
  requested_at: string;
  collected_at: string | null;
  listing_expires_at: string;
  allowed_actions: ClaimAction[];
}

export interface ClaimFilters {
  establishmentId?: number;
  recipientId?: number;
  status?: string;
}

/** Claims visible to the caller. Scope comes from the session (never the request), so users only see their own side. */
export async function listClaims(user: SessionUser, f: ClaimFilters, page: Page) {
  const params = new Params();
  const where: string[] = [];
  if (f.establishmentId) where.push(`l.establishment_id = ${params.add(f.establishmentId)}`);
  if (f.recipientId) where.push(`c.recipient_id = ${params.add(f.recipientId)}`);
  if (f.status) where.push(`c.status = ${params.add(f.status)}::claim_status`);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const from = `FROM redistribution_claim c
    JOIN surplus_listing l ON l.listing_id = c.listing_id
    JOIN establishment e ON e.establishment_id = l.establishment_id
    JOIN recipient_org r ON r.recipient_id = c.recipient_id
    LEFT JOIN food_item fi ON fi.food_id = l.food_id`;
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n ${from} ${clause}`, params.values);
  const rows = await query<Omit<ClaimRow, "allowed_actions">>(
    `SELECT c.claim_id, c.listing_id, c.recipient_id, r.org_name, l.establishment_id, e.name AS establishment_name,
            l.description, fi.canonical_name AS food_name, c.claimed_qty_kg, l.offered_qty_kg, c.match_score, c.status,
            c.requested_at, c.collected_at, l.expires_at AS listing_expires_at
       ${from} ${clause}
      ORDER BY (c.status IN ('REQUESTED','APPROVED')) DESC, c.requested_at DESC, c.claim_id DESC
      LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  const mapped: ClaimRow[] = rows.map((r) => {
    const own =
      (user.establishmentId !== null && r.establishment_id === user.establishmentId) ||
      (user.recipientId !== null && r.recipient_id === user.recipientId);
    return {
      ...r,
      claimed_qty_kg: n(r.claimed_qty_kg),
      offered_qty_kg: n(r.offered_qty_kg),
      match_score: r.match_score === null ? null : n(r.match_score),
      // Offer only the actions this role may take on a claim it owns, from its current state.
      allowed_actions: own ? allowedActions(r.status).filter((a) => roleMayPerform(user.role, a) && actorMayAct(user, a)) : [],
    };
  });
  return paged(mapped, total?.n ?? 0, page);
}

/** Recipients only confirm pickup; establishments approve/reject/hand over. */
function actorMayAct(user: SessionUser, action: ClaimAction): boolean {
  if (user.role === "RECIPIENT_AGENT") return action === "collect";
  return true;
}

/** Claims per status for the summary strip (same scoping rules as the list). */
export async function claimCounts(f: { establishmentId?: number; recipientId?: number }) {
  const params = new Params();
  const where: string[] = [];
  if (f.establishmentId) where.push(`l.establishment_id = ${params.add(f.establishmentId)}`);
  if (f.recipientId) where.push(`c.recipient_id = ${params.add(f.recipientId)}`);
  const rows = await query<{ status: string; n: number; kg: string }>(
    `SELECT c.status::text AS status, count(*)::int AS n, COALESCE(sum(c.claimed_qty_kg), 0) AS kg
       FROM redistribution_claim c JOIN surplus_listing l ON l.listing_id = c.listing_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY c.status`,
    params.values,
  );
  return Object.fromEntries(rows.map((r) => [r.status, { n: r.n, kg: n(r.kg) }])) as Record<string, { n: number; kg: number }>;
}

/* ---------------------------------------------------------------------------- create */

/**
 * Requests a claim. ALL hard rules (listing open and not expired, same locality, cooked-food policy, quantity,
 * daily capacity, duplicate) live in the stored function fn_claim_surplus, which locks the listing row so competing
 * claimants are serialised. The application only computes the informational match score.
 */
export async function createClaim(user: SessionUser, recipientId: number, input: { listingId: number; claimedQtyKg: number }) {
  const info = await queryOne<{
    offered: string; claimed: string; cap: string; e_lat: string | null; e_lng: string | null; z_lat: string | null; z_lng: string | null; distance: string | null;
  }>(
    `SELECT sl.offered_qty_kg AS offered, sl.claimed_qty_kg AS claimed, r.daily_capacity_kg AS cap,
            e.lat AS e_lat, e.lng AS e_lng, z.centroid_lat AS z_lat, z.centroid_lng AS z_lng,
            CASE WHEN r.need_embedding IS NULL OR sl.desc_embedding IS NULL THEN NULL ELSE (r.need_embedding <=> sl.desc_embedding) END AS distance
       FROM surplus_listing sl
       JOIN establishment e ON e.establishment_id = sl.establishment_id
       JOIN recipient_org r ON r.recipient_id = $2
       JOIN zone z ON z.zone_id = r.zone_id
      WHERE sl.listing_id = $1`,
    [input.listingId, recipientId],
  );
  if (!info) throw notFoundError("Surplus listing");

  // Stored with the claim so the match quality at request time is auditable (proximity normalised over a fixed 10 km).
  const remaining = n(info.offered) - n(info.claimed);
  const semantic = info.distance === null ? null : similarityFromDistance(Number(info.distance));
  const km = info.e_lat && info.e_lng && info.z_lat && info.z_lng ? haversineKm(+info.e_lat, +info.e_lng, +info.z_lat, +info.z_lng) : null;
  const score = round4(hybridScore({ semantic, capacity: capacityFit(remaining, n(info.cap)), proximity: km === null ? 0.5 : proximityScore(km, 10) }));

  return withTransaction(async (c) => {
    const r = await c.query<{ id: number }>("SELECT fn_claim_surplus($1, $2, $3, $4) AS id", [input.listingId, recipientId, input.claimedQtyKg, score]);
    return { claimId: r.rows[0]!.id, matchScore: score };
  }, { userId: user.userId });
}

/* ------------------------------------------------------------------------ transition */

/**
 * approve | reject | collect | no_show. Permission by role is checked here; the transition itself - locking order,
 * stock reservation, release on no-show, the redistribution record on collection - is the stored function
 * fn_transition_claim, and trigger tr_claim_guard independently refuses any illegal status change.
 */
export async function transitionClaim(user: SessionUser, claimId: number, action: ClaimAction) {
  if (!roleMayPerform(user.role, action) || !actorMayAct(user, action)) throw forbidden();
  return withTransaction(async (c) => {
    const r = await c.query<{ o_claim_status: ClaimStatus; o_listing_status: string }>(
      "SELECT * FROM fn_transition_claim($1, $2, $3, $4)",
      [claimId, action, user.establishmentId, user.recipientId],
    );
    const row = r.rows[0]!;
    return { claimId, status: row.o_claim_status, listingStatus: row.o_listing_status };
  }, { userId: user.userId });
}

/** Guard used by routes before calling transitionClaim, so the caller gets a precise 403 for the wrong role. */
export function assertClaimActionPermitted(user: SessionUser, action: ClaimAction) {
  if (!roleMayPerform(user.role, action) || !actorMayAct(user, action)) {
    throw new AppError(403, "FORBIDDEN", "Your role cannot perform this action on a claim.");
  }
  if (action === "collect" && !(can(user.role, "claim:collect") || can(user.role, "claim:handover"))) throw forbidden();
}

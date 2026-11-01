import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { hashPassword } from "@/lib/auth/password";
import { parseWith } from "@/lib/validation/parse";
import { profileSchemas } from "@/lib/validation/schemas";
import { tryEmbedLiteral } from "@/lib/embeddings/embedder";
import { unprocessable } from "@/lib/db/sql";
import type { z } from "zod";
import type { registerEstablishmentSchema, registerRecipientSchema } from "@/lib/validation/schemas";

export interface LoginRow {
  user_id: number;
  password_hash: string;
  is_active: boolean;
}

export const findLoginRow = (email: string) =>
  queryOne<LoginRow>("SELECT user_id, password_hash, is_active FROM app_user WHERE email = $1", [email]);

export const touchLastLogin = (userId: number) =>
  query("UPDATE app_user SET last_login_at = now() WHERE user_id = $1", [userId]);

type EstablishmentKind = "COMMERCIAL" | "EDUCATIONAL" | "ORGANIZATIONAL" | "RESIDENTIAL" | "RECREATIONAL" | "RETAIL_FOOD" | "HEALTHCARE";

/** Which subtype profile table each establishment kind uses (Part 1 disjoint specialisation). */
function profileKindFor(kind: EstablishmentKind): "commercial" | "institutional" | "residential" {
  if (kind === "RESIDENTIAL") return "residential";
  if (kind === "EDUCATIONAL" || kind === "ORGANIZATIONAL" || kind === "HEALTHCARE") return "institutional";
  return "commercial";
}

/**
 * Registers an establishment AND its first manager in one transaction: either the establishment, its subtype
 * profile and the account all exist afterwards, or none of them do.
 */
export async function registerEstablishment(input: z.infer<typeof registerEstablishmentSchema>): Promise<number> {
  const est = input.establishment;
  const hash = await hashPassword(input.password); // slow work outside the transaction

  return withTransaction(async (c) => {
    const cat = await c.query<{ kind: EstablishmentKind }>("SELECT kind FROM establishment_category WHERE category_id = $1", [est.categoryId]);
    if (!cat.rows[0]) throw unprocessable("Choose a valid establishment category.", { categoryId: "Unknown category" });
    const kind = cat.rows[0].kind;
    const profileKind = profileKindFor(kind);
    const profile = parseWith(profileSchemas[profileKind], input.profile);

    const zone = await c.query<{ zone_level: number }>("SELECT zone_level FROM zone WHERE zone_id = $1", [est.zoneId]);
    if (!zone.rows[0]) throw unprocessable("Choose a valid zone.", { zoneId: "Unknown zone" });
    if (zone.rows[0].zone_level !== 3) throw unprocessable("Choose a street-level zone.", { zoneId: "Pick a street (lowest-level zone)" });

    const created = await c.query<{ establishment_id: number }>(
      `INSERT INTO establishment (zone_id, category_id, name, address_line, capacity, operational_since)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING establishment_id`,
      [est.zoneId, est.categoryId, est.name, est.addressLine ?? null, est.capacity, est.operationalSince],
    );
    const estId = created.rows[0]!.establishment_id;

    if (profileKind === "commercial") {
      const p = profile as { cuisineType?: string; seatingCapacity?: number; avgDailyCovers?: number; hasBuffet: boolean; fssaiLicense?: string };
      await c.query(
        `INSERT INTO commercial_profile (establishment_id, cuisine_type, seating_capacity, avg_daily_covers, has_buffet, fssai_license)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [estId, p.cuisineType ?? null, p.seatingCapacity ?? null, p.avgDailyCovers ?? null, p.hasBuffet, p.fssaiLicense ?? null],
      );
    } else if (profileKind === "institutional") {
      const p = profile as { enrolledStrength: number; messType?: string; servesMealsPerDay: number };
      await c.query(
        `INSERT INTO institutional_profile (establishment_id, enrolled_strength, mess_type, serves_meals_per_day)
         VALUES ($1, $2, $3, $4)`,
        [estId, p.enrolledStrength, p.messType ?? null, p.servesMealsPerDay],
      );
    } else {
      const p = profile as { householdCount: number; totalOccupants: number; hasCommonKitchen: boolean; segregationCompliant: boolean };
      await c.query(
        `INSERT INTO residential_profile (establishment_id, household_count, total_occupants, has_common_kitchen, segregation_compliant)
         VALUES ($1, $2, $3, $4, $5)`,
        [estId, p.householdCount, p.totalOccupants, p.hasCommonKitchen, p.segregationCompliant],
      );
    }

    const user = await c.query<{ user_id: number }>(
      `INSERT INTO app_user (establishment_id, email, password_hash, full_name, role, phone)
       VALUES ($1, $2, $3, $4, 'ESTAB_MANAGER', $5) RETURNING user_id`,
      [estId, input.email, hash, input.fullName, input.phone ?? null],
    );
    return user.rows[0]!.user_id;
  });
}

/** Registers a recipient organisation and its agent account atomically, then embeds the need profile (best effort). */
export async function registerRecipient(input: z.infer<typeof registerRecipientSchema>): Promise<number> {
  const org = input.org;
  const hash = await hashPassword(input.password);

  const { userId, recipientId } = await withTransaction(async (c) => {
    const zone = await c.query<{ zone_level: number }>("SELECT zone_level FROM zone WHERE zone_id = $1", [org.zoneId]);
    if (!zone.rows[0]) throw unprocessable("Choose a valid zone.", { zoneId: "Unknown zone" });
    const r = await c.query<{ recipient_id: number }>(
      `INSERT INTO recipient_org (zone_id, org_name, org_type, need_profile, daily_capacity_kg, accepts_cooked,
                                  pickup_window_start, pickup_window_end, contact_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING recipient_id`,
      [org.zoneId, org.orgName, org.orgType, org.needProfile, org.dailyCapacityKg, org.acceptsCooked, org.pickupWindowStart, org.pickupWindowEnd, org.contactPhone ?? null],
    );
    const u = await c.query<{ user_id: number }>(
      `INSERT INTO app_user (recipient_id, email, password_hash, full_name, role, phone)
       VALUES ($1, $2, $3, $4, 'RECIPIENT_AGENT', $5) RETURNING user_id`,
      [r.rows[0]!.recipient_id, input.email, hash, input.fullName, input.phone ?? null],
    );
    return { userId: u.rows[0]!.user_id, recipientId: r.rows[0]!.recipient_id };
  });

  await embedRecipientNeed(recipientId, org.needProfile);
  return userId;
}

/** Stores the need-profile embedding; silently leaves NULL if the model is unavailable (the backfill repairs it). */
export async function embedRecipientNeed(recipientId: number, needProfile: string): Promise<boolean> {
  const literal = await tryEmbedLiteral(needProfile);
  if (!literal) return false;
  await query("UPDATE recipient_org SET need_embedding = $1::vector WHERE recipient_id = $2", [literal, recipientId]);
  return true;
}

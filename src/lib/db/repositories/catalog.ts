import "server-only";
import { query, queryOne } from "@/lib/db/postgres";
import { likePattern, paged, type Page } from "@/lib/db/sql";
import { tryEmbedLiteral } from "@/lib/embeddings/embedder";
import type { z } from "zod";
import type { foodItemSchema } from "@/lib/validation/schemas";

/* Reference data used by forms and filters. All small, read-only lookups. */

export interface Option {
  id: number;
  label: string;
}

export const listCategoriesForRegistration = () =>
  query<{ id: number; label: string; kind: string; metric: string }>(
    "SELECT category_id AS id, category_name AS label, kind, capacity_metric AS metric FROM establishment_category ORDER BY kind, category_name",
  );

/** Street-level (leaf) zones labelled "Block > Street" for registration forms. */
export const listStreetZones = () =>
  query<Option>(
    `SELECT z.zone_id AS id, p.zone_name || ' › ' || z.zone_name AS label
       FROM zone z JOIN zone p ON p.zone_id = z.parent_zone_id
      WHERE z.zone_level = 3 ORDER BY p.zone_name, z.zone_name`,
  );

export const listAllZones = () =>
  query<Option & { level: number }>("SELECT zone_id AS id, zone_name AS label, zone_level AS level FROM zone ORDER BY zone_level, zone_name");

export const listFoodCategories = () =>
  query<Option>("SELECT food_category_id AS id, category_name AS label FROM food_category ORDER BY category_name");
export const listSuppliers = () => query<Option>("SELECT supplier_id AS id, name AS label FROM supplier ORDER BY name");

/** REDISTRIBUTED is system-written when a claim is collected, so it is not offered for manual waste entry. */
export const listWasteReasons = (includeSystem = false) =>
  query<Option & { code: string }>(
    `SELECT reason_id AS id, description AS label, reason_code AS code FROM waste_reason
      WHERE ($1 OR reason_code <> 'REDISTRIBUTED') ORDER BY reason_code`,
    [includeSystem],
  );
export const listDisposalRoutes = () =>
  query<Option & { name: string }>("SELECT route_id AS id, route_name AS label, route_name AS name FROM disposal_route ORDER BY route_name");

export interface FoodRow {
  food_id: number;
  canonical_name: string;
  category_name: string;
  base_unit: string;
  avg_cost_per_unit: string;
  is_edible_as_is: boolean;
  has_embedding: boolean;
  score?: number;
}

/**
 * Typo-tolerant search over food names via the stored function fn_search_food (full-text rank, trigram similarity,
 * substring; best first). Used by the pickers in the procurement and waste forms and the Food catalogue page.
 */
export async function searchFood(q: string, limit = 15): Promise<FoodRow[]> {
  const term = q.trim().toLowerCase();
  if (!term) {
    return query<FoodRow>(
      `SELECT f.food_id, f.canonical_name, c.category_name, f.base_unit, f.avg_cost_per_unit, f.is_edible_as_is,
              f.name_embedding IS NOT NULL AS has_embedding
         FROM food_item f JOIN food_category c USING (food_category_id) ORDER BY f.canonical_name LIMIT $1`,
      [limit],
    );
  }
  return query<FoodRow>("SELECT * FROM fn_search_food($1, $2)", [term, limit]);   // stored function: full-text + trigram + substring
}

export async function listFoodPage(q: string, p: Page, categoryId?: number) {
  const term = q.trim().toLowerCase();
  const where = `($1 = '' OR lower(f.canonical_name) LIKE $2 ESCAPE '\\' OR similarity(lower(f.canonical_name), $1) > 0.3)
                 AND ($3::int IS NULL OR f.food_category_id = $3)`;
  const args = [term, likePattern(term), categoryId ?? null];
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM food_item f WHERE ${where}`, args);
  const rows = await query<FoodRow>(
    `SELECT f.food_id, f.canonical_name, c.category_name, f.base_unit, f.avg_cost_per_unit, f.is_edible_as_is,
            f.name_embedding IS NOT NULL AS has_embedding
       FROM food_item f JOIN food_category c USING (food_category_id)
      WHERE ${where} ORDER BY f.canonical_name LIMIT $4 OFFSET $5`,
    [...args, p.pageSize, p.offset],
  );
  return paged(rows, total?.n ?? 0, p);
}

export async function createFoodItem(input: z.infer<typeof foodItemSchema>): Promise<number> {
  const row = await queryOne<{ food_id: number }>(
    `INSERT INTO food_item (food_category_id, canonical_name, description, base_unit, avg_cost_per_unit, is_edible_as_is)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING food_id`,
    [input.foodCategoryId, input.canonicalName, input.description ?? null, input.baseUnit, input.avgCostPerUnit, input.isEdibleAsIs],
  );
  const id = row!.food_id;
  const literal = await tryEmbedLiteral(input.canonicalName);
  if (literal) await query("UPDATE food_item SET name_embedding = $1::vector WHERE food_id = $2", [literal, id]);
  return id;
}

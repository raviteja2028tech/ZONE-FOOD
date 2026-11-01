import { z } from "zod";
import { createFoodItem, searchFood } from "@/lib/db/repositories/catalog";
import { logActivity } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { qText } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { foodItemSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** GET /api/food?q= - typo-tolerant food search (pickers in forms). */
export const GET = api("food:read", async ({ request }) => {
  const { q } = parseSearchParams(request, z.object({ q: qText }));
  return json(await searchFood(q ?? "", 15));
});

/** POST /api/food - zone admin adds a canonical food item (name embedding is computed for semantic matching). */
export const POST = api("food:manage", async ({ request, user }) => {
  const input = await parseJson(request, foodItemSchema);
  const foodId = await createFoodItem(input);
  void logActivity(user, "CREATE_FOOD_ITEM", { food_id: foodId });
  return json({ foodId }, { status: 201 });
});

import { explainFoodName } from "@/lib/db/repositories/name-resolution";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { matchNameSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** POST /api/matching/name {name} - runs the resolution cascade and returns every stage's candidates (writes nothing). */
export const POST = api("matching:use", async ({ request }) => {
  const { name } = await parseJson(request, matchNameSchema);
  return json(await explainFoodName(name));
});

import { ownEstablishmentId } from "@/lib/auth/guard";
import { createDish, listDishes } from "@/lib/db/repositories/kitchen";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { dishSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = api("service:write", async ({ user }) => json(await listDishes(ownEstablishmentId(user))));

export const POST = api("service:write", async ({ request, user }) => {
  const input = await parseJson(request, dishSchema);
  return json({ dishId: await createDish(ownEstablishmentId(user), input) }, { status: 201 });
});

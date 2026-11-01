import { forbidden } from "@/lib/auth/guard";
import { can, isEstablishmentRole } from "@/lib/auth/permissions";
import { getEstablishment, updateEstablishment } from "@/lib/db/repositories/organisations";
import { logActivity } from "@/lib/db/repositories/documents";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { updateEstablishmentSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** GET - authority roles see any establishment; establishment users only their own; recipients none. */
export const GET = api<{ id: string }>("dashboard:view", async ({ user, params }) => {
  const id = parseId(params.id);
  if (isEstablishmentRole(user.role) && user.establishmentId !== id) throw forbidden("You can only view your own establishment.");
  if (user.role === "RECIPIENT_AGENT") throw forbidden();
  return json(await getEstablishment(id));
});

/** PATCH - a zone admin may edit any establishment (incl. zone and active flag); a manager only their own basic details. */
export const PATCH = api<{ id: string }>(null, async ({ request, user, params }) => {
  const id = parseId(params.id);
  const admin = can(user.role, "establishment:manage");
  const owner = can(user.role, "establishment:update-own") && user.establishmentId === id;
  if (!admin && !owner) throw forbidden("You cannot edit this establishment.");
  const patch = await parseJson(request, updateEstablishmentSchema);
  const updated = await updateEstablishment(id, patch, admin, user.userId);
  void logActivity(user, "UPDATE_ESTABLISHMENT", { establishment_id: id, fields: Object.keys(patch) });
  return json(updated);
});

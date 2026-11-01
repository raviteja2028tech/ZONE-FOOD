import { forbidden } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getRecipient, updateRecipient } from "@/lib/db/repositories/organisations";
import { logActivity } from "@/lib/db/repositories/documents";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { updateRecipientSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>("dashboard:view", async ({ user, params }) => {
  const id = parseId(params.id);
  const allowed = can(user.role, "recipient:list") || user.recipientId === id;
  if (!allowed) throw forbidden("You can only view your own organisation.");
  return json(await getRecipient(id));
});

/** PATCH - a zone admin may edit any recipient; a recipient agent only their own organisation. */
export const PATCH = api<{ id: string }>(null, async ({ request, user, params }) => {
  const id = parseId(params.id);
  const admin = can(user.role, "recipient:manage");
  const owner = can(user.role, "recipient:update-own") && user.recipientId === id;
  if (!admin && !owner) throw forbidden("You cannot edit this organisation.");
  const patch = await parseJson(request, updateRecipientSchema);
  const updated = await updateRecipient(id, patch, user.userId);
  void logActivity(user, "UPDATE_RECIPIENT", { recipient_id: id, fields: Object.keys(patch) });
  return json(updated);
});

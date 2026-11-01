import { assertClaimActionPermitted, transitionClaim } from "@/lib/db/repositories/claims";
import { logActivity } from "@/lib/db/repositories/documents";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { claimActionSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** PATCH /api/claims/:id {action} - approve | reject | collect | no_show. Illegal transitions are a 409. */
export const PATCH = api<{ id: string }>("claim:read", async ({ request, user, params }) => {
  const { action } = await parseJson(request, claimActionSchema);
  assertClaimActionPermitted(user, action);
  const result = await transitionClaim(user, parseId(params.id), action);
  void logActivity(user, `CLAIM_${action.toUpperCase()}`, { claim_id: result.claimId });
  return json(result);
});

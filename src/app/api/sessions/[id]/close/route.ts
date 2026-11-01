import { ownEstablishmentId } from "@/lib/auth/guard";
import { closeSession } from "@/lib/db/repositories/kitchen";
import { logActivity } from "@/lib/db/repositories/documents";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { closeSessionSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/:id/close - records consumption for every batch and closes the session in one transaction.
 * The database trigger rejects served + leftover > prepared; that rolls the whole close back.
 */
export const POST = api<{ id: string }>("service:write", async ({ request, user, params }) => {
  const input = await parseJson(request, closeSessionSchema);
  const result = await closeSession(ownEstablishmentId(user), user.userId, parseId(params.id), input);
  void logActivity(user, "CLOSE_SESSION", { session_id: result.sessionId, surplus_listings: result.listingIds.length });
  return json(result);
});

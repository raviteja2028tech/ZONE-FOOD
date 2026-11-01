import { z } from "zod";
import { ownRecipientId } from "@/lib/auth/guard";
import { createClaim, listClaims } from "@/lib/db/repositories/claims";
import { logActivity } from "@/lib/db/repositories/documents";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { qPage, qText } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { claimCreateSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** GET /api/claims - claims visible to the caller: recipients see their own, establishments those on their listings, authorities all. */
export const GET = api("claim:read", async ({ request, user }) => {
  const q = parseSearchParams(request, z.object({ status: qText, page: qPage }));
  const scope = user.role === "RECIPIENT_AGENT" ? { recipientId: ownRecipientId(user) } : user.establishmentId !== null ? { establishmentId: user.establishmentId } : {};
  return json(await listClaims(user, { ...scope, status: q.status }, parsePage({ page: q.page?.toString() })));
});

/** POST /api/claims - a recipient claims part or all of a listing (locks the listing; duplicates are a 409). */
export const POST = api("claim:create", async ({ request, user }) => {
  const input = await parseJson(request, claimCreateSchema);
  const result = await createClaim(user, ownRecipientId(user), input);
  void logActivity(user, "CLAIM_LISTING", { listing_id: input.listingId, qty_kg: input.claimedQtyKg });
  return json(result, { status: 201 });
});

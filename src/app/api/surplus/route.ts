import { z } from "zod";
import { ownEstablishmentId } from "@/lib/auth/guard";
import { createListing, listListings } from "@/lib/db/repositories/surplus";
import { logActivity } from "@/lib/db/repositories/documents";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope, qId, qPage, qText } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { listingSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = api("surplus:read", async ({ request, user }) => {
  const q = parseSearchParams(request, z.object({ establishmentId: qId, status: qText, q: qText, page: qPage }));
  const scope = establishmentScope(user, q.establishmentId);
  return json(await listListings({ ...scope, status: q.status, q: q.q }, parsePage({ page: q.page?.toString() })));
});

/** POST /api/surplus - publishes a listing and embeds its description for semantic matching. */
export const POST = api("surplus:write", async ({ request, user }) => {
  const input = await parseJson(request, listingSchema);
  const result = await createListing(ownEstablishmentId(user), input, user.userId);
  void logActivity(user, "CREATE_LISTING", { listing_id: result.listingId, qty_kg: input.offeredQtyKg });
  return json(result, { status: 201 });
});

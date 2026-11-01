import { rankRecipientsForListing } from "@/lib/db/repositories/surplus";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope } from "@/lib/http/scope";

export const dynamic = "force-dynamic";

/** GET /api/surplus/:id/matches - feasible recipients ranked by the hybrid score (hard filters first, then similarity). */
export const GET = api<{ id: string }>("surplus:read", async ({ user, params }) =>
  json(await rankRecipientsForListing(parseId(params.id), establishmentScope(user))),
);

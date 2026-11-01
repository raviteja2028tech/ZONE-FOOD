import { ownEstablishmentId } from "@/lib/auth/guard";
import { cancelListing } from "@/lib/db/repositories/surplus";
import { logActivity } from "@/lib/db/repositories/documents";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** POST /api/surplus/:id/cancel - withdraws a listing; pending requests are rejected, approved/collected ones block it. */
export const POST = api<{ id: string }>("surplus:write", async ({ user, params }) => {
  const result = await cancelListing(ownEstablishmentId(user), parseId(params.id), user.userId);
  void logActivity(user, "CANCEL_LISTING", { listing_id: result.listingId });
  return json(result);
});

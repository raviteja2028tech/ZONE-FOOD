import { ownRecipientId } from "@/lib/auth/guard";
import { feedForRecipient } from "@/lib/db/repositories/surplus";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** GET /api/feed - available surplus for the caller's organisation, ranked by hybrid match score. */
export const GET = api("feed:read", async ({ user }) => json(await feedForRecipient(ownRecipientId(user))));

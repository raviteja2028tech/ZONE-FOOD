import { backfillEmbeddings, embeddingCoverage } from "@/lib/db/repositories/name-resolution";
import { logActivity } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/embeddings/backfill - embeds rows whose vector is still NULL (food names, need profiles, recent listings). Idempotent. */
export const POST = api("embeddings:manage", async ({ user }) => {
  const done = await backfillEmbeddings();
  void logActivity(user, "BACKFILL_EMBEDDINGS", done);
  return json({ done, coverage: await embeddingCoverage() });
});

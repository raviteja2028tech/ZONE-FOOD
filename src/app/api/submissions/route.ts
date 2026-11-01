import { z } from "zod";
import { ownEstablishmentId } from "@/lib/auth/guard";
import { createSubmission, listSubmissions, submissionStats } from "@/lib/db/repositories/documents";
import { logActivity } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope, qId, qText } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { submissionSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = api("submission:read", async ({ request, user }) => {
  const q = parseSearchParams(request, z.object({ establishmentId: qId, status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["PENDING", "SYNCED", "FAILED"]).optional()), limit: qText }));
  const scope = establishmentScope(user, q.establishmentId);
  const [docs, stats] = await Promise.all([listSubmissions({ ...scope, status: q.status }), submissionStats(scope)]);
  return json({ docs, stats });
});

/**
 * POST /api/submissions - stores a differently-shaped daily field log in MongoDB as PENDING. The payload is validated
 * against the shape for the caller's establishment kind; the ETL later projects it into PostgreSQL.
 */
export const POST = api("submission:write", async ({ request, user }) => {
  const input = await parseJson(request, submissionSchema);
  const result = await createSubmission(user, ownEstablishmentId(user), input);
  void logActivity(user, "SUBMIT_LOG", { doc_id: result.id, kind: result.kind });
  return json(result, { status: 201 });
});

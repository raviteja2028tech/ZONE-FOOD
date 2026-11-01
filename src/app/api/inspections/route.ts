import { z } from "zod";
import { forbidden } from "@/lib/auth/guard";
import { createInspection, listInspections, logActivity } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope, qId } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { inspectionSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = api("inspection:read", async ({ request, user }) => {
  const q = parseSearchParams(request, z.object({ establishmentId: qId }));
  return json(await listInspections(establishmentScope(user, q.establishmentId)));
});

/** POST /api/inspections - a manager logs a self-inspection; a zone admin may log one for any establishment. */
export const POST = api("inspection:write", async ({ request, user }) => {
  const input = await parseJson(request, inspectionSchema);
  const establishmentId = user.establishmentId ?? input.establishmentId;
  if (!establishmentId) throw forbidden("Choose an establishment to inspect.");
  // Establishment managers are pinned to their own establishment regardless of the body.
  const result = await createInspection(user, user.establishmentId ?? establishmentId, input);
  void logActivity(user, "CREATE_INSPECTION", { doc_id: result.id, establishment_id: establishmentId });
  return json(result, { status: 201 });
});

import { z } from "zod";
import { ownEstablishmentId } from "@/lib/auth/guard";
import { listProcurements, recordProcurement } from "@/lib/db/repositories/inventory";
import { logActivity } from "@/lib/db/repositories/documents";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope, qId, qPage } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { procurementSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = api("procurement:read", async ({ request, user }) => {
  const q = parseSearchParams(request, z.object({ establishmentId: qId, page: qPage }));
  return json(await listProcurements(establishmentScope(user, q.establishmentId), parsePage({ page: q.page?.toString() })));
});

/** POST /api/procurement - header + lines + inventory lots in one transaction, always for the caller's own establishment. */
export const POST = api("procurement:write", async ({ request, user }) => {
  const input = await parseJson(request, procurementSchema);
  const id = await recordProcurement(ownEstablishmentId(user), user.userId, input);
  void logActivity(user, "RECORD_PROCUREMENT", { procurement_id: id, lines: input.lines.length });
  return json({ procurementId: id }, { status: 201 });
});

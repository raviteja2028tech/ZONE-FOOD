import { z } from "zod";
import { ownEstablishmentId } from "@/lib/auth/guard";
import { listWaste, recordWaste } from "@/lib/db/repositories/waste";
import { logActivity } from "@/lib/db/repositories/documents";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope, qDate, qId, qPage, qText } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { stages, wasteSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const filters = z.object({
  establishmentId: qId,
  from: qDate,
  to: qDate,
  stage: z.preprocess((v) => (v === "" ? undefined : v), z.enum(stages).optional()),
  reasonId: qId,
  q: qText,
  page: qPage,
});

/** GET /api/waste - server-side filtered history; establishment roles are pinned to their own establishment. */
export const GET = api("waste:read", async ({ request, user }) => {
  const q = parseSearchParams(request, filters);
  const scope = establishmentScope(user, q.establishmentId);
  return json(await listWaste({ ...scope, from: q.from, to: q.to, stage: q.stage, reasonId: q.reasonId, q: q.q }, parsePage({ page: q.page?.toString() })));
});

/** POST /api/waste - cost and CO2e are derived by a database trigger; a lot write-off deducts stock transactionally. */
export const POST = api("waste:write", async ({ request, user }) => {
  const input = await parseJson(request, wasteSchema);
  const result = await recordWaste(ownEstablishmentId(user), input);
  void logActivity(user, "LOG_WASTE", { waste_id: result.wasteId, qty_kg: input.quantityKg });
  return json(result, { status: 201 });
});

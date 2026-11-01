import { z } from "zod";
import { inventorySummary, listLots } from "@/lib/db/repositories/inventory";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope, qId, qPage, qText } from "@/lib/http/scope";
import { parseSearchParams } from "@/lib/validation/parse";

export const dynamic = "force-dynamic";

export const GET = api("inventory:read", async ({ request, user }) => {
  const q = parseSearchParams(request, z.object({ establishmentId: qId, q: qText, state: z.enum(["all", "fresh", "expiring", "expired"]).optional(), page: qPage }));
  const scope = establishmentScope(user, q.establishmentId);
  const [lots, summary] = await Promise.all([listLots(scope, { q: q.q, state: q.state }, parsePage({ page: q.page?.toString() })), inventorySummary(scope)]);
  return json({ ...lots, summary });
});

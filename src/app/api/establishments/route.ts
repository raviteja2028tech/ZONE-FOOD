import { z } from "zod";
import { listEstablishments } from "@/lib/db/repositories/organisations";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { qId, qPage, qText } from "@/lib/http/scope";
import { parseSearchParams } from "@/lib/validation/parse";

export const dynamic = "force-dynamic";

const query = z.object({ q: qText, zoneId: qId, kind: qText, status: z.enum(["active", "inactive", "all"]).optional(), page: qPage });

/** GET /api/establishments - authority roles only (zone-wide directory). Establishment users see only their own record. */
export const GET = api("establishment:list", async ({ request }) => {
  const q = parseSearchParams(request, query);
  return json(await listEstablishments({ q: q.q, zoneId: q.zoneId, kind: q.kind, status: q.status ?? "all" }, parsePage({ page: q.page?.toString() })));
});

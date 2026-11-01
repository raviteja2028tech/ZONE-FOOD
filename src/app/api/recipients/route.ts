import { z } from "zod";
import { listRecipients } from "@/lib/db/repositories/organisations";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { qPage, qText } from "@/lib/http/scope";
import { parseSearchParams } from "@/lib/validation/parse";

export const dynamic = "force-dynamic";

/** GET /api/recipients - zone-wide directory of recipient organisations (authority roles). */
export const GET = api("recipient:list", async ({ request }) => {
  const q = parseSearchParams(request, z.object({ q: qText, page: qPage }));
  return json(await listRecipients(q.q, parsePage({ page: q.page?.toString() })));
});

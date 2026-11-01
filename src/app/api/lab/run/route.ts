import { z } from "zod";
import { runCatalogueQuery } from "@/lib/lab";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ id: z.string().regex(/^Q\d\d$/, "Unknown query id"), explain: z.boolean().default(false) });

/** POST /api/lab/run {id, explain} - runs ONE documented catalogue query (looked up by id; never raw SQL), read-only or rolled back. */
export const POST = api("lab:use", async ({ request }) => {
  const { id, explain } = await parseJson(request, body);
  return json(await runCatalogueQuery(id, explain));
});

import { z } from "zod";
import { runDemo } from "@/lib/lab";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";

export const dynamic = "force-dynamic";

/** POST /api/lab/demo {id} - runs a live constraint/trigger demonstration inside a transaction that is always rolled back. */
export const POST = api("lab:use", async ({ request }) => {
  const { id } = await parseJson(request, z.object({ id: z.string().regex(/^D\d\d$/, "Unknown demonstration id") }));
  return json(await runDemo(id));
});

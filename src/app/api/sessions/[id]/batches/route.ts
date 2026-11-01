import { ownEstablishmentId } from "@/lib/auth/guard";
import { addBatch } from "@/lib/db/repositories/kitchen";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { batchSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** POST /api/sessions/:id/batches - record a prepared batch against an open session of the caller's establishment. */
export const POST = api<{ id: string }>("service:write", async ({ request, user, params }) => {
  const input = await parseJson(request, batchSchema);
  const batchId = await addBatch(ownEstablishmentId(user), parseId(params.id), input);
  return json({ batchId }, { status: 201 });
});

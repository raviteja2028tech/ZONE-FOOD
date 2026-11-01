import { z } from "zod";
import { ownEstablishmentId } from "@/lib/auth/guard";
import { listSessions, openSession } from "@/lib/db/repositories/kitchen";
import { logActivity } from "@/lib/db/repositories/documents";
import { parsePage } from "@/lib/db/sql";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope, qId, qPage } from "@/lib/http/scope";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { openSessionSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = api("service:read", async ({ request, user }) => {
  const q = parseSearchParams(request, z.object({ establishmentId: qId, page: qPage }));
  return json(await listSessions(establishmentScope(user, q.establishmentId), parsePage({ page: q.page?.toString() })));
});

/** POST /api/sessions - open a service session (one per establishment/date/slot; duplicates are a 409). */
export const POST = api("service:write", async ({ request, user }) => {
  const input = await parseJson(request, openSessionSchema);
  const sessionId = await openSession(ownEstablishmentId(user), input);
  void logActivity(user, "OPEN_SESSION", { session_id: sessionId });
  return json({ sessionId }, { status: 201 });
});

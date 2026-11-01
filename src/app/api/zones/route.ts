import { z } from "zod";
import { createZone, getZoneRollup } from "@/lib/db/repositories/zones";
import { logActivity } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson, parseSearchParams } from "@/lib/validation/parse";
import { zoneSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** GET /api/zones?days= - hierarchical roll-up (recursive CTE) of waste, surplus and redistribution. */
export const GET = api("zone:read", async ({ request }) => {
  const { days } = parseSearchParams(request, z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }));
  return json(await getZoneRollup(days));
});

export const POST = api("zone:manage", async ({ request, user }) => {
  const input = await parseJson(request, zoneSchema);
  const zoneId = await createZone(input);
  void logActivity(user, "CREATE_ZONE", { zone_id: zoneId });
  return json({ zoneId }, { status: 201 });
});

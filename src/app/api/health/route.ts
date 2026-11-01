import { checkSystem } from "@/lib/db/health";
import { json, route } from "@/lib/http/respond";
import { canSeeHealthDetail, redactSystem } from "@/lib/http/health-response";

export const dynamic = "force-dynamic";

/** GET /api/health - overall status (public liveness; details for authority users). 200 when healthy, 503 otherwise. */
export const GET = route(async (request) => {
  const health = await checkSystem();
  const body = (await canSeeHealthDetail(request)) ? health : redactSystem(health);
  return json(body, { status: health.status === "healthy" ? 200 : 503 });
});

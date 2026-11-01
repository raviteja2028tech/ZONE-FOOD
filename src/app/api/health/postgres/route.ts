import { checkConfig, checkPostgres } from "@/lib/db/health";
import { json, route } from "@/lib/http/respond";
import { canSeeHealthDetail, redactPostgres, serviceUnavailableFor } from "@/lib/http/health-response";

export const dynamic = "force-dynamic";

/** GET /api/health/postgres - connectivity (public); versions and counts only for authority users. */
export const GET = route(async (request) => {
  const config = checkConfig();
  if (config.status === "invalid") return serviceUnavailableFor(config);
  const health = await checkPostgres();
  const body = (await canSeeHealthDetail(request)) ? health : redactPostgres(health);
  return json(body, { status: health.status === "up" ? 200 : 503 });
});

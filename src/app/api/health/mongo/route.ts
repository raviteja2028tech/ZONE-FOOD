import { checkConfig, checkMongo } from "@/lib/db/health";
import { json, route } from "@/lib/http/respond";
import { canSeeHealthDetail, redactMongo, serviceUnavailableFor } from "@/lib/http/health-response";

export const dynamic = "force-dynamic";

/** GET /api/health/mongo - connectivity (public); versions and counts only for authority users. */
export const GET = route(async (request) => {
  const config = checkConfig();
  if (config.status === "invalid") return serviceUnavailableFor(config);
  const health = await checkMongo();
  const body = (await canSeeHealthDetail(request)) ? health : redactMongo(health);
  return json(body, { status: health.status === "up" ? 200 : 503 });
});

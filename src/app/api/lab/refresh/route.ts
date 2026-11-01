import { refreshZoneMonthly } from "@/lib/lab";
import { logActivity } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** POST /api/lab/refresh - REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly (zone admin only). */
export const POST = api("lab:refresh", async ({ user }) => {
  const result = await refreshZoneMonthly();
  void logActivity(user, "REFRESH_MATERIALIZED_VIEW", { view: "mv_zone_monthly", ...result });
  return json(result);
});

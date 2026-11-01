import "server-only";
import type { SessionUser } from "@/lib/auth/guard";
import {
  getCounts, getExpiringLots, getKpis, getPendingClaimCount, getRecentActivity, getRecipientStats, getTopWastedFoods, getWasteTrend, getZoneComparison,
} from "@/lib/db/repositories/analytics";
import { feedForRecipient } from "@/lib/db/repositories/surplus";
import { rescueFunnel, sparkline, wasteIntensity } from "@/lib/db/repositories/insights";

/**
 * One loader per role family so the page and /api/analytics/dashboard return identical, live data.
 * Authority roles get the zone-wide view; establishments their own; recipients their intake and feed.
 */
export async function getDashboard(user: SessionUser) {
  if (user.role === "RECIPIENT_AGENT") {
    const recipientId = user.recipientId as number;
    const [stats, feed, activity] = await Promise.all([
      getRecipientStats(recipientId),
      feedForRecipient(recipientId, 5),
      getRecentActivity({ recipientId }),
    ]);
    return { kind: "recipient" as const, stats, feed, activity };
  }

  if (user.establishmentId !== null) {
    const scope = { establishmentId: user.establishmentId };
    const [kpis, trend, topFoods, expiring, pendingClaims, activity, spark, intensity, funnel] = await Promise.all([
      getKpis(scope),
      getWasteTrend(scope),
      getTopWastedFoods(scope),
      getExpiringLots(user.establishmentId),
      getPendingClaimCount(user.establishmentId),
      getRecentActivity(scope),
      sparkline(scope),
      wasteIntensity(user.establishmentId),
      rescueFunnel(scope),
    ]);
    return { kind: "establishment" as const, kpis, trend, topFoods, expiring, pendingClaims, activity, spark, intensity, funnel };
  }

  const [kpis, trend, topFoods, zones, counts, activity, spark, funnel] = await Promise.all([
    getKpis({}),
    getWasteTrend({}),
    getTopWastedFoods({}),
    getZoneComparison(),
    getCounts(),
    getRecentActivity({}),
    sparkline({}),
    rescueFunnel({}),
  ]);
  return { kind: "authority" as const, kpis, trend, topFoods, zones, counts, activity, spark, funnel };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

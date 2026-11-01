import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { isEstablishmentRole } from "@/lib/auth/permissions";
import { evalSeries, latestRun, nextDay } from "@/lib/db/repositories/forecast";

export const dynamic = "force-dynamic";

/**
 * GET /api/forecast - the latest stored forecast run. Authority roles get zone-level evaluation; establishment roles
 * get only their own next-day forecast (never other establishments' figures).
 */
export const GET = api("forecast:view", async ({ user }) => {
  const run = await latestRun();
  if (!run) return json({ run: null });
  const own = isEstablishmentRole(user.role);
  const estId = own ? (user.establishmentId as number) : null;
  const [next, evaluation] = await Promise.all([nextDay(run.runId, estId, run.bestModel), own ? Promise.resolve([]) : evalSeries(run.runId)]);
  return json({ run, nextDay: next, evaluation });
});

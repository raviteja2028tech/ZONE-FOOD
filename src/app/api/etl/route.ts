import { failedDocuments, recentRuns } from "@/lib/db/repositories/etl";
import { submissionStats } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** GET /api/etl - sync queue counts, recent runs and failed documents (authority roles; read-only for auditors). */
export const GET = api("etl:read", async () => {
  const [stats, runs, failed] = await Promise.all([submissionStats({}), recentRuns(), failedDocuments()]);
  return json({ stats, runs, failed });
});

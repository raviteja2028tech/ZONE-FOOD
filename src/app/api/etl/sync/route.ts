import { z } from "zod";
import { runEtl } from "@/lib/db/repositories/etl";
import { logActivity } from "@/lib/db/repositories/documents";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseWith } from "@/lib/validation/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({ mode: z.enum(["PENDING", "RETRY"]).default("PENDING"), limit: z.coerce.number().int().min(1).max(500).default(200) });

/** POST /api/etl/sync - runs the Mongo -> PostgreSQL ETL (zone admin only). Safe to call repeatedly. */
export const POST = api("etl:run", async ({ request, user }) => {
  const raw = await request.json().catch(() => ({}));
  const { mode, limit } = parseWith(body, raw);
  const summary = await runEtl({ mode, limit, userId: user.userId });
  void logActivity(user, "RUN_ETL", { run_id: summary.runId, synced: summary.synced, failed: summary.failed });
  return json({ ...summary, outcomes: summary.outcomes.slice(0, 50) });
});

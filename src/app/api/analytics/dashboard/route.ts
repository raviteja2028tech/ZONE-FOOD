import { getDashboard } from "@/lib/dashboard";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** GET /api/analytics/dashboard - the role-appropriate dashboard data (same loader the home page uses). */
export const GET = api("dashboard:view", async ({ user }) => json(await getDashboard(user)));

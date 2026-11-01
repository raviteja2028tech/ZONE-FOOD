import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** GET /api/auth/me - the current user (401 when signed out). */
export const GET = api(null, ({ user }) => json({ user }));

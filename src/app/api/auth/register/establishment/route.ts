import { loadUser } from "@/lib/auth/guard";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { registerEstablishment } from "@/lib/db/repositories/accounts";
import { publicApi } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { registerEstablishmentSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** POST /api/auth/register/establishment - creates the establishment, its profile and a manager account atomically. */
export const POST = publicApi(async ({ request }) => {
  const input = await parseJson(request, registerEstablishmentSchema);
  const userId = await registerEstablishment(input);
  const user = await loadUser(userId);
  const token = await signSession(userId);
  return json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(token) } });
});

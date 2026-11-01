import { loadUser } from "@/lib/auth/guard";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { registerRecipient } from "@/lib/db/repositories/accounts";
import { publicApi } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { registerRecipientSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** POST /api/auth/register/recipient - creates the organisation and its agent account atomically. */
export const POST = publicApi(async ({ request }) => {
  const input = await parseJson(request, registerRecipientSchema);
  const userId = await registerRecipient(input);
  const user = await loadUser(userId);
  const token = await signSession(userId);
  return json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(token) } });
});

import { clearedSessionCookie } from "@/lib/auth/session";
import { publicApi } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout - clears the session cookie. */
export const POST = publicApi(async () => json({ loggedOut: true }, { headers: { "Set-Cookie": clearedSessionCookie() } }));

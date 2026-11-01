import "server-only";
import { assertCan, unauthenticated, userFromRequest, type SessionUser } from "@/lib/auth/guard";
import type { Permission } from "@/lib/auth/permissions";
import { AppError } from "./errors";
import { route } from "./respond";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface Ctx<P> {
  request: Request;
  user: SessionUser;
  params: P;
}

/** Same-site check for state-changing requests (defence in depth on top of SameSite=Lax cookies). */
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, tests) send no Origin
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError(403, "BAD_ORIGIN", "Invalid Origin header.");
  }
  if (originHost !== host) throw new AppError(403, "BAD_ORIGIN", "Cross-site requests are not allowed.");
}

/**
 * Authenticated + authorised API route. Order matters: origin -> authentication (401) -> permission (403) -> handler.
 * The permission check happens here, on the server, for every request - hiding a button is never the control.
 */
export function api<P = Record<string, never>>(permission: Permission | null, handler: (ctx: Ctx<P>) => Promise<Response> | Response) {
  return route<{ params: Promise<P> }>(async (request, context) => {
    if (MUTATING.has(request.method)) assertSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user) throw unauthenticated();
    if (permission) assertCan(user, permission);
    const params = (context?.params ? await context.params : {}) as P;
    return handler({ request, user, params });
  });
}

/** Public route (login/register/health): still gets origin checks and the standard error envelope. */
export function publicApi<P = Record<string, never>>(handler: (ctx: { request: Request; params: P }) => Promise<Response> | Response) {
  return route<{ params: Promise<P> }>(async (request, context) => {
    if (MUTATING.has(request.method)) assertSameOrigin(request);
    const params = (context?.params ? await context.params : {}) as P;
    return handler({ request, params });
  });
}

/** Parses a positive integer path/query id or throws a 400. */
export function parseId(value: string | undefined, label = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, "BAD_REQUEST", `Invalid ${label}.`);
  return n;
}

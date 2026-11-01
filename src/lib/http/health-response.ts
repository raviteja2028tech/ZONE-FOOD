import "server-only";
import { AppError } from "./errors";
import type { ConfigHealth } from "@/types/health";

/** Turns an invalid-configuration result into the standard 503 error envelope (via route()). */
export function serviceUnavailableFor(config: ConfigHealth): never {
  throw new AppError(
    503,
    "CONFIG_ERROR",
    `Invalid server configuration: ${config.issues.join("; ")}. Copy .env.example to .env and set these values.`,
  );
}

import { userFromRequest } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import type { MongoHealth, PostgresHealth, SystemHealth } from "@/types/health";

/**
 * /api/health* stay public so load balancers and uptime checks can probe liveness. Versions, extensions, table and
 * collection counts and error text are only returned to signed-in authority users (zone admin / auditor).
 */
export async function canSeeHealthDetail(request: Request): Promise<boolean> {
  const user = await userFromRequest(request).catch(() => null);
  return !!user && can(user.role, "etl:read");
}

const coarse = <T extends PostgresHealth | MongoHealth>(h: T): Pick<T, "status"> => ({ status: h.status });
export const redactPostgres = (h: PostgresHealth) => coarse(h);
export const redactMongo = (h: MongoHealth) => coarse(h);
export const redactSystem = (h: SystemHealth) => ({ status: h.status, postgres: coarse(h.postgres), mongo: coarse(h.mongo) });

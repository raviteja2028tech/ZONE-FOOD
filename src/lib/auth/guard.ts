import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { queryOne } from "@/lib/db/postgres";
import { AppError } from "@/lib/http/errors";
import { can, type Permission, type Role } from "./permissions";
import { SESSION_COOKIE, readCookie, verifySession } from "./session";

/** The authenticated principal, always freshly loaded from the database. */
export interface SessionUser {
  userId: number;
  email: string;
  fullName: string;
  role: Role;
  establishmentId: number | null;
  recipientId: number | null;
  /** Name of the establishment / organisation the user belongs to (null for authority roles). */
  scopeName: string | null;
  zoneId: number | null;
}

interface UserRow {
  user_id: number;
  email: string;
  full_name: string;
  role: Role;
  establishment_id: number | null;
  recipient_id: number | null;
  scope_name: string | null;
  zone_id: number | null;
}

export async function loadUser(userId: number): Promise<SessionUser | null> {
  // A user is only valid while BOTH the account and (for establishment staff) the establishment are active.
  const row = await queryOne<UserRow>(
    `SELECT u.user_id, u.email, u.full_name, u.role, u.establishment_id, u.recipient_id,
            COALESCE(e.name, r.org_name) AS scope_name, COALESCE(e.zone_id, r.zone_id) AS zone_id
       FROM app_user u
       LEFT JOIN establishment e ON e.establishment_id = u.establishment_id
       LEFT JOIN recipient_org r ON r.recipient_id = u.recipient_id
      WHERE u.user_id = $1 AND u.is_active AND (u.establishment_id IS NULL OR e.is_active)`,
    [userId],
  );
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    establishmentId: row.establishment_id,
    recipientId: row.recipient_id,
    scopeName: row.scope_name,
    zoneId: row.zone_id,
  };
}

export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  const id = await verifySession(token);
  return id ? loadUser(id) : null;
}

/* ----------------------------- API (route handler) helpers ----------------------------- */

export async function userFromRequest(request: Request): Promise<SessionUser | null> {
  return userFromToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}

export const unauthenticated = () => new AppError(401, "UNAUTHENTICATED", "Please sign in to continue.");
export const forbidden = (message = "Your role does not allow this action.") => new AppError(403, "FORBIDDEN", message);

export function assertCan(user: SessionUser, permission: Permission): void {
  if (!can(user.role, permission)) throw forbidden();
}

/** Establishment-scoped data: returns the user's establishment id or refuses (authority roles must pass an explicit id). */
export function ownEstablishmentId(user: SessionUser): number {
  if (user.establishmentId === null) throw forbidden("This action is only available to establishment users.");
  return user.establishmentId;
}

export function ownRecipientId(user: SessionUser): number {
  if (user.recipientId === null) throw forbidden("This action is only available to recipient organisations.");
  return user.recipientId;
}

/* ------------------------------- Server Component helpers ------------------------------- */

/** Per-request memoised current user for pages/layouts (null when signed out). */
export const getPageUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
});

/** For pages: redirect to /login if signed out, to /access-denied if the role lacks the permission. */
export async function requirePageUser(permission?: Permission): Promise<SessionUser> {
  const user = await getPageUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/access-denied");
  return user;
}

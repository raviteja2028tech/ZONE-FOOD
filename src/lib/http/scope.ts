import "server-only";
import { z } from "zod";
import { forbidden, ownEstablishmentId, type SessionUser } from "@/lib/auth/guard";
import { isAuthorityRole, isEstablishmentRole } from "@/lib/auth/permissions";
import { optionalId } from "@/lib/validation/schemas";

/**
 * Row-level scoping. The SESSION decides which establishment a user may touch: establishment roles are pinned to
 * their own id and any id supplied by the client is ignored; authority roles may narrow to one establishment.
 */
export function establishmentScope(user: SessionUser, requested?: number): { establishmentId?: number } {
  if (isEstablishmentRole(user.role)) return { establishmentId: ownEstablishmentId(user) };
  if (isAuthorityRole(user.role)) return requested ? { establishmentId: requested } : {};
  throw forbidden();
}

/** Blank form fields arrive as "" - treat them as absent. */
export const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
export const qText = z.preprocess(blankToUndefined, z.string().trim().max(100).optional());
export const qId = optionalId();
export const qDate = z.preprocess(blankToUndefined, z.iso.date().optional());
export const qPage = z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(10_000).optional());

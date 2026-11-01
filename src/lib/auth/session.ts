import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env/server";

export const SESSION_COOKIE = "zf_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const key = () => new TextEncoder().encode(getEnv().SESSION_SECRET);

/**
 * The token carries ONLY the user id. Role, scope and active status are re-read from the database on every
 * request, so a demoted or deactivated user loses access immediately instead of when a token expires.
 */
export async function signSession(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setIssuer("zonefood")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined | null): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], issuer: "zonefood" });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null; // expired, tampered, wrong key - all just "not signed in"
  }
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** httpOnly (no JS access), SameSite=Lax (blocks cross-site POSTs), Secure in production. */
export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

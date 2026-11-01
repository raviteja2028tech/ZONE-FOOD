import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { loginLimiter } from "@/lib/auth/rate-limit";
import { loadUser } from "@/lib/auth/guard";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { findLoginRow, touchLastLogin } from "@/lib/db/repositories/accounts";
import { logActivity } from "@/lib/db/repositories/documents";
import { AppError } from "@/lib/http/errors";
import { publicApi } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { loginSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** POST /api/auth/login - verifies the bcrypt hash and sets the httpOnly session cookie. */
export const POST = publicApi(async ({ request }) => {
  const { email, password } = await parseJson(request, loginSchema);

  const wait = loginLimiter.retryAfterSeconds(email);
  if (wait > 0) throw new AppError(429, "TOO_MANY_ATTEMPTS", `Too many failed sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, { retryAfterSeconds: wait });

  const row = await findLoginRow(email);
  // Always run one bcrypt comparison so unknown e-mails and wrong passwords take the same time.
  const passwordOk = await verifyPassword(password, row?.password_hash ?? (await dummyHash()));
  const user = row && passwordOk && row.is_active ? await loadUser(row.user_id) : null;
  if (!user) {
    loginLimiter.recordFailure(email);
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  loginLimiter.reset(email);
  await touchLastLogin(user.userId);
  void logActivity(user, "LOGIN");
  const token = await signSession(user.userId);
  return json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
});

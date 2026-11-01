import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm, type DemoAccount } from "@/components/auth/login-form";
import { query } from "@/lib/db/postgres";
import { getEnv } from "@/lib/env/server";
import { ROLE_LABEL, type Role } from "@/lib/auth/permissions";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/** One representative seeded account per role - emails only, never passwords. Shown only when DEMO_LOGIN_HINTS=true. */
async function demoAccounts(): Promise<DemoAccount[]> {
  try {
    if (!getEnv().DEMO_LOGIN_HINTS) return [];
    const rows = await query<{ role: Role; email: string }>(
      `SELECT DISTINCT ON (role) role, email FROM app_user WHERE is_active AND email LIKE '%@zonefood.example' ORDER BY role, user_id`,
    );
    const order: Role[] = ["ZONE_ADMIN", "AUDITOR", "ESTAB_MANAGER", "ESTAB_STAFF", "RECIPIENT_AGENT"];
    return order.flatMap((r) => rows.filter((x) => x.role === r).map((x) => ({ role: ROLE_LABEL[r], email: x.email })));
  } catch {
    return [];
  }
}

export default async function LoginPage() {
  const demo = await demoAccounts();
  return (
    <AuthLayout>
      <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mb-8 mt-2 text-sm text-ink-muted">Sign in to manage your kitchen, surplus and claims.</p>
      <LoginForm demo={demo} />
      <p className="mt-8 text-center text-sm text-ink-muted">
        New to ZoneFood?{" "}
        <Link href="/register" className="font-semibold text-accent-ink hover:underline">
          Register your establishment or organisation
        </Link>
      </p>
    </AuthLayout>
  );
}

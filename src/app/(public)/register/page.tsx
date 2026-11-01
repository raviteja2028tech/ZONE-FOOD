import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForms } from "@/components/auth/register-forms";
import { listCategoriesForRegistration, listStreetZones } from "@/lib/db/repositories/catalog";

export const metadata = { title: "Register" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [categories, zones] = await Promise.all([listCategoriesForRegistration(), listStreetZones()]);
  return (
    <AuthLayout wide>
      <h2 className="text-3xl font-semibold tracking-tight">Create your account</h2>
      <p className="mb-8 mt-2 text-sm text-ink-muted">Register an establishment to track and reduce waste, or a recipient organisation to receive surplus food.</p>
      <RegisterForms categories={categories} zones={zones} />
      <p className="mt-8 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent-ink hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

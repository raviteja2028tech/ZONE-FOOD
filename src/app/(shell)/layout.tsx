import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getPageUser } from "@/lib/auth/guard";

// Everything in this group reads the signed-in user and live database state on every request.
export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return <AppShell user={user}>{children}</AppShell>;
}

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageUser } from "@/lib/auth/guard";
import { ROLE_LABEL } from "@/lib/auth/permissions";

export const metadata = { title: "Access denied" };

export default async function AccessDenied() {
  const user = await requirePageUser();
  return (
    <EmptyState page icon={ShieldAlert} tone="bad" title="You do not have access to that page" action={<Link href="/" className={buttonClass("primary")}>Back to overview</Link>}>
      Your role ({ROLE_LABEL[user.role]}) is not permitted to open it. Permissions are enforced on the server for every page and API request.
    </EmptyState>
  );
}

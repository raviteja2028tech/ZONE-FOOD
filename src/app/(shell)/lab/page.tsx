import { PageHeader } from "@/components/ui/page-header";
import { LabClient } from "@/components/lab/lab-client";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getDbObjects } from "@/lib/db/repositories/db-objects";
import { DEMOS, loadCatalogue } from "@/lib/lab";

export const metadata = { title: "DBMS Lab" };

export default async function LabPage() {
  const user = await requirePageUser("lab:use");
  const [queries, objects] = await Promise.all([loadCatalogue(), getDbObjects()]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="DBMS Lab"
        description="Run the documented SQL queries against the live database, watch constraints and triggers refuse bad data, and inspect the objects behind the advanced features. Nothing here can change your data: queries are read-only or rolled back, and arbitrary SQL cannot be entered."
      />
      <LabClient
        queries={queries}
        demos={DEMOS.map((d) => ({ id: d.id, title: d.title, concept: d.concept, explanation: d.explanation, expect: d.expect, sql: d.steps.map((s) => s.sql).join(";\n\n") + ";" }))}
        objects={objects}
        canRefresh={can(user.role, "lab:refresh")}
      />
    </div>
  );
}

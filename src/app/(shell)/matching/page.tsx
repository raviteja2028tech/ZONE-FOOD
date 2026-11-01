import { PageHeader } from "@/components/ui/page-header";
import { NameMatcher } from "@/components/forms/name-matcher";
import { requirePageUser } from "@/lib/auth/guard";

export const metadata = { title: "Name matching" };

export default async function MatchingPage() {
  await requirePageUser("matching:use");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Data" title="Name matching" description="See how inconsistent food names (typos, case, abbreviations) are resolved to the canonical catalogue: exact → alias cache → trigram → pgvector similarity. Nothing is written from this page." />
      <NameMatcher />
    </div>
  );
}

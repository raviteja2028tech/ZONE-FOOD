import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EditRecipientForm } from "@/components/forms/profile-forms";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getRecipient } from "@/lib/db/repositories/organisations";
import { AppError } from "@/lib/http/errors";
import { fmtKg, humanize } from "@/lib/format";

export const metadata = { title: "Organisation" };

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-medium">{children}</dd></div>
);

export default async function RecipientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("dashboard:view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const own = user.recipientId === id;
  const admin = can(user.role, "recipient:manage");
  if (!own && !can(user.role, "recipient:list")) notFound();
  let r;
  try {
    r = await getRecipient(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const canEdit = admin || (own && can(user.role, "recipient:update-own"));

  return (
    <div className="space-y-6">
      {!own && <Link href="/recipients" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft aria-hidden className="size-4" />All recipients</Link>}
      <PageHeader
        eyebrow={humanize(r.org_type)}
        title={r.org_name}
        description={r.zone_name}
        actions={canEdit ? <Modal trigger="Edit" title="Edit organisation" variant="secondary" size="lg" triggerIcon={<Pencil aria-hidden className="size-4" />}><EditRecipientForm id={id} initial={r} /></Modal> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Capacity and policy" />
          <CardBody><dl className="divide-y divide-line">
            <Row label="Daily capacity">{fmtKg(r.daily_capacity_kg, 0)}</Row>
            <Row label="Pickup window">{r.pickup_window_start}–{r.pickup_window_end}</Row>
            <Row label="Cooked food">{r.accepts_cooked ? "Accepted" : "Not accepted"}</Row>
            <Row label="Contact">{r.contact_phone ?? "-"}</Row>
            <Row label="Received so far">{fmtKg(r.kg_received, 0)} in {r.claims_collected} pickups</Row>
          </dl></CardBody>
        </Card>
        <Card>
          <CardHeader title="Need profile" description="Embedded to rank surplus for this organisation" action={r.has_embedding ? <Badge tone="ok">Embedded</Badge> : <Badge tone="warn">Not embedded</Badge>} />
          <CardBody><p className="text-sm leading-relaxed text-ink">{r.need_profile}</p></CardBody>
        </Card>
      </div>
    </div>
  );
}

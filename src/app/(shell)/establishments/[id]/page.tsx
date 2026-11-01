import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EditEstablishmentForm } from "@/components/forms/profile-forms";
import { requirePageUser } from "@/lib/auth/guard";
import { can, isEstablishmentRole } from "@/lib/auth/permissions";
import { getEstablishment } from "@/lib/db/repositories/organisations";
import { listStreetZones } from "@/lib/db/repositories/catalog";
import { AppError } from "@/lib/http/errors";
import { fmtDate, fmtKg, humanize } from "@/lib/format";
import { KpiCard } from "@/components/ui/kpi-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { StackedShare } from "@/components/charts/insight-charts";
import { getWasteTrend } from "@/lib/db/repositories/analytics";
import { peerRanking, prepSummary, provenance, wasteIntensity } from "@/lib/db/repositories/insights";
import { Gauge, Medal, Scale } from "lucide-react";

export const metadata = { title: "Establishment" };

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-medium">{children}</dd></div>
);

export default async function EstablishmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("dashboard:view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const own = isEstablishmentRole(user.role) && user.establishmentId === id;
  if (!own && !can(user.role, "establishment:list")) {
    return notFound(); // other tenants' records are indistinguishable from missing ones
  }
  let e;
  try {
    e = await getEstablishment(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const admin = can(user.role, "establishment:manage");
  const canEdit = admin || (own && can(user.role, "establishment:update-own"));
  const zones = admin ? await listStreetZones() : undefined;
  const scope = { establishmentId: id };
  const [trend, peers, prep, intensity, prov] = await Promise.all([getWasteTrend(scope), peerRanking(scope, 1), prepSummary(scope), wasteIntensity(id), provenance(scope)]);
  const peer = peers[0];

  return (
    <div className="space-y-6">
      {admin && <Link href="/establishments" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft aria-hidden className="size-4" />All establishments</Link>}
      <PageHeader
        eyebrow={e.category_name}
        title={e.name}
        description={`${e.block_name} › ${e.zone_name}${e.address_line ? ` · ${e.address_line}` : ""}`}
        actions={
          <>
            {e.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
            {canEdit && <Modal trigger="Edit" title="Edit establishment" variant="secondary" triggerIcon={<Pencil aria-hidden className="size-4" />}><EditEstablishmentForm id={id} initial={e} zones={zones} /></Modal>}
            {admin && <ActionButton label={e.is_active ? "Deactivate" : "Reactivate"} url={`/api/establishments/${id}`} method="PATCH" body={{ isActive: !e.is_active }} confirm={e.is_active ? "Lock out its users?" : undefined} success={e.is_active ? "Establishment deactivated" : "Establishment reactivated"} variant={e.is_active ? "ghost" : "primary"} />}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody><dl className="divide-y divide-line">
            <Row label="Kind">{humanize(e.kind)}</Row>
            <Row label="Capacity">{e.capacity} {e.capacity_metric}</Row>
            <Row label="Operating since">{fmtDate(e.operational_since)}</Row>
            <Row label="Waste, last 30 days">{fmtKg(e.waste_kg_30d, 0)}</Row>
          </dl></CardBody>
        </Card>
        <Card>
          <CardHeader title="Profile" description="Subtype-specific attributes" />
          <CardBody><dl className="divide-y divide-line">
            {e.cuisine_type !== undefined && e.fssai_license !== undefined && (<><Row label="Cuisine">{(e.cuisine_type as string) ?? "-"}</Row><Row label="Buffet">{e.has_buffet ? "Yes" : "No"}</Row><Row label="FSSAI licence">{(e.fssai_license as string) ?? "-"}</Row></>)}
            {e.enrolled_strength != null && (<><Row label="Enrolled strength">{e.enrolled_strength as number}</Row><Row label="Meals per day">{e.serves_meals_per_day as number}</Row><Row label="Mess type">{e.mess_type ? humanize(e.mess_type as string) : "-"}</Row></>)}
            {e.household_count != null && (<><Row label="Households">{e.household_count as number}</Row><Row label="Occupants">{e.total_occupants as number}</Row><Row label="Common kitchen">{e.has_common_kitchen ? "Yes" : "No"}</Row><Row label="Waste segregation">{e.segregation_compliant ? "Compliant" : "Not yet"}</Row></>)}
          </dl></CardBody>
        </Card>
      </div>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Performance">
        <KpiCard label="Waste per kg served" icon={Scale} value={intensity === null ? "-" : intensity.toFixed(3)} hint="stored function fn_waste_intensity, 30 days" />
        <KpiCard label="Rank among peers" icon={Medal} value={peer ? `#${peer.rank}` : "-"} hint={peer ? `of ${peer.peers} in ${peer.category} (1 = most waste per capita)` : "no waste recorded in 90 days"} />
        <KpiCard label="Kitchen utilisation" icon={Gauge} value={prep.sessions ? `${prep.avgUtilisation}%` : "-"} hint={`${prep.sessions} sessions, ${prep.poorSessions} under 75%`} />
      </section>
      <Card>
        <CardHeader title="Waste trend" description="Weekly kilograms by stage, last 12 weeks" />
        <CardBody><TrendChart data={trend} /></CardBody>
      </Card>
      <Card>
        <CardHeader title="Where this establishment's numbers come from" description="Data provenance of its waste figures" />
        <CardBody><StackedShare parts={[{ label: "Typed in by staff", pct: prov.manualPct, color: "var(--series-1)" }, { label: "Imported from field logs", pct: prov.etlPct, color: "var(--series-3)" }, { label: "Generated by the system", pct: prov.systemPct, color: "var(--series-4)" }]} /></CardBody>
      </Card>
    </div>
  );
}

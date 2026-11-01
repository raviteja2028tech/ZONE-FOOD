import Link from "next/link";
import { Building2, CircleCheck, Gift, HandHeart, Handshake, Leaf, PackageCheck, Recycle, Scale, Wallet, Wind } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { buttonClass } from "@/components/ui/button";
import { TrendChart } from "@/components/charts/trend-chart";
import { ZoneChart } from "@/components/charts/zone-chart";
import { RankedBars } from "@/components/charts/ranked-bars";
import { ActivityFeed, ExpiringLots, FeedPreview } from "@/components/dashboard/parts";
import { requirePageUser } from "@/lib/auth/guard";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { getDashboard } from "@/lib/dashboard";
import { deltaPct, fmtInr, fmtKg, fmtNum } from "@/lib/format";

export const metadata = { title: "Overview" };

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default async function DashboardPage() {
  const user = await requirePageUser("dashboard:view");
  const d = await getDashboard(user);
  const first = user.fullName.split(/[\s,]+/)[0] ?? "";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ROLE_LABEL[user.role]}
        title={`${greeting()}, ${first}`}
        description={d.kind === "authority" ? "Zone-wide picture of food waste, surplus and redistribution - last 30 days, live from the database." : d.kind === "establishment" ? `Your kitchen at ${user.scopeName} - last 30 days.` : `Surplus available to ${user.scopeName} and your recent pickups.`}
        actions={
          d.kind === "establishment" ? (
            <>
              <Link href="/analytics" className={buttonClass("ghost")}>Analytics</Link>
              <Link href="/waste" className={buttonClass("secondary")}>Log waste</Link>
              <Link href="/surplus" className={buttonClass("primary")}>List surplus</Link>
            </>
          ) : d.kind === "recipient" ? (
            <Link href="/feed" className={buttonClass("primary")}>Browse available surplus</Link>
          ) : (
            <Link href="/analytics" className={buttonClass("primary")}>Open analytics</Link>
          )
        }
      />

      {d.kind !== "recipient" && (
        <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard featured label="Total food waste" icon={Scale} value={fmtNum(d.kpis.wasteKg, 0)} unit="kg" count={{ value: d.kpis.wasteKg }} spark={d.spark} delta={deltaPct(d.kpis.wasteKg, d.kpis.wasteKgPrev)} goodWhen="down" hint="vs previous 30 days" />
          <KpiCard label="Surplus available now" icon={Gift} value={fmtNum(d.kpis.surplusAvailableKg, 0)} unit="kg" count={{ value: d.kpis.surplusAvailableKg }} hint={`${d.kpis.openListings} open listing${d.kpis.openListings === 1 ? "" : "s"}`} />
          <KpiCard label="Food redistributed" icon={Handshake} value={fmtNum(d.kpis.redistributedKg, 0)} unit="kg" count={{ value: d.kpis.redistributedKg }} delta={deltaPct(d.kpis.redistributedKg, d.kpis.redistributedKgPrev)} goodWhen="up" hint="vs previous 30 days" />
          <KpiCard label="Cost of waste" icon={Wallet} value={fmtInr(d.kpis.costInr)} count={{ value: d.kpis.costInr, prefix: "₹" }} hint="estimated from item prices" />
          {d.kind === "establishment" ? (
            <KpiCard label="Waste per kg served" icon={Scale} value={d.intensity === null ? "-" : d.intensity.toFixed(3)} count={d.intensity === null ? undefined : { value: d.intensity, decimals: 3 }} hint="kg wasted ÷ kg served (30 days)" />
          ) : (
            <KpiCard label="CO₂e from waste" icon={Wind} value={fmtNum(d.kpis.co2eKg, 0)} unit="kg" count={{ value: d.kpis.co2eKg }} hint="illustrative emission factors" />
          )}
          <KpiCard label="Diversion rate" icon={Recycle} value={d.kpis.diversionPct.toFixed(0)} unit="%" count={{ value: d.kpis.diversionPct }} hint="waste kept out of landfill" />
        </section>
      )}

      {d.kind === "recipient" && (
        <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard featured label="Received (30 days)" icon={PackageCheck} value={fmtNum(d.stats.receivedKg, 0)} unit="kg" hint="collected claims" />
          <KpiCard label="Awaiting approval" icon={Handshake} value={String(d.stats.requested)} hint="requested claims" />
          <KpiCard label="Ready to collect" icon={CircleCheck} value={String(d.stats.approved)} hint="approved claims" />
          <KpiCard label="Total pickups" icon={Leaf} value={String(d.stats.collected)} hint="all time" />
        </section>
      )}

      {d.kind === "authority" && (
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Locality">
          {[["Active establishments", d.counts.establishments, Building2, "/establishments"], ["Recipient organisations", d.counts.recipients, HandHeart, "/recipients"], ["Zones", d.counts.zones, Leaf, "/zones"]].map(([label, n, Icon, href]) => {
            const I = Icon as typeof Building2;
            return (
              <Link key={label as string} href={href as string} className="group">
                <Card className="flex items-center gap-4 p-4 transition-all group-hover:border-accent group-hover:shadow-pop">
                  <span className="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent-ink"><I aria-hidden className="size-5" /></span>
                  <div><p className="tabular text-2xl font-semibold leading-none">{n as number}</p><p className="mt-1 text-sm text-ink-muted">{label as string}</p></div>
                </Card>
              </Link>
            );
          })}
        </section>
      )}

      {d.kind === "establishment" && d.pendingClaims > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-info/40 bg-info-soft p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-info"><Handshake aria-hidden className="size-5" />{d.pendingClaims} claim{d.pendingClaims === 1 ? "" : "s"} waiting for your approval</p>
          <Link href="/claims" className={buttonClass("primary")}>Review claims</Link>
        </Card>
      )}

      {d.kind !== "recipient" && (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Waste trend" description="Weekly kilograms by stage, last 12 weeks" />
            <CardBody><TrendChart data={d.trend} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Most wasted foods" description="Top 8 by weight, last 30 days" />
            <CardBody><RankedBars rows={d.topFoods.map((f) => ({ name: f.name, value: f.kg, sub: `≈ ${fmtInr(f.cost)} lost` }))} /></CardBody>
          </Card>
        </section>
      )}

      {d.kind === "authority" && (
        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Zone comparison" description="Wasted vs redistributed per block, last 30 days" action={<Link href="/zones" className="text-sm font-medium text-accent-ink hover:underline">All zones</Link>} />
            <CardBody><ZoneChart data={d.zones} /></CardBody>
          </Card>
          <ActivityFeed items={d.activity} />
        </section>
      )}

      {d.kind === "establishment" && (
        <section className="grid gap-6 xl:grid-cols-2">
          <ExpiringLots lots={d.expiring} />
          <ActivityFeed items={d.activity} />
        </section>
      )}

      {d.kind === "recipient" && (
        <section className="grid gap-6 xl:grid-cols-2">
          <FeedPreview items={d.feed} />
          <ActivityFeed items={d.activity} />
        </section>
      )}
      <p className="text-xs text-ink-muted">{d.kind === "authority" ? `Totals cover ${fmtKg(d.kpis.wasteKg + d.kpis.redistributedKg, 0)} handled in the period.` : "Figures are computed live from PostgreSQL; none are hardcoded."}</p>
    </div>
  );
}

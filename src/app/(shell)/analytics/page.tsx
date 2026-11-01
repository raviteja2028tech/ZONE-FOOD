import Link from "next/link";
import { AlertTriangle, Gauge, Handshake, Percent, Timer, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, FilterBar, FilterField, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Select } from "@/components/ui/fields";
import { RankedBars } from "@/components/charts/ranked-bars";
import { FunnelBars, PercentLine, StackedShare, TrendWithAnomalies, WeekdayBars } from "@/components/charts/insight-charts";
import { requirePageUser } from "@/lib/auth/guard";
import { isEstablishmentRole } from "@/lib/auth/permissions";
import { query } from "@/lib/db/postgres";
import {
  anomalies, dailyTrend, diversionTrend, overPreparers, peerRanking, prepSummary, provenance, rescueFunnel, supplierSpoilage, utilisationWeekly, weekdayProfile,
} from "@/lib/db/repositories/insights";
import { fmtDate, fmtKg } from "@/lib/format";
import { asInt, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("analytics:view");
  const p = await readParams(searchParams);
  const authority = !isEstablishmentRole(user.role);
  const scope = authority ? { establishmentId: asInt(p.establishmentId) } : { establishmentId: user.establishmentId as number };
  const zoneWide = scope.establishmentId === undefined;

  const [trend, anomalyList, weekday, diversion, peers, prep, weekly, funnel, prov, spoilage, bad, estabs] = await Promise.all([
    dailyTrend(scope, 56), anomalies(scope, 60, 8), weekdayProfile(scope), diversionTrend(scope), peerRanking(scope, 10), prepSummary(scope), utilisationWeekly(scope),
    rescueFunnel(scope), provenance(scope), zoneWide ? supplierSpoilage(6) : Promise.resolve([]), zoneWide ? overPreparers(6) : Promise.resolve([]),
    authority ? query<{ id: number; name: string }>("SELECT establishment_id AS id, name FROM establishment WHERE is_active ORDER BY name") : Promise.resolve([]),
  ]);

  const subject = zoneWide ? "the whole zone" : scope.establishmentId === user.establishmentId ? user.scopeName : estabs.find((e) => e.id === scope.establishmentId)?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Analytics"
        description={`Trends, benchmarks and anomalies for ${subject}. Every figure is a live SQL query - the same ones documented in the query catalogue.`}
        actions={<Link href="/" className="text-sm font-medium text-accent-ink hover:underline">← Dashboard</Link>}
      />
      {authority && (
        <FilterBar action="/analytics" resetHref="/analytics">
          <FilterField label="Scope" name="establishmentId">
            <Select name="establishmentId" defaultValue={p.establishmentId ?? ""}><option value="">Whole zone</option>{estabs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
          </FilterField>
        </FilterBar>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key indicators">
        <KpiCard featured label="Rescue rate" icon={Handshake} value={`${funnel.ratePct}`} unit="%" count={{ value: funnel.ratePct, decimals: 1 }} hint={`${funnel.collectedKg.toLocaleString("en-IN")} of ${funnel.offeredKg.toLocaleString("en-IN")} kg offered`} />
        <KpiCard label="Median time to pickup" icon={Timer} value={funnel.medianHours === null ? "-" : String(funnel.medianHours)} unit={funnel.medianHours === null ? undefined : "h"} hint="listing → collected" />
        <KpiCard label="Kitchen utilisation" icon={UtensilsCrossed} value={prep.sessions ? String(prep.avgUtilisation) : "-"} unit={prep.sessions ? "%" : undefined} hint={`${prep.sessions} sessions, last 90 days`} />
        <KpiCard label="Sessions under 75%" icon={Gauge} value={String(prep.poorSessions)} hint={`${fmtKg(prep.unconsumedKg, 0)} unconsumed food`} />
      </section>

      <Card>
        <CardHeader title="Daily waste, trend and anomalies" description="Bars: kg per day · line: rolling 7-day average · red dots: days more than 2.5 standard deviations above the trailing 4 weeks. Drag the handles below the chart to zoom." />
        <CardBody><TrendWithAnomalies data={trend} anomalies={anomalyList} /></CardBody>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Weekly rhythm" description="Average kg per day by weekday, last 90 days" />
          <CardBody><WeekdayBars data={weekday} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Diversion rate" description="Share of waste kept out of landfill, by month" />
          <CardBody><PercentLine data={diversion.map((d) => ({ x: d.month, y: d.pct }))} label="Diversion rate" /></CardBody>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={zoneWide ? "Peer benchmark: highest waste per capita" : "How you compare with peers"} description="Per-capita waste over 90 days, ranked within each establishment category (rank 1 = worst)" />
          <TableCard className="rounded-none border-0 shadow-none" minWidth="min-w-[30rem]">
            <THead><Th>Establishment</Th><Th align="right">kg / capita</Th><Th>Rank</Th><Th>Percentile</Th></THead>
            <TBody>
              {peers.length === 0 && <EmptyRow cols={5}>{zoneWide ? "Not enough peers to rank yet." : "No waste recorded in the last 90 days, so no ranking yet."}</EmptyRow>}
              {peers.map((r) => (
                <Tr key={r.establishmentId}>
                  <Td className="max-w-48"><span className="block truncate font-medium">{r.name}</span><span className="block truncate text-xs text-ink-muted">{r.category}</span></Td>
                  <Td align="right">{r.kgPerCapita.toFixed(3)} <span className="block text-xs text-ink-muted">avg {r.categoryAvg.toFixed(3)}</span></Td>
                  <Td><Badge tone={r.rank === 1 ? "bad" : r.rank <= Math.ceil(r.peers / 3) ? "warn" : "ok"}>#{r.rank} of {r.peers}</Badge></Td>
                  <Td><span className="inline-flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden><span className="block h-full rounded-full bg-series-2" style={{ width: `${r.percentile * 100}%` }} /></span><span className="tabular text-xs">{Math.round(r.percentile * 100)}</span></span></Td>
                </Tr>
              ))}
            </TBody>
          </TableCard>
        </Card>
        <Card>
          <CardHeader title="Preparation efficiency" description="Share of cooked food actually served, by week (last 12 weeks)" />
          <CardBody className="space-y-5">
            <PercentLine data={weekly.map((w) => ({ x: w.week.slice(5), y: w.utilisation }))} label="Utilisation" color="var(--series-1)" />
            {zoneWide && bad.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Chronic over-preparers <span className="font-normal text-ink-muted">(below 75% on 10+ sessions)</span></p>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {bad.map((b) => <li key={b.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span className="truncate">{b.name} <span className="text-xs text-ink-muted">{b.category}</span></span><span className="tabular shrink-0 text-xs text-ink-muted">{b.poorSessions} sessions · {b.avgUtilisation}% · {b.unconsumedKg.toLocaleString("en-IN")} kg</span></li>)}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Rescue funnel" description="From food offered to food collected" />
          <CardBody>
            <FunnelBars steps={[
              { label: "Offered for rescue", value: funnel.offeredKg, hint: `${funnel.listings.toLocaleString("en-IN")} listings` },
              { label: "Reserved (claims approved)", value: funnel.reservedKg },
              { label: "Collected by recipients", value: funnel.collectedKg, hint: `${funnel.ratePct}% of what was offered` },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Where the numbers come from" description="How waste figures were captured (data provenance)" />
          <CardBody className="space-y-6">
            <StackedShare parts={[
              { label: "Typed in by staff", pct: prov.manualPct, color: "var(--series-1)" },
              { label: "Imported from field logs", pct: prov.etlPct, color: "var(--series-3)" },
              { label: "Generated by the system", pct: prov.systemPct, color: "var(--series-4)" },
            ]} />
            {zoneWide && spoilage.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-semibold">Suppliers by spoilage rate</p>
                <RankedBars unit="%" rows={spoilage.map((s) => ({ name: s.supplier, value: s.ratePct, sub: `${s.spoiledKg.toLocaleString("en-IN")} of ${s.receivedKg.toLocaleString("en-IN")} kg delivered` }))} />
              </div>
            )}
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="Recent anomalies" description="Establishment-days far above their own four-week norm (last 60 days)" action={<AlertTriangle aria-hidden className="size-5 text-warn" />} />
        <TableCard className="rounded-none border-0 shadow-none">
          <THead><Th>Date</Th>{zoneWide && <Th>Establishment</Th>}<Th align="right">Waste</Th><Th align="right">Expected</Th><Th align="right">z-score</Th></THead>
          <TBody>
            {anomalyList.length === 0 && <EmptyRow cols={5}>No anomalous days in the last 60 days.</EmptyRow>}
            {anomalyList.map((a) => (
              <Tr key={`${a.establishmentId}-${a.day}`}>
                <Td mono className="whitespace-nowrap">{fmtDate(a.day)}</Td>
                {zoneWide && <Td className="max-w-56 truncate">{a.name}</Td>}
                <Td align="right" className="font-medium">{fmtKg(a.kg)}</Td><Td align="right" className="text-ink-muted">{fmtKg(a.expectedKg)}</Td>
                <Td align="right"><Badge tone="bad">{a.z.toFixed(1)}σ</Badge></Td>
              </Tr>
            ))}
          </TBody>
        </TableCard>
      </Card>
      <p className="flex items-center gap-2 text-xs text-ink-muted"><Percent aria-hidden className="size-3.5" />Waste excludes food that was redistributed. Window functions, views and the materialised view behind each panel are listed in docs/QUERY_CATALOGUE.md.</p>
    </div>
  );
}

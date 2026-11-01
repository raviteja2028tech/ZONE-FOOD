import { CircleAlert, Server } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DbStatusBadge, OverallStatusBadge } from "@/components/system/status-badge";
import { RefreshButton } from "@/components/layout/refresh-button";
import { checkSystem } from "@/lib/db/health";
import { requirePageUser } from "@/lib/auth/guard";

export const metadata = { title: "System status" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

const ENDPOINTS = [
  { path: "/api/health", note: "Overall status (200 healthy, 503 otherwise)" },
  { path: "/api/health/postgres", note: "PostgreSQL connectivity, extensions, migrations" },
  { path: "/api/health/mongo", note: "MongoDB connectivity and collection counts" },
];

export default async function SystemPage() {
  await requirePageUser("etl:read");
  const health = await checkSystem();
  const { postgres, mongo, config } = health;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="System status"
        description="Live connectivity checks against both databases, run on every page load."
        actions={<RefreshButton />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <OverallStatusBadge status={health.status} />
        <span className="tabular text-xs text-ink-muted">Checked {new Date(health.checkedAt).toLocaleTimeString("en-GB")}</span>
      </div>

      {config.status === "invalid" && (
        <Card role="alert" className="border-bad/40">
          <CardHeader title="Configuration is incomplete" description="Copy .env.example to .env and set the values below." />
          <CardBody>
            <ul className="space-y-1.5 text-sm text-ink">
              {config.issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-bad" />
                  {issue}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="PostgreSQL" description="System of record" action={<DbStatusBadge status={postgres.status} />} />
          <CardBody>
            {postgres.status === "up" ? (
              <dl className="divide-y divide-line">
                <Row label="Server version">PostgreSQL {postgres.version}</Row>
                <Row label="Database">{postgres.database}</Row>
                <Row label="Round-trip latency">{postgres.latencyMs} ms</Row>
                <Row label="Tables (excl. partitions)">{postgres.tableCount}</Row>
                <Row label="Migrations applied">{postgres.migrationsApplied}</Row>
                <Row label="Extensions">
                  <span className="inline-flex flex-wrap justify-end gap-1.5">
                    {postgres.extensions?.length ? (
                      postgres.extensions.map((e) => (
                        <Badge key={e.name} tone="info">
                          {e.name} {e.version}
                        </Badge>
                      ))
                    ) : (
                      <Badge tone="warn">none enabled</Badge>
                    )}
                  </span>
                </Row>
              </dl>
            ) : (
              <p className="text-sm text-bad">{postgres.error}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="MongoDB" description="Flexible documents and logs" action={<DbStatusBadge status={mongo.status} />} />
          <CardBody>
            {mongo.status === "up" ? (
              <>
                <dl className="divide-y divide-line">
                  <Row label="Server version">MongoDB {mongo.version}</Row>
                  <Row label="Database">{mongo.database}</Row>
                  <Row label="Round-trip latency">{mongo.latencyMs} ms</Row>
                </dl>
                <div className="mt-4 overflow-hidden rounded-md border border-line">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Collections and document counts</caption>
                    <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Collection</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Documents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {mongo.collections?.map((c) => (
                        <tr key={c.name}>
                          <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
                          <td className="tabular px-3 py-2 text-right">{c.documents.toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-bad">{mongo.error}</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Health API" description="Machine-readable endpoints used by this page's checks." />
        <div>
          <ul className="divide-y divide-line">
            {ENDPOINTS.map((e) => (
              <li key={e.path} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="inline-flex items-center gap-2 font-mono text-xs text-ink">
                  <Server aria-hidden className="size-3.5 text-ink-muted" />
                  GET {e.path}
                </span>
                <span className="text-sm text-ink-muted">{e.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

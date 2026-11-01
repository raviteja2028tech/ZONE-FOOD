import { Badge } from "@/components/ui/badge";
import type { SystemHealth } from "@/types/health";

export function DbStatusBadge({ status }: { status: "up" | "down" }) {
  return status === "up" ? <Badge tone="ok">Connected</Badge> : <Badge tone="bad">Unavailable</Badge>;
}

export function OverallStatusBadge({ status }: { status: SystemHealth["status"] }) {
  if (status === "healthy") return <Badge tone="ok">All systems operational</Badge>;
  if (status === "degraded") return <Badge tone="warn">Partially degraded</Badge>;
  return <Badge tone="bad">Databases unavailable</Badge>;
}

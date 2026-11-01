import {
  Activity, BarChart3, TrendingUp, Building2, ClipboardCheck, Database, FlaskConical, History, FileText, Gift, HandHeart, Handshake, LayoutDashboard, Map as MapIcon, Package, Salad, ScanSearch,
  Store, Trash2, Truck, Utensils, type LucideIcon,
} from "lucide-react";
import { can, type Permission, type Role } from "@/lib/auth/permissions";

export interface NavUser {
  role: Role;
  establishmentId: number | null;
  recipientId: number | null;
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  permission: Permission;
  href: (u: NavUser) => string;
  group: string;
}

/**
 * Single source of truth for navigation. An item is shown ONLY if the role holds the same permission the server
 * enforces on that route, so what a user sees always mirrors what the server will let them open.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, permission: "dashboard:view", href: () => "/", group: "Overview" },

  { label: "Analytics", icon: BarChart3, permission: "analytics:view", href: () => "/analytics", group: "Overview" },
  { label: "Forecast", icon: TrendingUp, permission: "forecast:view", href: () => "/forecast", group: "Overview" },

  { label: "Establishments", icon: Building2, permission: "establishment:list", href: () => "/establishments", group: "Locality" },
  { label: "Recipients", icon: HandHeart, permission: "recipient:list", href: () => "/recipients", group: "Locality" },
  { label: "Zones", icon: MapIcon, permission: "zone:read", href: () => "/zones", group: "Locality" },

  { label: "Procurement", icon: Truck, permission: "procurement:read", href: () => "/procurement", group: "Kitchen" },
  { label: "Inventory", icon: Package, permission: "inventory:read", href: () => "/inventory", group: "Kitchen" },
  { label: "Service", icon: Utensils, permission: "service:read", href: () => "/service", group: "Kitchen" },
  { label: "Waste", icon: Trash2, permission: "waste:read", href: () => "/waste", group: "Kitchen" },

  { label: "Surplus listings", icon: Gift, permission: "surplus:read", href: () => "/surplus", group: "Redistribution" },
  { label: "Available surplus", icon: Salad, permission: "feed:read", href: () => "/feed", group: "Redistribution" },
  { label: "Claims", icon: Handshake, permission: "claim:read", href: () => "/claims", group: "Redistribution" },

  { label: "Field logs", icon: FileText, permission: "submission:read", href: () => "/submissions", group: "Data" },
  { label: "Inspections", icon: ClipboardCheck, permission: "inspection:read", href: () => "/inspections", group: "Data" },
  { label: "Food catalogue", icon: Salad, permission: "food:read", href: () => "/food", group: "Data" },
  { label: "Name matching", icon: ScanSearch, permission: "matching:use", href: () => "/matching", group: "Data" },
  { label: "Data sync", icon: Database, permission: "etl:read", href: () => "/etl", group: "Administration" },
  { label: "DBMS Lab", icon: FlaskConical, permission: "lab:use", href: () => "/lab", group: "Administration" },
  { label: "Audit log", icon: History, permission: "audit:read", href: () => "/audit", group: "Administration" },
  { label: "System status", icon: Activity, permission: "etl:read", href: () => "/system", group: "Administration" },

  { label: "My establishment", icon: Store, permission: "establishment:view-own", href: (u) => `/establishments/${u.establishmentId}`, group: "Account" },
  { label: "My organisation", icon: HandHeart, permission: "recipient:update-own", href: (u) => `/recipients/${u.recipientId}`, group: "Account" },
];

export interface ResolvedNav {
  group: string;
  items: { label: string; href: string; icon: LucideIcon }[];
}

/** Role-filtered, grouped navigation. */
export function navFor(user: NavUser): ResolvedNav[] {
  const groups = new Map<string, ResolvedNav["items"]>();
  for (const item of NAV_ITEMS) {
    if (!can(user.role, item.permission)) continue;
    const list = groups.get(item.group) ?? [];
    list.push({ label: item.label, href: item.href(user), icon: item.icon });
    groups.set(item.group, list);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}

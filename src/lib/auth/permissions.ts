/**
 * Role-based access control. This table is the single source of truth: server routes, pages and the
 * navigation all ask `can(role, permission)`. Scope ("only my establishment") is enforced separately,
 * in the WHERE clause of every repository query - a permission says WHAT a role may do, scope says to WHICH rows.
 */
export const ROLES = ["ZONE_ADMIN", "AUDITOR", "ESTAB_MANAGER", "ESTAB_STAFF", "RECIPIENT_AGENT"] as const;
export type Role = (typeof ROLES)[number];

const ESTAB: Role[] = ["ESTAB_MANAGER", "ESTAB_STAFF"];
const AUTHORITY: Role[] = ["ZONE_ADMIN", "AUDITOR"];
const ALL: Role[] = [...ROLES];

export const PERMISSIONS = {
  "dashboard:view": ALL,

  "establishment:list": AUTHORITY,
  "establishment:manage": ["ZONE_ADMIN"],
  "establishment:view-own": ESTAB,
  "establishment:update-own": ["ESTAB_MANAGER"],

  "recipient:list": AUTHORITY,
  "recipient:manage": ["ZONE_ADMIN"],
  "recipient:update-own": ["RECIPIENT_AGENT"],

  "food:read": ALL,
  "food:manage": ["ZONE_ADMIN"],

  "procurement:read": [...ESTAB, ...AUTHORITY],
  "procurement:write": ESTAB,
  "inventory:read": [...ESTAB, ...AUTHORITY],

  "service:read": [...ESTAB, ...AUTHORITY],
  "service:write": ESTAB,

  "waste:read": [...ESTAB, ...AUTHORITY],
  "waste:write": ESTAB,

  "surplus:read": [...ESTAB, ...AUTHORITY],
  "surplus:write": ESTAB,

  "feed:read": ["RECIPIENT_AGENT"],
  "claim:read": ALL,
  "claim:create": ["RECIPIENT_AGENT"],
  "claim:review": ["ESTAB_MANAGER"], // approve / reject
  "claim:handover": ESTAB, // mark collected / no-show at the counter
  "claim:collect": ["RECIPIENT_AGENT"], // recipient confirms pickup

  "zone:read": AUTHORITY,
  "zone:manage": ["ZONE_ADMIN"],

  "submission:read": [...ESTAB, ...AUTHORITY],
  "submission:write": ESTAB,
  "inspection:read": [...ESTAB, ...AUTHORITY],
  "inspection:write": ["ESTAB_MANAGER", "ZONE_ADMIN"],

  "etl:read": AUTHORITY,
  "etl:run": ["ZONE_ADMIN"],
  // Part 3: analytics for authority and establishments (each scoped to its own data), the read-only DBMS Lab,
  // the audit trail, and refreshing the materialised view.
  "analytics:view": [...ESTAB, ...AUTHORITY],
  "lab:use": AUTHORITY,
  // Part 4 (requested): forecasting dashboard. Authority sees the zone; establishments see only their own forecast.
  "forecast:view": [...ESTAB, ...AUTHORITY],
  "lab:refresh": ["ZONE_ADMIN"],
  "audit:read": AUTHORITY,
  "matching:use": [...ESTAB, ...AUTHORITY],
  "embeddings:manage": ["ZONE_ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const isEstablishmentRole = (role: Role) => role === "ESTAB_MANAGER" || role === "ESTAB_STAFF";
export const isAuthorityRole = (role: Role) => role === "ZONE_ADMIN" || role === "AUDITOR";

export const ROLE_LABEL: Record<Role, string> = {
  ZONE_ADMIN: "Zone administrator",
  AUDITOR: "Auditor",
  ESTAB_MANAGER: "Establishment manager",
  ESTAB_STAFF: "Kitchen staff",
  RECIPIENT_AGENT: "Recipient organisation",
};

import { can, type Role } from "@/lib/auth/permissions";

export type ClaimStatus = "REQUESTED" | "APPROVED" | "COLLECTED" | "NO_SHOW" | "REJECTED";
export type ClaimAction = "approve" | "reject" | "collect" | "no_show";
export type ListingStatus = "OPEN" | "PARTIALLY_CLAIMED" | "FULLY_CLAIMED" | "EXPIRED" | "CANCELLED";

/**
 * The only legal claim transitions. Anything not listed is refused (409), in the API *and* is never
 * written to the database:
 *
 *   REQUESTED --approve--> APPROVED --collect--> COLLECTED
 *       |                      \\--no_show--> NO_SHOW
 *       \\--reject--> REJECTED
 */
const TRANSITIONS: Record<ClaimStatus, Partial<Record<ClaimAction, ClaimStatus>>> = {
  REQUESTED: { approve: "APPROVED", reject: "REJECTED" },
  APPROVED: { collect: "COLLECTED", no_show: "NO_SHOW" },
  COLLECTED: {},
  NO_SHOW: {},
  REJECTED: {},
};

export function nextClaimStatus(current: ClaimStatus, action: ClaimAction): ClaimStatus | null {
  return TRANSITIONS[current][action] ?? null;
}

export function allowedActions(current: ClaimStatus): ClaimAction[] {
  return Object.keys(TRANSITIONS[current]) as ClaimAction[];
}

/** Which role may perform which action (collect is shared by the recipient and the handing-over establishment). */
export function roleMayPerform(role: Role, action: ClaimAction): boolean {
  switch (action) {
    case "approve":
    case "reject":
      return can(role, "claim:review");
    case "collect":
      return can(role, "claim:collect") || can(role, "claim:handover");
    case "no_show":
      return can(role, "claim:handover");
  }
}

/** Approved and collected claims hold quantity against the listing; requested/rejected/no-show do not. */
export const holdsQuantity = (status: ClaimStatus) => status === "APPROVED" || status === "COLLECTED";

export function deriveListingStatus(input: {
  offeredKg: number;
  claimedKg: number;
  expiresAt: Date;
  now: Date;
  cancelled?: boolean;
}): ListingStatus {
  if (input.cancelled) return "CANCELLED";
  if (input.claimedKg >= input.offeredKg - 1e-9) return "FULLY_CLAIMED";
  if (input.expiresAt <= input.now) return "EXPIRED";
  return input.claimedKg > 0 ? "PARTIALLY_CLAIMED" : "OPEN";
}

export const isListingClaimable = (status: ListingStatus) => status === "OPEN" || status === "PARTIALLY_CLAIMED";

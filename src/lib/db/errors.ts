import { DatabaseError } from "pg";
import { AppError } from "@/lib/http/errors";

/** Friendly messages for the constraints users can realistically trip. Falls back to a generic message. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_estab_name_zone: "An establishment with this name already exists in that zone.",
  app_user_email_key: "An account with this email already exists.",
  recipient_org_org_name_key: "An organisation with this name already exists.",
  commercial_profile_fssai_license_key: "That FSSAI licence number is already registered.",
  uq_invoice: "This invoice number was already recorded for that supplier.",
  uq_session: "A service session for that date and meal slot already exists.",
  uq_batch: "That dish has already been added to this session.",
  uq_claim: "Your organisation has already claimed this listing.",
  uq_dish: "A dish with this name already exists for this establishment.",
  food_item_canonical_name_key: "A food item with this name already exists.",
  uq_zone_name_parent: "A zone with this name already exists under that parent.",
  uq_zone_root_name: "A top-level zone with this name already exists.",
  ck_waste_not_future: "The waste date cannot be in the future.",
  ck_lot_balance: "Remaining quantity cannot exceed the received quantity.",
  ck_listing_balance: "Claimed quantity cannot exceed the offered quantity.",
  ck_listing_window: "The listing must expire after it becomes available.",
  ck_pickup_window: "The pickup window must end after it starts.",
  ck_estab_since: "The operational-since date cannot be in the future.",
  ck_occupants_ge_households: "Total occupants cannot be fewer than the number of households.",
  ck_closed_has_actuals: "A closed session needs an actual headcount.",
};

/** Translates PostgreSQL constraint/trigger errors into safe, specific API errors. Returns null for anything else. */
export function mapPgError(err: unknown): AppError | null {
  if (!(err instanceof DatabaseError)) return null;
  const friendly = err.constraint ? CONSTRAINT_MESSAGES[err.constraint] : undefined;
  switch (err.code) {
    case "23505":
      return new AppError(409, "CONFLICT", friendly ?? "That record already exists.");
    case "23503":
      return new AppError(422, "INVALID_REFERENCE", "A referenced record does not exist or is still in use.");
    case "23514":
      // Trigger-raised check violations carry a purpose-written message (e.g. served + leftover > prepared).
      return new AppError(422, "RULE_VIOLATION", friendly ?? (err.constraint ? `Data rule violated (${err.constraint}).` : err.message));
    case "23502":
      return new AppError(422, "MISSING_VALUE", `A required value is missing${err.column ? ` (${err.column})` : ""}.`);
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
      return new AppError(400, "BAD_VALUE", "A value has the wrong format or is out of range.");
    // Raised on purpose by the stored functions/procedures (see migration 016):
    case "P0002": // no_data_found: the record does not exist, or belongs to someone else
      return new AppError(404, "NOT_FOUND", err.message);
    case "55000": // object_not_in_prerequisite_state: expired, closed, illegal transition...
      return new AppError(409, "CONFLICT", err.message);
    case "42501": // insufficient_privilege: the caller's side may not perform this action
      return new AppError(403, "FORBIDDEN", err.message);
    case "40001":
    case "40P01":
      return new AppError(409, "RETRY", "The record was changed by someone else at the same time. Please try again.");
    default:
      return null;
  }
}

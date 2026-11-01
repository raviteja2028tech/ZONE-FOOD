import { z } from "zod";

/**
 * Layer 1 of the three validation layers (zod at the API boundary -> CHECK constraints in the DDL ->
 * triggers for cross-table rules). Schemas live in one file so the rules are easy to review.
 */
const trimmed = (max: number, label: string) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const id = (label = "id") => z.coerce.number({ error: `${label} is required` }).int(`${label} is invalid`).positive(`${label} is invalid`);
export const optionalId = (label = "id") =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), id(label).optional());
export const kg = (label = "Quantity") =>
  z.coerce.number({ error: `${label} must be a number` }).positive(`${label} must be greater than 0`).max(99_999, `${label} is too large`);
export const money = (label = "Amount") =>
  z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(10_000_000, `${label} is too large`);
export const isoDate = (label = "Date") => z.iso.date({ error: `${label} must be a valid date (YYYY-MM-DD)` });
export const isoDateTime = (label = "Date and time") =>
  z.iso.datetime({ offset: true, error: `${label} must be a valid date and time` });
const phone = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[0-9]{10}$/, "Phone must be 10 digits").optional());
const hhmm = (label: string) => z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, `${label} must be a time such as 18:30`);

/* ------------------------------------------------------------------ auth */
export const emailSchema = z.string({ error: "Email is required" }).trim().toLowerCase().email("Enter a valid email address").max(150);
export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(10, "Password must be at least 10 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Password is required" }).min(1, "Password is required").max(200),
});

const accountFields = {
  email: emailSchema,
  password: passwordSchema,
  fullName: trimmed(120, "Full name"),
  phone,
};

export const profileSchemas = {
  commercial: z.object({
    cuisineType: optionalText(60),
    seatingCapacity: z.coerce.number().int().min(0).max(100_000).optional(),
    avgDailyCovers: z.coerce.number().int().min(0).max(1_000_000).optional(),
    hasBuffet: z.boolean().default(false),
    fssaiLicense: optionalText(20),
  }),
  institutional: z.object({
    enrolledStrength: z.coerce.number({ error: "Enrolled strength is required" }).int().positive("Enrolled strength must be greater than 0").max(1_000_000),
    messType: z.enum(["VEG", "NON_VEG", "MIXED"]).optional(),
    servesMealsPerDay: z.coerce.number().int().min(1, "Meals per day must be 1-5").max(5, "Meals per day must be 1-5").default(3),
  }),
  residential: z
    .object({
      householdCount: z.coerce.number({ error: "Household count is required" }).int().positive("Household count must be greater than 0").max(100_000),
      totalOccupants: z.coerce.number({ error: "Total occupants is required" }).int().positive("Total occupants must be greater than 0").max(1_000_000),
      hasCommonKitchen: z.boolean().default(false),
      segregationCompliant: z.boolean().default(false),
    })
    .refine((v) => v.totalOccupants >= v.householdCount, { path: ["totalOccupants"], message: "Total occupants cannot be fewer than households" }),
};

export const establishmentFields = {
  name: trimmed(150, "Establishment name"),
  categoryId: id("Category"),
  zoneId: id("Zone"),
  addressLine: optionalText(255),
  capacity: z.coerce.number({ error: "Capacity is required" }).int().positive("Capacity must be greater than 0").max(10_000_000),
  operationalSince: isoDate("Operational since"),
};

export const registerEstablishmentSchema = z.object({
  ...accountFields,
  establishment: z.object(establishmentFields),
  profile: z.record(z.string(), z.unknown()).default({}),
});

export const orgTypes = ["NGO", "SHELTER", "COMMUNITY_FRIDGE", "ANIMAL_SHELTER", "COMPOST_UNIT"] as const;
const orgFields = {
  zoneId: id("Zone"),
  orgName: trimmed(150, "Organisation name"),
  orgType: z.enum(orgTypes, { error: "Choose an organisation type" }),
  needProfile: trimmed(1000, "Need profile").pipe(z.string().min(20, "Describe what you need in at least 20 characters")),
  dailyCapacityKg: kg("Daily capacity"),
  acceptsCooked: z.boolean().default(true),
  pickupWindowStart: hhmm("Pickup start"),
  pickupWindowEnd: hhmm("Pickup end"),
  contactPhone: phone,
};
const windowOk = (v: { pickupWindowStart?: string; pickupWindowEnd?: string }) =>
  !v.pickupWindowStart || !v.pickupWindowEnd || v.pickupWindowEnd > v.pickupWindowStart;
export const registerRecipientSchema = z.object({
  ...accountFields,
  org: z.object(orgFields).refine(windowOk, { path: ["pickupWindowEnd"], message: "Pickup must end after it starts" }),
});

export const updateRecipientSchema = z
  .object({ ...orgFields, zoneId: orgFields.zoneId.optional() })
  .partial()
  .refine(windowOk, { path: ["pickupWindowEnd"], message: "Pickup must end after it starts" });

export const updateEstablishmentSchema = z
  .object({
    name: establishmentFields.name,
    addressLine: establishmentFields.addressLine,
    capacity: establishmentFields.capacity,
    zoneId: establishmentFields.zoneId,
    isActive: z.boolean(),
  })
  .partial();

/* ----------------------------------------------------------------- food / procurement */
export const foodItemSchema = z.object({
  canonicalName: trimmed(120, "Food name"),
  foodCategoryId: id("Category"),
  description: optionalText(500),
  baseUnit: z.enum(["kg", "litre", "unit"]).default("kg"),
  avgCostPerUnit: money("Average cost"),
  isEdibleAsIs: z.boolean().default(true),
});

export const procurementSchema = z
  .object({
    supplierId: optionalId("Supplier"),
    invoiceNo: optionalText(50),
    receivedAt: isoDateTime("Received at").optional(),
    lines: z
      .array(
        z.object({
          foodId: id("Food item"),
          quantity: kg("Quantity"),
          unitCost: money("Unit cost"),
          expiryDate: isoDate("Expiry date").optional(),
        }),
      )
      .min(1, "Add at least one line")
      .max(50, "At most 50 lines per delivery"),
  })
  .refine((v) => new Set(v.lines.map((l) => l.foodId)).size === v.lines.length, {
    path: ["lines"],
    message: "Each food item can appear only once per delivery",
  });

/* ------------------------------------------------------------- service / consumption */
export const slots = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER", "ALL_DAY"] as const;
export const openSessionSchema = z.object({
  serviceDate: isoDate("Service date"),
  slot: z.enum(slots, { error: "Choose a meal slot" }),
  expectedHeadcount: z.coerce.number({ error: "Expected headcount is required" }).int().min(0).max(1_000_000),
});
export const dishSchema = z.object({
  dishName: trimmed(120, "Dish name"),
  standardPortionG: z.coerce.number({ error: "Portion size is required" }).positive("Portion size must be greater than 0").max(10_000),
  isVegetarian: z.boolean().default(true),
});
export const batchSchema = z.object({
  dishId: id("Dish"),
  preparedQtyKg: kg("Prepared quantity"),
  preparedPortions: z.coerce.number({ error: "Portions are required" }).int().positive("Portions must be greater than 0").max(1_000_000),
  prepCost: money("Preparation cost").optional(),
});
export const closeSessionSchema = z.object({
  actualHeadcount: z.coerce.number({ error: "Actual headcount is required" }).int().min(0).max(1_000_000),
  records: z
    .array(
      z.object({
        batchId: id("Batch"),
        servedQtyKg: z.coerce.number().min(0, "Served cannot be negative").max(99_999),
        leftoverQtyKg: z.coerce.number().min(0, "Leftover cannot be negative").max(99_999),
        plateWasteKg: z.coerce.number().min(0, "Plate waste cannot be negative").max(99_999).default(0),
      }),
    )
    .min(1, "Record consumption for at least one batch"),
});

/* ------------------------------------------------------------------------ waste */
export const stages = ["PRE_CONSUMER_PREP", "PRE_CONSUMER_SPOILAGE", "PRE_CONSUMER_EXPIRY", "POST_CONSUMER_PLATE", "POST_CONSUMER_SERVICE"] as const;
export const wasteSchema = z.object({
  foodId: optionalId("Food item"),
  reasonId: id("Reason"),
  routeId: id("Disposal route"),
  stage: z.enum(stages, { error: "Choose a stage" }),
  quantityKg: kg("Quantity"),
  wasEdible: z.boolean().default(true),
  occurredOn: isoDate("Date"),
  notes: optionalText(1000),
  lotId: optionalId("Lot"),
  sessionId: optionalId("Session"),
});

/* ----------------------------------------------------------------------- surplus */
export const listingSchema = z
  .object({
    description: trimmed(1000, "Description").pipe(z.string().min(10, "Describe the food in at least 10 characters")),
    foodId: optionalId("Food item"),
    sessionId: optionalId("Session"),
    offeredQtyKg: kg("Offered quantity"),
    isCooked: z.boolean().default(true),
    isVegetarian: z.boolean().default(true),
    availableFrom: isoDateTime("Available from"),
    expiresAt: isoDateTime("Expires at"),
  })
  .refine((v) => new Date(v.expiresAt) > new Date(v.availableFrom), { path: ["expiresAt"], message: "Expiry must be after the available-from time" });

export const claimCreateSchema = z.object({ listingId: id("Listing"), claimedQtyKg: kg("Claim quantity") });
export const claimActionSchema = z.object({ action: z.enum(["approve", "reject", "collect", "no_show"], { error: "Unknown action" }) });

/* ------------------------------------------------------------------------- zones */
export const zoneSchema = z.object({
  zoneName: trimmed(120, "Zone name"),
  parentZoneId: id("Parent zone"),
  pincode: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[0-9]{6}$/, "Pincode must be 6 digits").optional()),
});
export const zoneRenameSchema = z.object({ zoneName: trimmed(120, "Zone name") });

/* ------------------------------------------------------------ MongoDB documents */
const kgField = z.coerce.number().min(0).max(99_999);
export const submissionPayloadSchemas = {
  COMMERCIAL: z.looseObject({
    slot: z.enum(["BREAKFAST", "LUNCH", "SNACKS", "DINNER"]).optional(),
    covers_served: z.coerce.number().int().min(0).optional(),
    dish_waste: z
      .array(
        z.looseObject({
          dish_name: trimmed(120, "Dish name"),
          portions_prepared: z.coerce.number().int().min(0).optional(),
          portions_sold: z.coerce.number().int().min(0).optional(),
          returned_plates: z.coerce.number().int().min(0),
          avg_plate_leftover_g: z.coerce.number().min(0).max(5000),
        }),
      )
      .min(1, "Add at least one dish"),
    buffet_counter_leftovers_kg: kgField.optional(),
  }),
  RESIDENTIAL: z.looseObject({
    bins: z.looseObject({
      vegetable_peels_kg: kgField.optional(),
      cooked_leftovers_kg: kgField.optional(),
      expired_packaged_kg: kgField.optional(),
    }),
    segregated: z.boolean().default(false),
    occupants_present: z.coerce.number().int().min(0).optional(),
    free_text: optionalText(500),
  }),
  EDUCATIONAL: z.looseObject({
    meal_slot: z.enum(["BREAKFAST", "LUNCH", "SNACKS", "DINNER"]).optional(),
    headcount: z.looseObject({ present: z.coerce.number().int().min(0), guests: z.coerce.number().int().min(0).default(0) }),
    counters: z.array(z.looseObject({ counter: trimmed(60, "Counter"), plates_served: z.coerce.number().int().min(0), leftover_kg: kgField })).min(1, "Add at least one counter"),
    exam_day: z.boolean().optional(),
  }),
  RETAIL_FOOD: z.looseObject({
    skus: z
      .array(z.looseObject({ sku_name: trimmed(120, "SKU name"), markdown_pct: z.coerce.number().min(0).max(100).default(0), units_expiring: z.coerce.number().int().min(0).default(0), units_discarded: z.coerce.number().int().min(0) }))
      .min(1, "Add at least one SKU"),
    chiller_temp_c: z.coerce.number().min(-30).max(40).optional(),
  }),
  ORGANIZATIONAL: z.looseObject({ coupons_redeemed: z.coerce.number().int().min(0).optional(), tray_returns_kg: kgField, feedback_note: optionalText(300) }),
  HEALTHCARE: z.looseObject({
    ward_meals: z.array(z.looseObject({ ward: trimmed(60, "Ward"), meals_sent: z.coerce.number().int().min(0), meals_returned: z.coerce.number().int().min(0) })).min(1, "Add at least one ward"),
    diet_types: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
  }),
  RECREATIONAL: z.looseObject({ event_name: trimmed(120, "Event name"), buffet_leftover_kg: kgField, guests: z.coerce.number().int().min(0).optional() }),
} as const;

export const submissionSchema = z.object({
  serviceDate: isoDate("Service date"),
  payload: z.record(z.string(), z.unknown()),
});

export const inspectionSchema = z.object({
  inspectedAt: isoDateTime("Inspection time").optional(),
  establishmentId: optionalId("Establishment"),
  templateVersion: optionalText(10),
  inspectorNotes: optionalText(1000),
  sections: z
    .array(
      z.object({
        name: trimmed(80, "Section name"),
        items: z
          .array(
            z.looseObject({
              item: trimmed(120, "Item"),
              status: z.enum(["PASS", "FAIL", "NA"]),
              note: optionalText(300),
              reading_c: z.coerce.number().min(-30).max(100).optional(),
            }),
          )
          .min(1, "Each section needs at least one item")
          .max(30),
      }),
    )
    .min(1, "Add at least one section")
    .max(12),
});

export const matchNameSchema = z.object({ name: trimmed(150, "Name") });

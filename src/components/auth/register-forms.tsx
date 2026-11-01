"use client";

import { Building2, HandHeart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSubmit, num, str } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Checkbox, Field, FormError, FormGrid, Input, Select, Textarea } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";

interface Category { id: number; label: string; kind: string; metric: string }
interface ZoneOpt { id: number; label: string }

const ORG_TYPES = [
  ["NGO", "NGO / charity kitchen"], ["SHELTER", "Shelter"], ["COMMUNITY_FRIDGE", "Community fridge"],
  ["ANIMAL_SHELTER", "Animal shelter"], ["COMPOST_UNIT", "Compost unit"],
] as const;

const profileKind = (kind: string) => (kind === "RESIDENTIAL" ? "residential" : ["EDUCATIONAL", "ORGANIZATIONAL", "HEALTHCARE"].includes(kind) ? "institutional" : "commercial");

function AccountFields({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      <FormGrid>
        <Field label="Your full name" name="fullName" error={fields.fullName}><Input name="fullName" autoComplete="name" required /></Field>
        <Field label="Phone (optional)" name="phone" error={fields.phone} hint="10 digits"><Input name="phone" inputMode="numeric" autoComplete="tel" /></Field>
      </FormGrid>
      <FormGrid>
        <Field label="Work email" name="email" error={fields.email}><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" name="password" error={fields.password} hint="At least 10 characters, with a letter and a number"><Input name="password" type="password" autoComplete="new-password" required /></Field>
      </FormGrid>
    </>
  );
}

/** Dotted `establishment.name` style errors from the API are mapped back onto flat form field names. */
const flat = (f: Record<string, string>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k.split(".").pop() as string, v]));

function EstablishmentForm({ categories, zones }: { categories: Category[]; zones: ZoneOpt[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const cat = categories.find((c) => String(c.id) === categoryId);
  const { submit, pending, error, fields } = useSubmit({ url: "/api/auth/register/establishment", refresh: false, onSuccess: () => { router.replace("/"); router.refresh(); } });
  const f = flat(fields);
  const kind = cat ? profileKind(cat.kind) : null;

  return (
    <form
      method="post"
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const profile =
          kind === "commercial"
            ? { cuisineType: str(fd.get("cuisineType")), seatingCapacity: num(fd.get("seatingCapacity")), avgDailyCovers: num(fd.get("avgDailyCovers")), hasBuffet: fd.get("hasBuffet") === "on", fssaiLicense: str(fd.get("fssaiLicense")) }
            : kind === "institutional"
              ? { enrolledStrength: num(fd.get("enrolledStrength")), messType: str(fd.get("messType")), servesMealsPerDay: num(fd.get("servesMealsPerDay")) ?? 3 }
              : kind === "residential"
                ? { householdCount: num(fd.get("householdCount")), totalOccupants: num(fd.get("totalOccupants")), hasCommonKitchen: fd.get("hasCommonKitchen") === "on", segregationCompliant: fd.get("segregationCompliant") === "on" }
                : {};
        void submit({
          fullName: fd.get("fullName"), phone: str(fd.get("phone")), email: fd.get("email"), password: fd.get("password"),
          establishment: { name: fd.get("name"), categoryId: num(fd.get("categoryId")), zoneId: num(fd.get("zoneId")), addressLine: str(fd.get("addressLine")), capacity: num(fd.get("capacity")), operationalSince: fd.get("operationalSince") },
          profile,
        });
      }}
    >
      <FormError message={error} />
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-ink">Your account (you become the manager)</legend>
        <AccountFields fields={f} />
      </fieldset>
      <fieldset className="space-y-4 border-t border-line pt-5">
        <legend className="mb-1 text-sm font-semibold text-ink">Establishment</legend>
        <Field label="Establishment name" name="name" error={f.name}><Input name="name" required /></Field>
        <FormGrid>
          <Field label="Type" name="categoryId" error={f.categoryId}>
            <Select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">Select a type…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Street zone" name="zoneId" error={f.zoneId}>
            <Select name="zoneId" required defaultValue="">
              <option value="">Select a street…</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </Select>
          </Field>
        </FormGrid>
        <Field label="Address (optional)" name="addressLine" error={f.addressLine}><Input name="addressLine" autoComplete="street-address" /></Field>
        <FormGrid>
          <Field label={cat ? `Capacity (${cat.metric})` : "Capacity"} name="capacity" error={f.capacity}><Input name="capacity" type="number" min={1} required /></Field>
          <Field label="Operating since" name="operationalSince" error={f.operationalSince}><Input name="operationalSince" type="date" max={new Date().toISOString().slice(0, 10)} required /></Field>
        </FormGrid>

        {kind === "commercial" && (
          <div className={cn("space-y-4 rounded-lg bg-surface-2/60 p-4")}>
            <FormGrid>
              <Field label="Cuisine (optional)" name="cuisineType" error={f.cuisineType}><Input name="cuisineType" /></Field>
              <Field label="FSSAI licence (optional)" name="fssaiLicense" error={f.fssaiLicense}><Input name="fssaiLicense" /></Field>
              <Field label="Seating capacity (optional)" name="seatingCapacity" error={f.seatingCapacity}><Input name="seatingCapacity" type="number" min={0} /></Field>
              <Field label="Average daily covers (optional)" name="avgDailyCovers" error={f.avgDailyCovers}><Input name="avgDailyCovers" type="number" min={0} /></Field>
            </FormGrid>
            <Checkbox name="hasBuffet" label="Runs a buffet service" />
          </div>
        )}
        {kind === "institutional" && (
          <div className="space-y-4 rounded-lg bg-surface-2/60 p-4">
            <FormGrid cols={3}>
              <Field label="Enrolled strength" name="enrolledStrength" error={f.enrolledStrength}><Input name="enrolledStrength" type="number" min={1} required /></Field>
              <Field label="Mess type" name="messType" error={f.messType}><Select name="messType" defaultValue=""><option value="">Not specified</option><option value="VEG">Vegetarian</option><option value="NON_VEG">Non-vegetarian</option><option value="MIXED">Mixed</option></Select></Field>
              <Field label="Meals per day" name="servesMealsPerDay" error={f.servesMealsPerDay}><Input name="servesMealsPerDay" type="number" min={1} max={5} defaultValue={3} /></Field>
            </FormGrid>
          </div>
        )}
        {kind === "residential" && (
          <div className="space-y-4 rounded-lg bg-surface-2/60 p-4">
            <FormGrid>
              <Field label="Households" name="householdCount" error={f.householdCount}><Input name="householdCount" type="number" min={1} required /></Field>
              <Field label="Total occupants" name="totalOccupants" error={f.totalOccupants}><Input name="totalOccupants" type="number" min={1} required /></Field>
            </FormGrid>
            <div className="flex flex-wrap gap-x-6 gap-y-2"><Checkbox name="hasCommonKitchen" label="Has a common kitchen" /><Checkbox name="segregationCompliant" label="Segregates wet/dry waste" /></div>
          </div>
        )}
      </fieldset>
      <FormActions pending={pending} submitLabel="Create establishment account" pendingLabel="Creating…" />
    </form>
  );
}

function RecipientForm({ zones }: { zones: ZoneOpt[] }) {
  const router = useRouter();
  const { submit, pending, error, fields } = useSubmit({ url: "/api/auth/register/recipient", refresh: false, onSuccess: () => { router.replace("/"); router.refresh(); } });
  const f = flat(fields);
  return (
    <form
      method="post"
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void submit({
          fullName: fd.get("fullName"), phone: str(fd.get("phone")), email: fd.get("email"), password: fd.get("password"),
          org: { zoneId: num(fd.get("zoneId")), orgName: fd.get("orgName"), orgType: fd.get("orgType"), needProfile: fd.get("needProfile"), dailyCapacityKg: num(fd.get("dailyCapacityKg")), acceptsCooked: fd.get("acceptsCooked") === "on", pickupWindowStart: fd.get("pickupWindowStart"), pickupWindowEnd: fd.get("pickupWindowEnd"), contactPhone: str(fd.get("contactPhone")) },
        });
      }}
    >
      <FormError message={error} />
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-ink">Your account (organisation agent)</legend>
        <AccountFields fields={f} />
      </fieldset>
      <fieldset className="space-y-4 border-t border-line pt-5">
        <legend className="mb-1 text-sm font-semibold text-ink">Organisation</legend>
        <FormGrid>
          <Field label="Organisation name" name="orgName" error={f.orgName}><Input name="orgName" required /></Field>
          <Field label="Type" name="orgType" error={f.orgType}><Select name="orgType" required defaultValue=""><option value="">Select…</option>{ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </FormGrid>
        <Field label="Street zone" name="zoneId" error={f.zoneId}>
          <Select name="zoneId" required defaultValue=""><option value="">Select a street…</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</Select>
        </Field>
        <Field label="What do you need?" name="needProfile" error={f.needProfile} hint="Free text - this is embedded and used to rank surplus for you (e.g. who you feed, dietary rules, timing).">
          <Textarea name="needProfile" required placeholder="We feed about 80 people dinner every night and accept cooked vegetarian meals…" />
        </Field>
        <FormGrid cols={3}>
          <Field label="Daily capacity (kg)" name="dailyCapacityKg" error={f.dailyCapacityKg}><Input name="dailyCapacityKg" type="number" step="0.1" min={0.1} required /></Field>
          <Field label="Pickup from" name="pickupWindowStart" error={f.pickupWindowStart}><Input name="pickupWindowStart" type="time" defaultValue="18:00" required /></Field>
          <Field label="Pickup until" name="pickupWindowEnd" error={f.pickupWindowEnd}><Input name="pickupWindowEnd" type="time" defaultValue="21:00" required /></Field>
        </FormGrid>
        <FormGrid>
          <Field label="Contact phone (optional)" name="contactPhone" error={f.contactPhone}><Input name="contactPhone" inputMode="numeric" /></Field>
          <div className="flex items-end pb-2"><Checkbox name="acceptsCooked" label="We accept cooked food" defaultChecked /></div>
        </FormGrid>
      </fieldset>
      <FormActions pending={pending} submitLabel="Create organisation account" pendingLabel="Creating…" />
    </form>
  );
}

export function RegisterForms({ categories, zones }: { categories: Category[]; zones: ZoneOpt[] }) {
  const [tab, setTab] = useState<"establishment" | "recipient">("establishment");
  const tabs = [
    { id: "establishment" as const, label: "Food establishment", icon: Building2, hint: "Restaurant, mess, canteen, apartment…" },
    { id: "recipient" as const, label: "Recipient organisation", icon: HandHeart, hint: "NGO, shelter, community fridge…" },
  ];
  return (
    <>
      <div role="tablist" aria-label="Account type" className="mb-8 grid grid-cols-2 gap-3">
        {tabs.map(({ id, label, icon: Icon, hint }) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("rounded-lg border p-3.5 text-left transition-all", tab === id ? "border-accent bg-accent-soft shadow-card" : "border-line bg-surface hover:border-line-strong")}>
            <Icon aria-hidden className={cn("mb-2 size-5", tab === id ? "text-accent-ink" : "text-ink-muted")} />
            <span className="block text-sm font-semibold text-ink">{label}</span>
            <span className="block text-xs text-ink-muted">{hint}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "establishment" ? <EstablishmentForm categories={categories} zones={zones} /> : <RecipientForm zones={zones} />}</div>
    </>
  );
}

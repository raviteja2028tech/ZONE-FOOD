"use client";

import { useSubmit, num, str } from "@/lib/client-api";
import { Checkbox, Field, FormError, FormGrid, Input, Select, Textarea } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";
import { useModal } from "@/components/ui/modal";

interface Opt { id: number; label: string }

export function EditEstablishmentForm({ id, initial, zones }: { id: number; initial: { name: string; address_line: string | null; capacity: number; zone_id: number }; zones?: Opt[] }) {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: `/api/establishments/${id}`, method: "PATCH", success: "Establishment updated", onSuccess: () => modal?.close() });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ name: fd.get("name"), addressLine: str(fd.get("addressLine")) ?? "", capacity: num(fd.get("capacity")), ...(zones ? { zoneId: num(fd.get("zoneId")) } : {}) }); }}>
      <FormError message={error} />
      <Field label="Name" name="name" error={fields.name}><Input name="name" defaultValue={initial.name} required /></Field>
      <Field label="Address" name="addressLine" error={fields.addressLine}><Input name="addressLine" defaultValue={initial.address_line ?? ""} /></Field>
      <FormGrid>
        <Field label="Capacity" name="capacity" error={fields.capacity}><Input name="capacity" type="number" min={1} defaultValue={initial.capacity} required /></Field>
        {zones && <Field label="Street zone" name="zoneId" error={fields.zoneId}><Select name="zoneId" defaultValue={initial.zone_id}>{zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</Select></Field>}
      </FormGrid>
      <FormActions pending={pending} submitLabel="Save changes" />
    </form>
  );
}

const ORG_TYPES = [["NGO", "NGO / charity kitchen"], ["SHELTER", "Shelter"], ["COMMUNITY_FRIDGE", "Community fridge"], ["ANIMAL_SHELTER", "Animal shelter"], ["COMPOST_UNIT", "Compost unit"]] as const;

export function EditRecipientForm({ id, initial }: { id: number; initial: { org_name: string; org_type: string; need_profile: string; daily_capacity_kg: number; accepts_cooked: boolean; pickup_window_start: string | null; pickup_window_end: string | null; contact_phone: string | null } }) {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: `/api/recipients/${id}`, method: "PATCH", success: "Organisation updated (need profile re-embedded)", onSuccess: () => modal?.close() });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ orgName: fd.get("orgName"), orgType: fd.get("orgType"), needProfile: fd.get("needProfile"), dailyCapacityKg: num(fd.get("dailyCapacityKg")), acceptsCooked: fd.get("acceptsCooked") === "on", pickupWindowStart: fd.get("pickupWindowStart"), pickupWindowEnd: fd.get("pickupWindowEnd"), contactPhone: str(fd.get("contactPhone")) }); }}>
      <FormError message={error} />
      <FormGrid>
        <Field label="Organisation name" name="orgName" error={fields.orgName}><Input name="orgName" defaultValue={initial.org_name} required /></Field>
        <Field label="Type" name="orgType" error={fields.orgType}><Select name="orgType" defaultValue={initial.org_type}>{ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      </FormGrid>
      <Field label="What do you need?" name="needProfile" error={fields.needProfile} hint="Changing this re-computes the embedding used to rank surplus for you."><Textarea name="needProfile" defaultValue={initial.need_profile} required /></Field>
      <FormGrid cols={3}>
        <Field label="Daily capacity (kg)" name="dailyCapacityKg" error={fields.dailyCapacityKg}><Input name="dailyCapacityKg" type="number" step="0.1" min={0.1} defaultValue={initial.daily_capacity_kg} required /></Field>
        <Field label="Pickup from" name="pickupWindowStart" error={fields.pickupWindowStart}><Input name="pickupWindowStart" type="time" defaultValue={initial.pickup_window_start ?? "18:00"} required /></Field>
        <Field label="Pickup until" name="pickupWindowEnd" error={fields.pickupWindowEnd}><Input name="pickupWindowEnd" type="time" defaultValue={initial.pickup_window_end ?? "21:00"} required /></Field>
      </FormGrid>
      <FormGrid>
        <Field label="Contact phone" name="contactPhone" error={fields.contactPhone}><Input name="contactPhone" defaultValue={initial.contact_phone ?? ""} inputMode="numeric" /></Field>
        <div className="flex items-end pb-2"><Checkbox name="acceptsCooked" label="Accepts cooked food" defaultChecked={initial.accepts_cooked} /></div>
      </FormGrid>
      <FormActions pending={pending} submitLabel="Save changes" />
    </form>
  );
}

export function FoodForm({ categories }: { categories: Opt[] }) {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: "/api/food", success: "Food item added", onSuccess: () => modal?.close() });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ canonicalName: fd.get("canonicalName"), foodCategoryId: num(fd.get("foodCategoryId")), description: str(fd.get("description")), baseUnit: fd.get("baseUnit"), avgCostPerUnit: num(fd.get("avgCostPerUnit")), isEdibleAsIs: fd.get("isEdibleAsIs") === "on" }); }}>
      <FormError message={error} />
      <Field label="Canonical name" name="canonicalName" error={fields.canonicalName} hint="The standard name that messy submissions will be matched to."><Input name="canonicalName" required /></Field>
      <FormGrid>
        <Field label="Category" name="foodCategoryId" error={fields.foodCategoryId}><Select name="foodCategoryId" required defaultValue=""><option value="">Select…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <Field label="Unit" name="baseUnit" error={fields.baseUnit}><Select name="baseUnit" defaultValue="kg"><option value="kg">kg</option><option value="litre">litre</option><option value="unit">unit</option></Select></Field>
      </FormGrid>
      <Field label="Average cost per unit (₹)" name="avgCostPerUnit" error={fields.avgCostPerUnit}><Input name="avgCostPerUnit" type="number" step="0.01" min={0} required className="max-w-48" /></Field>
      <Field label="Description (optional)" name="description" error={fields.description}><Textarea name="description" className="min-h-16" /></Field>
      <Checkbox name="isEdibleAsIs" label="Edible as is" defaultChecked />
      <FormActions pending={pending} submitLabel="Add food item" />
    </form>
  );
}

export function ZoneForm({ parents }: { parents: Opt[] }) {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: "/api/zones", success: "Zone created", onSuccess: () => modal?.close() });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ zoneName: fd.get("zoneName"), parentZoneId: num(fd.get("parentZoneId")), pincode: str(fd.get("pincode")) }); }}>
      <FormError message={error} />
      <Field label="Zone name" name="zoneName" error={fields.zoneName}><Input name="zoneName" required /></Field>
      <FormGrid>
        <Field label="Parent zone" name="parentZoneId" error={fields.parentZoneId}><Select name="parentZoneId" required defaultValue=""><option value="">Select…</option>{parents.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</Select></Field>
        <Field label="Pincode (optional)" name="pincode" error={fields.pincode}><Input name="pincode" inputMode="numeric" maxLength={6} /></Field>
      </FormGrid>
      <FormActions pending={pending} submitLabel="Create zone" />
    </form>
  );
}

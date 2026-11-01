"use client";

import { useState } from "react";
import { useSubmit, num, str } from "@/lib/client-api";
import { Checkbox, Field, FormError, FormGrid, Input, Select, Textarea } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";
import { FoodPicker } from "@/components/ui/food-picker";
import { useModal } from "@/components/ui/modal";

interface Opt { id: number; label: string }
export interface LotOpt { id: number; label: string }

const STAGES = [
  ["PRE_CONSUMER_PREP", "Preparation (peels, trimmings)"], ["PRE_CONSUMER_SPOILAGE", "Spoilage in storage"], ["PRE_CONSUMER_EXPIRY", "Expired before use"],
  ["POST_CONSUMER_PLATE", "Left on plates"], ["POST_CONSUMER_SERVICE", "Leftover after service"],
] as const;

export function WasteForm({ reasons, routes, lots, today }: { reasons: Opt[]; routes: Opt[]; lots: LotOpt[]; today: string }) {
  const modal = useModal();
  const [lotId, setLotId] = useState("");
  const { submit, pending, error, fields } = useSubmit({ url: "/api/waste", success: "Waste recorded", onSuccess: () => modal?.close() });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void submit({
          foodId: num(fd.get("foodId")), lotId: num(fd.get("lotId")), reasonId: num(fd.get("reasonId")), routeId: num(fd.get("routeId")), stage: fd.get("stage"),
          quantityKg: num(fd.get("quantityKg")), wasEdible: fd.get("wasEdible") === "on", occurredOn: fd.get("occurredOn"), notes: str(fd.get("notes")),
        });
      }}
      className="space-y-4"
    >
      <FormError message={error} />
      <FormGrid>
        <Field label="Food item" name="foodId" error={fields.foodId} hint={lotId ? "Taken from the selected stock lot" : "Optional - leave blank for mixed waste"}>
          {lotId ? <Input name="foodId" value="" readOnly placeholder="From the stock lot" disabled /> : <FoodPicker name="foodId" />}
        </Field>
        <Field label="Take from stock lot" name="lotId" error={fields.lotId} hint="Deducts the quantity from inventory">
          <Select name="lotId" value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">Not from inventory</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Reason" name="reasonId" error={fields.reasonId}><Select name="reasonId" required defaultValue=""><option value="">Select…</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <Field label="Stage" name="stage" error={fields.stage}><Select name="stage" required defaultValue=""><option value="">Select…</option>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="Quantity (kg)" name="quantityKg" error={fields.quantityKg}><Input name="quantityKg" type="number" step="0.001" min="0.001" required /></Field>
        <Field label="Disposal route" name="routeId" error={fields.routeId}><Select name="routeId" required defaultValue=""><option value="">Select…</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <Field label="Date" name="occurredOn" error={fields.occurredOn}><Input name="occurredOn" type="date" max={today} defaultValue={today} required /></Field>
      </FormGrid>
      <Field label="Notes (optional)" name="notes" error={fields.notes}><Textarea name="notes" className="min-h-16" placeholder="What happened? e.g. fridge fault overnight" /></Field>
      <Checkbox name="wasEdible" label="The food was still edible" defaultChecked />
      <FormActions pending={pending} submitLabel="Record waste" />
    </form>
  );
}

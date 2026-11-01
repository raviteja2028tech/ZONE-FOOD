"use client";

import { useRouter } from "next/navigation";
import { useSubmit, num } from "@/lib/client-api";
import { Checkbox, Field, FormError, FormGrid, Input, Select } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";
import { useModal } from "@/components/ui/modal";

export function OpenSessionForm({ today }: { today: string }) {
  const modal = useModal();
  const router = useRouter();
  const { submit, pending, error, fields } = useSubmit<{ sessionId: number }>({ url: "/api/sessions", success: "Session opened", onSuccess: (d) => { modal?.close(); router.push(`/service/${d.sessionId}`); } });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ serviceDate: fd.get("serviceDate"), slot: fd.get("slot"), expectedHeadcount: num(fd.get("expectedHeadcount")) }); }}>
      <FormError message={error} />
      <FormGrid cols={3}>
        <Field label="Date" name="serviceDate" error={fields.serviceDate}><Input name="serviceDate" type="date" max={today} defaultValue={today} required /></Field>
        <Field label="Meal" name="slot" error={fields.slot}><Select name="slot" defaultValue="LUNCH"><option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="SNACKS">Snacks</option><option value="DINNER">Dinner</option><option value="ALL_DAY">All day</option></Select></Field>
        <Field label="Expected headcount" name="expectedHeadcount" error={fields.expectedHeadcount}><Input name="expectedHeadcount" type="number" min={0} required /></Field>
      </FormGrid>
      <FormActions pending={pending} submitLabel="Open session" pendingLabel="Opening…" />
    </form>
  );
}

export function BatchForm({ sessionId, dishes }: { sessionId: number; dishes: { dish_id: number; dish_name: string }[] }) {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: `/api/sessions/${sessionId}/batches`, success: "Batch added", onSuccess: () => modal?.close() });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ dishId: num(fd.get("dishId")), preparedQtyKg: num(fd.get("preparedQtyKg")), preparedPortions: num(fd.get("preparedPortions")), prepCost: num(fd.get("prepCost")) }); }}>
      <FormError message={error} />
      <Field label="Dish" name="dishId" error={fields.dishId} hint={dishes.length ? undefined : "No dishes yet - add one with “New dish” first."}>
        <Select name="dishId" required defaultValue=""><option value="">Select a dish…</option>{dishes.map((d) => <option key={d.dish_id} value={d.dish_id}>{d.dish_name}</option>)}</Select>
      </Field>
      <FormGrid cols={3}>
        <Field label="Prepared (kg)" name="preparedQtyKg" error={fields.preparedQtyKg}><Input name="preparedQtyKg" type="number" step="0.001" min="0.001" required /></Field>
        <Field label="Portions" name="preparedPortions" error={fields.preparedPortions}><Input name="preparedPortions" type="number" min={1} required /></Field>
        <Field label="Cost (₹, optional)" name="prepCost" error={fields.prepCost}><Input name="prepCost" type="number" step="0.01" min={0} /></Field>
      </FormGrid>
      <FormActions pending={pending} submitLabel="Add batch" />
    </form>
  );
}

export function DishForm() {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: "/api/dishes", success: "Dish added", onSuccess: () => modal?.close() });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ dishName: fd.get("dishName"), standardPortionG: num(fd.get("standardPortionG")), isVegetarian: fd.get("isVegetarian") === "on" }); }}>
      <FormError message={error} />
      <FormGrid>
        <Field label="Dish name" name="dishName" error={fields.dishName}><Input name="dishName" required /></Field>
        <Field label="Standard portion (g)" name="standardPortionG" error={fields.standardPortionG}><Input name="standardPortionG" type="number" step="0.1" min={1} required /></Field>
      </FormGrid>
      <Checkbox name="isVegetarian" label="Vegetarian" defaultChecked />
      <FormActions pending={pending} submitLabel="Add dish" />
    </form>
  );
}

export function CloseSessionForm({ sessionId, batches }: { sessionId: number; batches: { batch_id: number; dish_name: string; prepared_qty_kg: number }[] }) {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: `/api/sessions/${sessionId}/close`, success: "Session closed - waste events and surplus listings were created automatically", onSuccess: () => modal?.close() });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void submit({
          actualHeadcount: num(fd.get("actualHeadcount")),
          records: batches.map((b) => ({ batchId: b.batch_id, servedQtyKg: num(fd.get(`served_${b.batch_id}`)) ?? 0, leftoverQtyKg: num(fd.get(`leftover_${b.batch_id}`)) ?? 0, plateWasteKg: num(fd.get(`plate_${b.batch_id}`)) ?? 0 })),
        });
      }}
    >
      <FormError message={error} />
      <Field label="Actual headcount" name="actualHeadcount" error={fields.actualHeadcount}><Input name="actualHeadcount" type="number" min={0} required className="max-w-48" /></Field>
      <div className="space-y-3">
        <p className="text-sm font-semibold">Consumption per batch</p>
        <p className="text-xs text-ink-muted">Served + leftover cannot exceed what was prepared, and plate waste cannot exceed what was served. The database enforces this; a violation cancels the whole close. Plate waste is recorded automatically, and edible leftovers of 2 kg or more are listed as surplus for you.</p>
        {batches.map((b) => (
          <div key={b.batch_id} className="rounded-lg border border-line bg-surface-2/50 p-3">
            <p className="mb-2 text-sm font-medium">{b.dish_name} <span className="text-xs font-normal text-ink-muted">· prepared {b.prepared_qty_kg} kg</span></p>
            <FormGrid cols={3}>
              <Field label="Served (kg)" name={`served_${b.batch_id}`}><Input name={`served_${b.batch_id}`} type="number" step="0.001" min={0} required /></Field>
              <Field label="Leftover (kg)" name={`leftover_${b.batch_id}`}><Input name={`leftover_${b.batch_id}`} type="number" step="0.001" min={0} required /></Field>
              <Field label="Plate waste (kg)" name={`plate_${b.batch_id}`}><Input name={`plate_${b.batch_id}`} type="number" step="0.001" min={0} defaultValue={0} /></Field>
            </FormGrid>
          </div>
        ))}
        {fields.records && <p role="alert" className="text-xs font-medium text-bad">{fields.records}</p>}
      </div>
      <FormActions pending={pending} submitLabel="Close session" pendingLabel="Closing…" />
    </form>
  );
}

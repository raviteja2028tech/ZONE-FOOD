"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSubmit, num, str } from "@/lib/client-api";
import { Checkbox, Field, FormError, FormGrid, Input, Select } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal";

/** Rows the user can add/remove; each row has a stable id so inputs keep their values. */
function useRows(initial = 1) {
  const [rows, setRows] = useState<number[]>(Array.from({ length: initial }, (_, i) => i + 1));
  const [next, setNext] = useState(initial + 1);
  return { rows, add: () => { setRows((r) => [...r, next]); setNext((n) => n + 1); }, remove: (id: number) => setRows((r) => r.filter((x) => x !== id)) };
}

function RowShell({ children, onRemove, disabled }: { children: React.ReactNode; onRemove: () => void; disabled: boolean }) {
  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface-2/50 p-3 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-3 sm:grid-cols-4">{children}</div>
      <div className="flex items-end"><button type="button" aria-label="Remove row" disabled={disabled} onClick={onRemove} className="grid size-10 place-items-center rounded-md text-ink-muted hover:bg-bad-soft hover:text-bad disabled:opacity-30"><Trash2 aria-hidden className="size-4" /></button></div>
    </div>
  );
}

const SLOTS = [["", "Not specified"], ["BREAKFAST", "Breakfast"], ["LUNCH", "Lunch"], ["SNACKS", "Snacks"], ["DINNER", "Dinner"]] as const;

/**
 * The daily field log. The shape of the form - and therefore of the MongoDB document - depends on the kind of
 * establishment: that variability is exactly why this data lives in a document store.
 */
export function SubmissionForm({ kind, today }: { kind: string; today: string }) {
  const modal = useModal();
  const dishes = useRows(2);
  const counters = useRows(2);
  const skus = useRows(2);
  const wards = useRows(2);
  const { submit, pending, error, fields } = useSubmit<{ id: string }>({ url: "/api/submissions", success: "Field log saved to MongoDB (pending sync)", onSuccess: () => modal?.close() });

  function build(fd: FormData): Record<string, unknown> {
    switch (kind) {
      case "COMMERCIAL":
        return {
          slot: str(fd.get("slot")), covers_served: num(fd.get("covers")),
          dish_waste: dishes.rows.map((i) => ({ dish_name: fd.get(`dish_${i}`), portions_prepared: num(fd.get(`prep_${i}`)), portions_sold: num(fd.get(`sold_${i}`)), returned_plates: num(fd.get(`ret_${i}`)) ?? 0, avg_plate_leftover_g: num(fd.get(`g_${i}`)) ?? 0 })),
          ...(num(fd.get("buffet")) ? { buffet_counter_leftovers_kg: num(fd.get("buffet")) } : {}),
        };
      case "RESIDENTIAL":
        return { bins: { ...(num(fd.get("peels")) !== undefined && { vegetable_peels_kg: num(fd.get("peels")) }), ...(num(fd.get("cooked")) !== undefined && { cooked_leftovers_kg: num(fd.get("cooked")) }), ...(num(fd.get("packaged")) !== undefined && { expired_packaged_kg: num(fd.get("packaged")) }) }, segregated: fd.get("segregated") === "on", ...(str(fd.get("free")) && { free_text: str(fd.get("free")) }) };
      case "EDUCATIONAL":
        return { meal_slot: str(fd.get("slot")), headcount: { present: num(fd.get("present")) ?? 0, guests: num(fd.get("guests")) ?? 0 }, counters: counters.rows.map((i) => ({ counter: fd.get(`counter_${i}`), plates_served: num(fd.get(`plates_${i}`)) ?? 0, leftover_kg: num(fd.get(`left_${i}`)) ?? 0 })), ...(fd.get("exam") === "on" && { exam_day: true }) };
      case "RETAIL_FOOD":
        return { skus: skus.rows.map((i) => ({ sku_name: fd.get(`sku_${i}`), markdown_pct: num(fd.get(`md_${i}`)) ?? 0, units_expiring: num(fd.get(`exp_${i}`)) ?? 0, units_discarded: num(fd.get(`disc_${i}`)) ?? 0 })), ...(num(fd.get("chiller")) !== undefined && { chiller_temp_c: num(fd.get("chiller")) }) };
      case "ORGANIZATIONAL":
        return { coupons_redeemed: num(fd.get("coupons")), tray_returns_kg: num(fd.get("tray")) ?? 0, ...(str(fd.get("note")) && { feedback_note: str(fd.get("note")) }) };
      case "HEALTHCARE":
        return { ward_meals: wards.rows.map((i) => ({ ward: fd.get(`ward_${i}`), meals_sent: num(fd.get(`sent_${i}`)) ?? 0, meals_returned: num(fd.get(`back_${i}`)) ?? 0 })) };
      default:
        return { event_name: fd.get("event"), buffet_leftover_kg: num(fd.get("buffet")) ?? 0, guests: num(fd.get("guests")) };
    }
  }

  const err = (k: string) => Object.entries(fields).find(([key]) => key.includes(k))?.[1];
  return (
    <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ serviceDate: fd.get("serviceDate"), payload: build(fd) }); }}>
      <FormError message={error} />
      <Field label="Service date" name="serviceDate" error={fields.serviceDate}><Input name="serviceDate" type="date" max={today} defaultValue={today} required className="max-w-48" /></Field>

      {kind === "COMMERCIAL" && (
        <>
          <FormGrid><Field label="Meal" name="slot"><Select name="slot" defaultValue="LUNCH">{SLOTS.slice(1).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field><Field label="Covers served" name="covers"><Input name="covers" type="number" min={0} /></Field></FormGrid>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Dishes with plate waste</h3><Button variant="secondary" className="h-8 px-2.5" onClick={dishes.add}><Plus aria-hidden className="size-4" />Add dish</Button></div>
            {err("dish_waste") && <p role="alert" className="text-xs font-medium text-bad">{err("dish_waste")}</p>}
            {dishes.rows.map((i) => (
              <RowShell key={i} onRemove={() => dishes.remove(i)} disabled={dishes.rows.length === 1}>
                <Field label="Dish name (any spelling)" name={`dish_${i}`}><Input name={`dish_${i}`} placeholder="e.g. Panner Butter Masala" required /></Field>
                <Field label="Prepared" name={`prep_${i}`}><Input name={`prep_${i}`} type="number" min={0} /></Field>
                <Field label="Plates returned" name={`ret_${i}`}><Input name={`ret_${i}`} type="number" min={0} required /></Field>
                <Field label="Avg leftover (g)" name={`g_${i}`}><Input name={`g_${i}`} type="number" min={0} required /></Field>
              </RowShell>
            ))}
          </div>
          <Field label="Buffet counter leftovers (kg, optional)" name="buffet"><Input name="buffet" type="number" step="0.1" min={0} className="max-w-48" /></Field>
        </>
      )}

      {kind === "RESIDENTIAL" && (
        <>
          <FormGrid cols={3}>
            <Field label="Vegetable peels (kg)" name="peels"><Input name="peels" type="number" step="0.1" min={0} /></Field>
            <Field label="Cooked leftovers (kg)" name="cooked"><Input name="cooked" type="number" step="0.1" min={0} /></Field>
            <Field label="Expired packaged (kg)" name="packaged"><Input name="packaged" type="number" step="0.1" min={0} /></Field>
          </FormGrid>
          <Checkbox name="segregated" label="Waste was segregated (wet/dry)" />
          <Field label="Note (optional)" name="free"><Input name="free" placeholder="e.g. festival leftovers" /></Field>
        </>
      )}

      {kind === "EDUCATIONAL" && (
        <>
          <FormGrid cols={3}><Field label="Meal" name="slot"><Select name="slot" defaultValue="LUNCH">{SLOTS.slice(1).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field><Field label="Present" name="present"><Input name="present" type="number" min={0} required /></Field><Field label="Guests" name="guests"><Input name="guests" type="number" min={0} defaultValue={0} /></Field></FormGrid>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Serving counters</h3><Button variant="secondary" className="h-8 px-2.5" onClick={counters.add}><Plus aria-hidden className="size-4" />Add counter</Button></div>
            {counters.rows.map((i) => (
              <RowShell key={i} onRemove={() => counters.remove(i)} disabled={counters.rows.length === 1}>
                <Field label="Counter" name={`counter_${i}`}><Input name={`counter_${i}`} defaultValue={`Counter ${i}`} required /></Field>
                <Field label="Plates served" name={`plates_${i}`}><Input name={`plates_${i}`} type="number" min={0} required /></Field>
                <Field label="Leftover (kg)" name={`left_${i}`}><Input name={`left_${i}`} type="number" step="0.1" min={0} required /></Field>
              </RowShell>
            ))}
          </div>
          <Checkbox name="exam" label="Exam day" />
        </>
      )}

      {kind === "RETAIL_FOOD" && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Products</h3><Button variant="secondary" className="h-8 px-2.5" onClick={skus.add}><Plus aria-hidden className="size-4" />Add product</Button></div>
            {skus.rows.map((i) => (
              <RowShell key={i} onRemove={() => skus.remove(i)} disabled={skus.rows.length === 1}>
                <Field label="Product" name={`sku_${i}`}><Input name={`sku_${i}`} required /></Field>
                <Field label="Markdown %" name={`md_${i}`}><Input name={`md_${i}`} type="number" min={0} max={100} defaultValue={0} /></Field>
                <Field label="Expiring" name={`exp_${i}`}><Input name={`exp_${i}`} type="number" min={0} defaultValue={0} /></Field>
                <Field label="Discarded (units)" name={`disc_${i}`}><Input name={`disc_${i}`} type="number" min={0} required /></Field>
              </RowShell>
            ))}
          </div>
          <Field label="Chiller temperature °C (optional)" name="chiller"><Input name="chiller" type="number" step="0.1" className="max-w-48" /></Field>
        </>
      )}

      {kind === "ORGANIZATIONAL" && (
        <FormGrid cols={3}><Field label="Coupons redeemed" name="coupons"><Input name="coupons" type="number" min={0} /></Field><Field label="Tray returns (kg)" name="tray" error={err("tray_returns_kg")}><Input name="tray" type="number" step="0.1" min={0} required /></Field><Field label="Feedback (optional)" name="note"><Input name="note" /></Field></FormGrid>
      )}

      {kind === "HEALTHCARE" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Wards</h3><Button variant="secondary" className="h-8 px-2.5" onClick={wards.add}><Plus aria-hidden className="size-4" />Add ward</Button></div>
          {wards.rows.map((i) => (
            <RowShell key={i} onRemove={() => wards.remove(i)} disabled={wards.rows.length === 1}>
              <Field label="Ward" name={`ward_${i}`}><Input name={`ward_${i}`} required /></Field>
              <Field label="Meals sent" name={`sent_${i}`}><Input name={`sent_${i}`} type="number" min={0} required /></Field>
              <Field label="Meals returned" name={`back_${i}`}><Input name={`back_${i}`} type="number" min={0} required /></Field>
            </RowShell>
          ))}
        </div>
      )}

      {kind === "RECREATIONAL" && (
        <FormGrid cols={3}><Field label="Event" name="event"><Input name="event" required /></Field><Field label="Buffet leftovers (kg)" name="buffet"><Input name="buffet" type="number" step="0.1" min={0} required /></Field><Field label="Guests" name="guests"><Input name="guests" type="number" min={0} /></Field></FormGrid>
      )}
      <FormActions pending={pending} submitLabel="Save field log" />
    </form>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSubmit, num, str, toIso } from "@/lib/client-api";
import { Field, FormError, FormGrid, Input, Select } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";
import { FoodPicker } from "@/components/ui/food-picker";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal";

const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** A delivery with a dynamic list of lines. Server validates every line and writes all-or-nothing. */
export function ProcurementForm({ suppliers }: { suppliers: { id: number; label: string }[] }) {
  const modal = useModal();
  const [lines, setLines] = useState<number[]>([1]);
  const [next, setNext] = useState(2);
  const { submit, pending, error, fields } = useSubmit({ url: "/api/procurement", success: "Delivery recorded - stock lots created", onSuccess: () => modal?.close() });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void submit({
          supplierId: num(fd.get("supplierId")), invoiceNo: str(fd.get("invoiceNo")), receivedAt: toIso(fd.get("receivedAt")),
          lines: lines.map((i) => ({ foodId: num(fd.get(`foodId_${i}`)), quantity: num(fd.get(`quantity_${i}`)), unitCost: num(fd.get(`unitCost_${i}`)), expiryDate: str(fd.get(`expiry_${i}`)) })),
        });
      }}
    >
      <FormError message={error} />
      <FormGrid cols={3}>
        <Field label="Supplier" name="supplierId" error={fields.supplierId}><Select name="supplierId" defaultValue=""><option value="">No supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
        <Field label="Invoice no." name="invoiceNo" error={fields.invoiceNo}><Input name="invoiceNo" maxLength={50} /></Field>
        <Field label="Received" name="receivedAt" error={fields.receivedAt}><Input name="receivedAt" type="datetime-local" defaultValue={localNow()} max={localNow()} required /></Field>
      </FormGrid>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Items received</h3>
          <Button variant="secondary" className="h-8 px-2.5" onClick={() => { setLines((l) => [...l, next]); setNext((n) => n + 1); }} disabled={lines.length >= 50}><Plus aria-hidden className="size-4" />Add line</Button>
        </div>
        {fields.lines && <p role="alert" className="text-xs font-medium text-bad">{fields.lines}</p>}
        {lines.map((i, idx) => (
          <div key={i} className="grid gap-3 rounded-lg border border-line bg-surface-2/50 p-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
            <Field label={idx === 0 ? "Food item" : "Food item"} name={`foodId_${i}-search`}><FoodPicker name={`foodId_${i}`} /></Field>
            <Field label="Quantity" name={`quantity_${i}`}><Input name={`quantity_${i}`} type="number" step="0.001" min="0.001" required /></Field>
            <Field label="Unit cost (₹)" name={`unitCost_${i}`}><Input name={`unitCost_${i}`} type="number" step="0.01" min="0" required /></Field>
            <Field label="Expiry (optional)" name={`expiry_${i}`}><Input name={`expiry_${i}`} type="date" /></Field>
            <div className="flex items-end">
              <button type="button" aria-label={`Remove line ${idx + 1}`} disabled={lines.length === 1} onClick={() => setLines((l) => l.filter((x) => x !== i))} className="grid size-10 place-items-center rounded-md text-ink-muted hover:bg-bad-soft hover:text-bad disabled:opacity-30"><Trash2 aria-hidden className="size-4" /></button>
            </div>
          </div>
        ))}
        <p className="text-xs text-ink-muted">Without an expiry date, the food category&apos;s default shelf life is used. One inventory lot is created per line.</p>
      </div>
      <FormActions pending={pending} submitLabel="Record delivery" />
    </form>
  );
}

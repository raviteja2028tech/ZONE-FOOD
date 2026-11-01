"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSubmit } from "@/lib/client-api";
import { Field, FormError, FormGrid, Input, Select, Textarea } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal";

interface Item { item: string; status: "PASS" | "FAIL" | "NA"; note: string; reading: string }
interface Section { name: string; items: Item[] }
const blankItem = (): Item => ({ item: "", status: "PASS", note: "", reading: "" });

/** Free-structure checklist: any number of sections, each with any number of items (document model). */
export function InspectionForm({ establishments }: { establishments?: { id: number; label: string }[] }) {
  const modal = useModal();
  const [sections, setSections] = useState<Section[]>([{ name: "Kitchen hygiene", items: [blankItem()] }]);
  const { submit, pending, error, fields } = useSubmit({ url: "/api/inspections", success: "Inspection report saved", onSuccess: () => modal?.close() });

  const patchSection = (i: number, patch: Partial<Section>) => setSections((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const patchItem = (i: number, k: number, patch: Partial<Item>) => setSections((s) => s.map((x, j) => (j === i ? { ...x, items: x.items.map((it, m) => (m === k ? { ...it, ...patch } : it)) } : x)));

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void submit({
          establishmentId: fd.get("establishmentId") ? Number(fd.get("establishmentId")) : undefined,
          inspectorNotes: String(fd.get("inspectorNotes") ?? "").trim() || undefined,
          sections: sections.map((s) => ({ name: s.name, items: s.items.map((it) => ({ item: it.item, status: it.status, ...(it.note.trim() && { note: it.note.trim() }), ...(it.reading.trim() && { reading_c: Number(it.reading) }) })) })),
        });
      }}
    >
      <FormError message={error} />
      {establishments && <Field label="Establishment" name="establishmentId" error={fields.establishmentId}><Select name="establishmentId" required defaultValue=""><option value="">Select…</option>{establishments.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></Field>}
      {sections.map((s, i) => (
        <fieldset key={i} className="space-y-3 rounded-lg border border-line p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1"><Field label={`Section ${i + 1}`} name={`section_${i}`}><Input name={`section_${i}`} value={s.name} onChange={(e) => patchSection(i, { name: e.target.value })} required /></Field></div>
            <button type="button" aria-label="Remove section" disabled={sections.length === 1} onClick={() => setSections((x) => x.filter((_, j) => j !== i))} className="mb-0.5 grid size-10 place-items-center rounded-md text-ink-muted hover:bg-bad-soft hover:text-bad disabled:opacity-30"><Trash2 aria-hidden className="size-4" /></button>
          </div>
          {s.items.map((it, k) => (
            <div key={k} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <Input name={`item_${i}_${k}`} aria-label="Checklist item" placeholder="Checklist item" value={it.item} onChange={(e) => patchItem(i, k, { item: e.target.value })} required />
              <Select name={`status_${i}_${k}`} aria-label="Result" value={it.status} onChange={(e) => patchItem(i, k, { status: e.target.value as Item["status"] })}><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="NA">N/A</option></Select>
              <Input name={`reading_${i}_${k}`} aria-label="Reading °C" placeholder="°C (optional)" type="number" step="0.1" value={it.reading} onChange={(e) => patchItem(i, k, { reading: e.target.value })} />
              <Input name={`note_${i}_${k}`} aria-label="Note" placeholder="Note (optional)" value={it.note} onChange={(e) => patchItem(i, k, { note: e.target.value })} />
              <button type="button" aria-label="Remove item" disabled={s.items.length === 1} onClick={() => patchSection(i, { items: s.items.filter((_, m) => m !== k) })} className="grid size-10 place-items-center rounded-md text-ink-muted hover:text-bad disabled:opacity-30"><Trash2 aria-hidden className="size-4" /></button>
            </div>
          ))}
          <Button variant="ghost" className="h-8 px-2.5" onClick={() => patchSection(i, { items: [...s.items, blankItem()] })}><Plus aria-hidden className="size-4" />Add item</Button>
        </fieldset>
      ))}
      {Object.entries(fields).filter(([k]) => k.startsWith("sections")).map(([k, v]) => <p key={k} role="alert" className="text-xs font-medium text-bad">{v}</p>)}
      <Button variant="secondary" onClick={() => setSections((s) => [...s, { name: "", items: [blankItem()] }])} disabled={sections.length >= 12}><Plus aria-hidden className="size-4" />Add section</Button>
      <FormGrid cols={1}><Field label="Inspector notes (optional)" name="inspectorNotes"><Textarea name="inspectorNotes" className="min-h-16" /></Field></FormGrid>
      <FormActions pending={pending} submitLabel="Save report" />
    </form>
  );
}

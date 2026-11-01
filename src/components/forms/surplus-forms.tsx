"use client";

import { useEffect, useState } from "react";
import { callApi, useSubmit, num, str, toIso } from "@/lib/client-api";
import { Checkbox, Field, FormError, FormGrid, Input, Textarea } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";
import { FoodPicker } from "@/components/ui/food-picker";
import { useModal } from "@/components/ui/modal";
import { ScoreBar } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/format";

const local = (offsetHours = 0) => new Date(Date.now() + offsetHours * 3_600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function ListingForm() {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit<{ listingId: number; embedded: boolean }>({
    url: "/api/surplus",
    success: "Listing published",
    onSuccess: () => modal?.close(),
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void submit({
          description: fd.get("description"), foodId: num(fd.get("foodId")), offeredQtyKg: num(fd.get("offeredQtyKg")),
          isCooked: fd.get("isCooked") === "on", isVegetarian: fd.get("isVegetarian") === "on",
          availableFrom: toIso(fd.get("availableFrom")), expiresAt: toIso(fd.get("expiresAt")),
        });
      }}
    >
      <FormError message={error} />
      <Field label="Describe the food" name="description" error={fields.description} hint="Be specific - dish, dietary notes, packaging. This text is embedded and matched against recipients' needs.">
        <Textarea name="description" required placeholder="12 kg cooked vegetable pulao with raita, vegetarian, no onion or garlic, packed in sealed trays" />
      </Field>
      <FormGrid>
        <Field label="Food item (optional)" name="foodId" error={fields.foodId}><FoodPicker name="foodId" /></Field>
        <Field label="Quantity (kg)" name="offeredQtyKg" error={fields.offeredQtyKg}><Input name="offeredQtyKg" type="number" step="0.1" min="0.1" required /></Field>
      </FormGrid>
      <FormGrid>
        <Field label="Available from" name="availableFrom" error={fields.availableFrom}><Input name="availableFrom" type="datetime-local" defaultValue={local(0)} required /></Field>
        <Field label="Pick up before" name="expiresAt" error={fields.expiresAt}><Input name="expiresAt" type="datetime-local" defaultValue={local(5)} min={local(0)} required /></Field>
      </FormGrid>
      <div className="flex flex-wrap gap-x-6 gap-y-2"><Checkbox name="isCooked" label="Cooked food" defaultChecked /><Checkbox name="isVegetarian" label="Vegetarian" defaultChecked /></div>
      <FormActions pending={pending} submitLabel="Publish listing" pendingLabel="Publishing…" />
    </form>
  );
}

interface Match {
  recipient_id: number;
  org_name: string;
  org_type: string;
  zone_name: string;
  daily_capacity_kg: number;
  need_profile: string;
  semantic: number | null;
  capacity: number;
  proximity: number;
  distance_km: number | null;
  score: number;
}

/** Ranked feasible recipients for a listing, with the three score components shown (visible proof of the vector layer). */
export function MatchPanel({ listingId }: { listingId: number }) {
  const [rows, setRows] = useState<Match[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void callApi<Match[]>(`/api/surplus/${listingId}/matches`, "GET").then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setErr(r.error.message);
    });
    return () => { live = false; };
  }, [listingId]);

  if (err) return <FormError message={err} />;
  if (!rows) return <p className="py-8 text-center text-sm text-ink-muted" role="status">Ranking recipients…</p>;
  if (!rows.length) return <p className="py-8 text-center text-sm text-ink-muted">No recipient currently passes the hard filters (accepts cooked food, enough capacity, pickup window overlaps, same locality).</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">Hard filters first, then <strong>0.60 × semantic similarity + 0.25 × capacity fit + 0.15 × proximity</strong>.</p>
      <ol className="space-y-2.5">
        {rows.map((m, i) => (
          <li key={m.recipient_id} className="rounded-lg border border-line bg-surface p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink"><span className="tabular mr-2 text-ink-muted">{i + 1}.</span>{m.org_name}</p>
                <p className="text-xs text-ink-muted">{humanize(m.org_type)} · {m.zone_name} · capacity {m.daily_capacity_kg} kg/day</p>
              </div>
              <Badge tone={i === 0 ? "ok" : "neutral"}>{m.score.toFixed(2)}</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{m.need_profile}</p>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-ink-muted">Semantic</dt><dd><ScoreBar value={m.semantic} /></dd></div>
              <div><dt className="text-ink-muted">Capacity fit</dt><dd><ScoreBar value={m.capacity} /></dd></div>
              <div><dt className="text-ink-muted">Proximity</dt><dd><ScoreBar value={m.proximity} />{m.distance_km !== null && <span className="ml-1 text-ink-muted">{m.distance_km} km</span>}</dd></div>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ClaimForm({ listingId, maxKg, description }: { listingId: number; maxKg: number; description: string }) {
  const modal = useModal();
  const { submit, pending, error, fields } = useSubmit({ url: "/api/claims", success: "Claim submitted - waiting for the establishment to approve", onSuccess: () => modal?.close() });
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void submit({ listingId, claimedQtyKg: num(fd.get("claimedQtyKg")) }); }}>
      <FormError message={error} />
      <p className="rounded-md bg-surface-2 p-3 text-sm text-ink-muted">{description}</p>
      <Field label={`How much will you take? (up to ${maxKg} kg)`} name="claimedQtyKg" error={fields.claimedQtyKg || fields.listingId}>
        <Input name="claimedQtyKg" type="number" step="0.1" min="0.1" max={maxKg} defaultValue={maxKg} required className="max-w-48" />
      </Field>
      <p className="text-xs text-ink-muted">The establishment must approve your request before the quantity is reserved. Only one claim per listing per organisation.</p>
      <FormActions pending={pending} submitLabel="Submit claim" pendingLabel="Submitting…" />
    </form>
  );
}

export { str };

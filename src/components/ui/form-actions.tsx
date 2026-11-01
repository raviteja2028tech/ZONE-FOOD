"use client";

import { Loader2 } from "lucide-react";
import { Button } from "./button";
import { useModal } from "./modal";

/** Standard footer: Cancel (closes the surrounding modal, if any) + a primary submit with a pending state. */
export function FormActions({ pending, submitLabel, pendingLabel = "Saving…" }: { pending: boolean; submitLabel: string; pendingLabel?: string }) {
  const modal = useModal();
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
      {modal && (
        <Button variant="ghost" onClick={modal.close} disabled={pending}>
          Cancel
        </Button>
      )}
      <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
        {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}

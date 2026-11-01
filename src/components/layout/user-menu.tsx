"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "@/lib/client-api";

export interface Identity {
  name: string;
  role: string;
  scope: string | null;
}

export function UserMenu({ identity }: { identity: Identity }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const initials = identity.name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  async function logout() {
    setBusy(true);
    await callApi("/api/auth/logout", "POST");
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface-2 p-2.5">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-on">{initials}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{identity.name}</p>
        <p className="truncate text-xs text-ink-muted">{identity.role}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        aria-label="Sign out"
        title="Sign out"
        className="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-bad disabled:opacity-50"
      >
        <LogOut aria-hidden className="size-4" />
      </button>
    </div>
  );
}

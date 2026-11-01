"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-config";
import type { NavGroup } from "./nav-links";

const ICONS: Record<string, LucideIcon> = Object.fromEntries(NAV_ITEMS.map((i) => [i.label, i.icon]));

/**
 * Ctrl/Cmd + K "jump to" palette. Lists exactly the destinations the signed-in role may open (the same server-built
 * navigation), filtered as you type; arrow keys move, Enter opens, Escape closes.
 */
export function CommandPalette({ groups }: { groups: NavGroup[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))), [groups]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(t)) : items;
  }, [items, q]);

  const open = () => {
    setQ("");
    setActive(0);
    ref.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const go = (href: string) => {
    ref.current?.close();
    router.push(href);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (ref.current?.open) ref.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button type="button" onClick={open} aria-label="Search and jump to a page (Ctrl+K)"
        className="hidden h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink md:flex lg:w-64">
        <Search aria-hidden className="size-4" /><span className="flex-1 text-left">Jump to…</span>
        <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">Ctrl K</kbd>
      </button>
      <button type="button" onClick={open} aria-label="Search and jump to a page" className="grid size-9 place-items-center rounded-md border border-line bg-surface text-ink-muted md:hidden"><Search aria-hidden className="size-[18px]" /></button>

      <dialog ref={ref} aria-label="Jump to a page" onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
        className="zf-modal m-auto mt-[12vh] w-[min(92vw,34rem)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-left text-ink shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden className="size-4 text-ink-muted" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} role="combobox" aria-expanded aria-controls="palette-list" aria-autocomplete="list"
            placeholder="Type a page name…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]!.href); }
            }} />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">No page matches “{q}”.</li>}
          {results.map((r, i) => {
            const Icon = ICONS[r.label];
            return (
              <li key={r.href} role="option" aria-selected={i === active}>
                <button type="button" onClick={() => go(r.href)} onMouseMove={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm", i === active ? "bg-accent-soft text-accent-ink" : "text-ink")}>
                  {Icon && <Icon aria-hidden className="size-[18px] shrink-0" />}
                  <span className="flex-1">{r.label}</span>
                  <span className="text-xs text-ink-muted">{r.group}</span>
                  {i === active && <CornerDownLeft aria-hidden className="size-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      </dialog>
    </>
  );
}

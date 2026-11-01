"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { callApi } from "@/lib/client-api";

interface Food {
  food_id: number;
  canonical_name: string;
  category_name: string;
  base_unit: string;
}

/**
 * Typo-tolerant food search against /api/food (trigram + full-text). Selecting a result stores its id in a
 * hidden input named `name`, so it works inside plain forms and is validated server-side like any other id.
 */
export function FoodPicker({ name, defaultFood, placeholder = "Search food items…", onPick }: { name: string; defaultFood?: Food | null; placeholder?: string; onPick?: (f: Food | null) => void }) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(defaultFood ?? null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await callApi<Food[]>(`/api/food?q=${encodeURIComponent(q)}`, "GET");
      if (my === seq.current) {
        setResults(res.ok ? res.data : []);
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const choose = (f: Food | null) => {
    setPicked(f);
    setOpen(false);
    setQ("");
    onPick?.(f);
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={picked?.food_id ?? ""} />
      {picked ? (
        <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm">
          <span className="truncate font-medium">{picked.canonical_name}</span>
          <button type="button" onClick={() => choose(null)} aria-label="Clear food item" className="text-ink-muted hover:text-ink">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            id={name + "-search"}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            value={q}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          {open && (
            <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-surface p-1 shadow-pop">
              {loading && !results.length && <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>}
              {!loading && !results.length && <li className="px-3 py-2 text-sm text-ink-muted">No matching food items</li>}
              {results.map((f) => (
                <li key={f.food_id} role="option" aria-selected={false}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(f)} className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span className="truncate">{f.canonical_name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{f.category_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

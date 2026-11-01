"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-config";

// Resolved here (client side) because component functions cannot cross the server -> client boundary.
const ICONS: Record<string, LucideIcon> = Object.fromEntries(NAV_ITEMS.map((i) => [i.label, i.icon]));

export interface NavGroup {
  group: string;
  items: { label: string; href: string; icon: string }[];
}

/** Icons are passed by name so the (server-built) nav can cross the client boundary as plain data. */
export function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav aria-label="Primary" className="space-y-5">
      {groups.map((g) => (
        <div key={g.group}>
          {g.group !== "Overview" && <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.label];
              const isActive = active(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-accent-soft text-accent-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {isActive && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
                    {Icon && <Icon aria-hidden className="size-[18px] shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

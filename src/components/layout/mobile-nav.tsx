"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { NavLinks, type NavGroup } from "./nav-links";
import { UserMenu, type Identity } from "./user-menu";

/** Phone/tablet navigation drawer built on a native <dialog> (focus trap + Escape for free). */
export function MobileNav({ groups, identity }: { groups: NavGroup[]; identity: Identity }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => ref.current?.close(), [pathname]);

  return (
    <>
      <button type="button" aria-label="Open navigation" onClick={() => ref.current?.showModal()} className="grid size-9 place-items-center rounded-md border border-line bg-surface text-ink-muted hover:text-ink">
        <Menu aria-hidden className="size-5" />
      </button>
      <dialog
        ref={ref}
        aria-label="Navigation"
        className="zf-modal m-0 h-dvh text-left max-h-dvh w-[min(86vw,20rem)] border-r border-line bg-surface p-0 text-ink shadow-pop"
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold">Menu</span>
            <button type="button" aria-label="Close navigation" onClick={() => ref.current?.close()} className="grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface-2">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <NavLinks groups={groups} onNavigate={() => ref.current?.close()} />
          </div>
          <div className="border-t border-line p-3">
            <UserMenu identity={identity} />
          </div>
        </div>
      </dialog>
    </>
  );
}

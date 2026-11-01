import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { navFor } from "./nav-config";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/guard";

/**
 * Application frame: fixed sidebar on desktop, drawer + compact top bar on small screens. The navigation is built on
 * the server from the signed-in user's permissions.
 */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const groups = navFor(user).map((g) => ({ group: g.group, items: g.items.map((i) => ({ label: i.label, href: i.href, icon: i.label })) }));
  const identity = { name: user.fullName, role: ROLE_LABEL[user.role], scope: user.scopeName };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-3 pt-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks groups={groups} />
        </div>
        <div className="space-y-3 border-t border-line p-3">
          <p className="flex items-center gap-2 px-1 text-[11px] leading-snug text-ink-muted">
            <FlaskConical aria-hidden className="size-3.5 shrink-0 text-accent-ink" /> Synthetic demo data — not real establishments or NGOs.
          </p>
          <UserMenu identity={identity} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur lg:h-16 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileNav groups={groups} identity={identity} />
            <Brand />
          </div>
          <p className="hidden truncate text-sm text-ink-muted xl:block">
            {user.scopeName ?? "Zone-wide view"} <span aria-hidden>·</span> {ROLE_LABEL[user.role]}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette groups={groups} />
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

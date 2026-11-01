import type { ReactNode } from "react";
import { Database, Leaf, MapPinned, Sparkles } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const POINTS = [
  { icon: MapPinned, title: "Zone-level visibility", text: "Procurement, preparation and waste across a whole locality, rolled up street to sector." },
  { icon: Leaf, title: "Surplus that finds a home", text: "Cooked-food surplus is matched to the organisations that can use it, with hard safety filters first." },
  { icon: Database, title: "Two databases, each doing what it is best at", text: "PostgreSQL for the relational record; MongoDB for flexible field logs, synced safely." },
];

/** Split-screen frame shared by sign-in and registration: brand story on the left, the form on the right. */
export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside
        className="relative isolate hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{ background: "linear-gradient(150deg, var(--hero-from), var(--hero-to))" }}
      >
        <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
        <div aria-hidden className="absolute -right-24 top-1/4 -z-10 size-[28rem] animate-pulse rounded-full bg-[oklch(0.78_0.15_170/0.30)] blur-3xl [animation-duration:6s]" />
        <div aria-hidden className="absolute -left-24 bottom-0 -z-10 size-96 rounded-full bg-[oklch(0.7_0.12_230/0.25)] blur-3xl" />
        <div className="flex items-center gap-2.5 text-white">
          <span className="grid size-9 place-items-center rounded-[10px] bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Leaf aria-hidden className="size-5" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">ZoneFood</span>
        </div>

        <div className="max-w-xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
            <Sparkles aria-hidden className="size-3.5" /> Food resource intelligence for a neighbourhood
          </p>
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight">Waste less. Share more. See the whole zone.</h1>
          <ul className="mt-10 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20"><Icon aria-hidden className="size-[18px]" /></span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm leading-relaxed text-white/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/60">DBMS mini-project · all data shown is synthetic and generated for demonstration.</p>
      </aside>

      <main id="main" className="relative flex flex-col px-6 py-8 sm:px-12">
        <div className="mb-8 flex items-center justify-between">
          <div className="lg:hidden"><Brand /></div>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <div className={`m-auto w-full ${wide ? "max-w-2xl" : "max-w-md"} animate-rise`}>{children}</div>
      </main>
    </div>
  );
}

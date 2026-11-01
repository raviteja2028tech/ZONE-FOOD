"use client";

import { useEffect, useRef } from "react";
import { Database, Leaf, MapPinned, Sparkles } from "lucide-react";

const POINTS = [
  { icon: MapPinned, title: "Zone-level visibility", text: "Procurement, preparation and waste across a whole locality, rolled up street to sector." },
  { icon: Leaf, title: "Surplus that finds a home", text: "Cooked-food surplus is matched to the organisations that can use it, with hard safety filters first." },
  { icon: Database, title: "Two databases, each doing what it is best at", text: "PostgreSQL for the relational record; MongoDB for flexible field logs, synced safely." },
];

const HEADLINE = "Waste less. Share more. See the whole zone.".split(" ");
const STAGES = ["Procure", "Prepare", "Serve", "Waste", "Rescue"];

/**
 * Cinematic sign-in hero. A GSAP timeline reveals the headline word by word, draws the food-lifecycle path and sends
 * a pulse along it. This is an illustration of the process, not data. GSAP is loaded on demand, and with
 * reduced motion the final state is shown immediately.
 */
export function HeroScene() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let cleanup = () => {};
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let cancelled = false;
    import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      const ctx = gsap.context(() => {
        const path = el.querySelector<SVGPathElement>("[data-path]")!;
        const len = path.getTotalLength();
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
        gsap.set("[data-node]", { scale: 0, transformOrigin: "50% 50%" });
        gsap.set("[data-stage]", { opacity: 0, y: 6 });
        gsap.set("[data-pulse]", { opacity: 0 });

        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.from("[data-word]", { yPercent: 110, opacity: 0, duration: 0.8, stagger: 0.07 })
          .from("[data-eyebrow]", { opacity: 0, y: -8, duration: 0.6 }, 0)
          .to(path, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" }, 0.5)
          .to("[data-node]", { scale: 1, duration: 0.5, stagger: 0.28, ease: "back.out(2.2)" }, 0.7)
          .to("[data-stage]", { opacity: 1, y: 0, duration: 0.4, stagger: 0.28 }, 0.8)
          .from("[data-point]", { opacity: 0, x: -14, duration: 0.6, stagger: 0.12 }, 1.2);

        // A pulse travelling along the lifecycle path, forever.
        const pulse = el.querySelector<SVGCircleElement>("[data-pulse]")!;
        const state = { t: 0 };
        gsap.to(state, {
          t: 1, duration: 4.5, repeat: -1, ease: "none", delay: 2.2,
          onStart: () => { gsap.set(pulse, { opacity: 1 }); },
          onUpdate: () => {
            const p = path.getPointAtLength(state.t * len);
            pulse.setAttribute("cx", String(p.x));
            pulse.setAttribute("cy", String(p.y));
          },
        });
      }, el);

      // Parallax: the glowing orbs behind the hero drift slightly against the pointer.
      const aside = el.closest("aside");
      const orbs = aside?.querySelectorAll<HTMLElement>("[data-orb]");
      const move = (e: PointerEvent) => {
        const r = aside!.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        orbs?.forEach((o, i) => gsap.to(o, { x: x * (i ? -50 : 60), y: y * (i ? -40 : 50), duration: 1.2, ease: "power2.out", overwrite: "auto" }));
      };
      aside?.addEventListener("pointermove", move);
      cleanup = () => { ctx.revert(); aside?.removeEventListener("pointermove", move); };
    });
    return () => { cancelled = true; cleanup(); };
  }, []);

  return (
    <div ref={root} className="max-w-xl">
      <p data-eyebrow className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
        <Sparkles aria-hidden className="size-3.5" /> Food resource intelligence for a neighbourhood
      </p>
      <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight">
        {HEADLINE.map((w, i) => (
          <span key={i}><span className="inline-block overflow-hidden align-bottom"><span data-word className="inline-block">{w}</span></span>{" "}</span>
        ))}
      </h1>

      <figure className="mt-8" aria-label="Illustration: the food lifecycle from procurement to rescue">
        <svg viewBox="0 0 520 110" className="w-full overflow-visible" role="img" aria-hidden>
          <defs>
            <linearGradient id="hero-line" x1="0" x2="1"><stop offset="0" stopColor="oklch(0.85 0.1 200)" /><stop offset="1" stopColor="oklch(0.88 0.17 160)" /></linearGradient>
          </defs>
          <path data-path d="M30 70 C 110 10, 170 10, 260 55 S 410 100, 490 40" fill="none" stroke="url(#hero-line)" strokeWidth="2.5" strokeLinecap="round" />
          {[[30, 70], [145, 24], [260, 55], [375, 84], [490, 40]].map(([x, y], i) => (
            <g key={i}>
              <circle data-node cx={x} cy={y} r="9" fill={i === 4 ? "oklch(0.85 0.17 160)" : "oklch(0.96 0.02 200)"} stroke="oklch(1 0 0 / 0.5)" strokeWidth="3" />
              <text data-stage x={x} y={(y ?? 0) + (i === 3 ? 28 : -18)} textAnchor="middle" fontSize="11" fill="white" opacity="0.85" className="font-medium">{STAGES[i]}</text>
            </g>
          ))}
          <circle data-pulse r="5" cx="30" cy="70" fill="white" style={{ filter: "drop-shadow(0 0 8px white)" }} />
        </svg>
      </figure>

      <ul className="mt-6 space-y-5">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <li data-point key={title} className="flex gap-4">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20 backdrop-blur"><Icon aria-hidden className="size-[18px]" /></span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm leading-relaxed text-white/70">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

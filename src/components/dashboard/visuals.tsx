"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { CountUp } from "@/components/ui/count-up";
import type { ZonePoint } from "@/components/charts/zone-chart";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * One ring per block: the green arc is the share of everything handled that was redistributed instead of wasted
 * (the diversion rate), the grey remainder is waste. Every number comes from the zone comparison query.
 */
export function ZonePulse({ zones }: { zones: ZonePoint[] }) {
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const max = Math.max(...zones.map((z) => z.wasteKg + z.redistributedKg), 1);
  if (!zones.length) return <p className="py-10 text-center text-sm text-ink-muted">No zone data yet.</p>;

  const R = 38, C = 2 * Math.PI * R;
  return (
    <ul ref={ref} className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Diversion rate per block">
      {zones.map((z, i) => {
        const total = z.wasteKg + z.redistributedKg;
        const pct = total > 0 ? (z.redistributedKg / total) * 100 : 0;
        const size = 0.78 + 0.22 * (total / max); // bigger ring = more food handled
        return (
          <motion.li
            key={z.zone}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : undefined}
            transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : i * 0.07 }}
            whileHover={{ y: -3 }}
            className="rounded-lg border border-line bg-surface-2/50 p-3 text-center"
          >
            <div className="relative mx-auto" style={{ width: `${size * 100}%`, maxWidth: 112 }}>
              <svg viewBox="0 0 100 100" className="block w-full -rotate-90" role="img" aria-label={`${z.zone}: ${pct.toFixed(0)}% redistributed`}>
                <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="9" />
                <motion.circle
                  cx="50" cy="50" r={R} fill="none" stroke="var(--series-3)" strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={C}
                  initial={{ strokeDashoffset: C }}
                  animate={inView ? { strokeDashoffset: C * (1 - pct / 100) } : undefined}
                  transition={{ duration: reduce ? 0 : 1.1, ease: EASE, delay: reduce ? 0 : 0.2 + i * 0.07 }}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center rotate-0">
                <span className="tabular text-lg font-semibold leading-none text-ink"><CountUp value={pct} decimals={0} />%</span>
              </div>
            </div>
            <p className="mt-2 truncate text-sm font-medium text-ink">{z.zone}</p>
            <p className="tabular text-xs text-ink-muted">{z.wasteKg.toLocaleString("en-IN")} kg wasted</p>
            <p className="tabular text-xs text-ink-muted">{z.establishments} establishments</p>
          </motion.li>
        );
      })}
    </ul>
  );
}

export interface FunnelData { listings: number; offeredKg: number; reservedKg: number; collectedKg: number; ratePct: number; medianHours: number | null }

/** Offered -> reserved -> collected as three connected stages with food "flowing" through them; sourced from v_redistribution_performance. */
export function RedistributionFlow({ funnel }: { funnel: FunnelData }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const top = Math.max(funnel.offeredKg, 1);
  const stages = [
    { label: "Offered", value: funnel.offeredKg, color: "var(--series-1)", hint: `${funnel.listings.toLocaleString("en-IN")} listings` },
    { label: "Reserved", value: funnel.reservedKg, color: "var(--series-4)", hint: "approved for pickup" },
    { label: "Collected", value: funnel.collectedKg, color: "var(--series-3)", hint: funnel.medianHours !== null ? `median ${funnel.medianHours} h to pickup` : "picked up" },
  ];
  return (
    <div ref={ref}>
      <div className="relative">
        <div className="grid grid-cols-3 gap-3">
          {stages.map((s, i) => {
            const h = Math.max((s.value / top) * 100, 4);
            return (
              <div key={s.label} className="flex flex-col items-center">
                <div className="relative flex h-36 w-full items-end overflow-hidden rounded-lg bg-surface-2">
                  <motion.div
                    className="relative w-full rounded-t-lg"
                    style={{ background: `linear-gradient(180deg, color-mix(in oklch, ${s.color} 85%, white), ${s.color})` }}
                    initial={{ height: 0 }}
                    animate={inView ? { height: `${h}%` } : undefined}
                    transition={{ duration: reduce ? 0 : 0.9, ease: EASE, delay: reduce ? 0 : i * 0.18 }}
                  >
                    {!reduce && (
                      <span aria-hidden className="absolute inset-x-0 top-0 h-6 animate-pulse bg-gradient-to-b from-white/35 to-transparent" />
                    )}
                  </motion.div>
                </div>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{s.label}</p>
                <p className="tabular text-lg font-semibold text-ink"><CountUp value={s.value} decimals={0} /> <span className="text-xs font-normal text-ink-muted">kg</span></p>
                <p className="text-xs text-ink-muted">{s.hint}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-accent-ink">
        <span className="tabular text-xl font-semibold"><CountUp value={funnel.ratePct} decimals={1} />%</span>
        <span>of offered food was collected by a recipient organisation.</span>
      </div>
    </div>
  );
}

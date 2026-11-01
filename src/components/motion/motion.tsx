"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/lib/cn";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Honours the operating-system "reduce motion" setting for every animation below (transforms are skipped, fades kept). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Short fade-rise entrance for a whole page; re-mounted on every navigation by `template.tsx`. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
      {children}
    </motion.div>
  );
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const item: Variants = { hidden: { opacity: 0, y: 14, scale: 0.985 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } } };

/** Children wrapped in `StaggerItem` rise in one after another when the group scrolls into view. */
export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "ol" | "section" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Tag = motion[as];
  return <Tag className={className} variants={item}>{children}</Tag>;
}

/** Fades a block in once when it enters the viewport. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

/**
 * Card wrapper with a soft light that follows the pointer (pure CSS variables, no re-render per move) and a
 * small lift on hover. Disabled for touch and reduced-motion users.
 */
export function Spotlight({ children, className, ...rest }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  return (
    <div
      ref={ref}
      {...rest}
      className={cn("spotlight", className)}
      onPointerMove={(e) => {
        if (reduce || e.pointerType === "touch") return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

/** The sliding highlight behind the active navigation entry (shared layout animation). */
export function ActivePill({ id }: { id: string }) {
  return <motion.span layoutId={id} aria-hidden className="absolute inset-0 -z-10 rounded-md bg-accent-soft" transition={{ type: "spring", stiffness: 420, damping: 36 }} />;
}

export { motion };

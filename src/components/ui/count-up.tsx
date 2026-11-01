"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a figure from 0 to its value once, when it scrolls into view. Honours prefers-reduced-motion (shows the
 * final number immediately) and renders the real number on the server, so there is no flash and no layout shift.
 */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || done.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || done.current) return;
      done.current = true;
      obs.disconnect();
      const start = performance.now();
      const duration = 800;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        setShown(value * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      setShown(0);
      raf = requestAnimationFrame(tick);
    });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);

  const text = shown.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref} className="tabular">{prefix}{text}{suffix}</span>;
}

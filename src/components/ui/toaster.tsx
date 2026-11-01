"use client";

import { Toaster as Sonner } from "sonner";

/** Success / error notifications, styled with the design tokens so they follow the light/dark theme. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        style: { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", boxShadow: "var(--elev-pop)", fontFamily: "var(--font-geist-sans)" },
      }}
    />
  );
}

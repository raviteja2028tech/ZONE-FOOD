import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/toaster";
import { MotionProvider } from "@/components/motion/motion";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ZoneFood", template: "%s · ZoneFood" },
  description: "Locality-level food resource management: procurement, waste and surplus redistribution.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6faf8" },
    { media: "(prefers-color-scheme: dark)", color: "#10181b" },
  ],
};

/** Runs before first paint so the saved (or system) theme applies without a flash. */
const themeScript = `(function(){try{var s=localStorage.getItem("zonefood-theme");var t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-on focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <div aria-hidden className="ambient" />
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}

import { PageTransition } from "@/components/motion/motion";

/** Re-mounts on every navigation, giving each page a short fade-rise entrance (reduced-motion aware via MotionProvider). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}

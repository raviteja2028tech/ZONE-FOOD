/** Re-mounts on every navigation, giving each page a short fade-rise entrance (disabled by prefers-reduced-motion). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}

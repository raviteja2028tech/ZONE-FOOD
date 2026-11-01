/** Skeleton that mirrors the Analytics layout so the page does not jump when data arrives. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading analytics">
      <div className="skeleton h-9 w-48 rounded" />
      <div className="skeleton h-20 w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-36 rounded-lg" />)}</div>
      <div className="skeleton h-96 w-full rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-2"><div className="skeleton h-80 rounded-lg" /><div className="skeleton h-80 rounded-lg" /></div>
    </div>
  );
}

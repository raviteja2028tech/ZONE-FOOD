/** Skeleton mirroring the forecast layout. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading forecast">
      <div className="skeleton h-9 w-56 rounded" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-36 rounded-lg" />)}</div>
      <div className="skeleton h-[26rem] w-full rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-2"><div className="skeleton h-80 rounded-lg" /><div className="skeleton h-80 rounded-lg" /></div>
    </div>
  );
}

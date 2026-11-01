import Link from "next/link";

/** ZoneFood mark: a leaf-shaped tile with a map-pin cut, drawn inline (no image request). */
export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="ZoneFood home">
      <span className="grid size-9 place-items-center rounded-[10px] bg-accent text-accent-on shadow-card">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 4c-8 0-14 4-14 11 0 1.5.4 2.8 1 4 1.5-5 5-8 9-9.5-3 2.5-5 5.5-6 9.5 1.2.6 2.5 1 4 1 7 0 6-8 6-16Z" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-ink">
        Zone<span className="text-accent-ink">Food</span>
      </span>
    </Link>
  );
}

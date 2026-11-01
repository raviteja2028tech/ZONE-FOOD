/**
 * Sliding-window limiter for failed logins: `max` failures within `windowMs` locks that key until the
 * oldest failure ages out. In-memory (single Node process) - adequate for this mini-project; a shared
 * store would be needed to run several server instances.
 */
export class FailureLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Seconds until another attempt is allowed, or 0 if the key is not locked. */
  retryAfterSeconds(key: string): number {
    const list = this.recent(key);
    if (list.length < this.max) return 0;
    const oldest = list[0] ?? this.now();
    return Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000));
  }

  recordFailure(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.failures.set(key, list);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

const g = globalThis as unknown as { __zonefoodLoginLimiter?: FailureLimiter };
/** Process-wide instance (survives dev hot reload). */
export const loginLimiter = (g.__zonefoodLoginLimiter ??= new FailureLimiter());

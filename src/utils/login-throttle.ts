/**
 * Sliding-window attempt limiter for /auth/login, deliberately free of any
 * Prisma/env/Express dependency so it's independently unit-testable (the
 * clock is injectable) — same convention as roles.ts / cors.ts /
 * pagination.ts. The Express wiring lives in
 * middleware/login-throttle-middleware.ts.
 *
 * Semantics: attempt() counts the attempt BEFORE the password is checked,
 * atomically with the allow/block decision. Counting after the response
 * instead would let a burst of parallel requests all pass the check while
 * the first bcrypt comparisons are still running. A correct login calls
 * reset(), which clears the count for that key.
 *
 * Limits worth knowing: state is in this process's memory, so it resets on
 * restart and isn't shared between multiple server instances. Fine for the
 * current single-instance deployment; a multi-instance deployment would
 * need a shared store (e.g. Redis) behind this same interface.
 */
export interface ThrottleResult {
  blocked: boolean;
  /** Seconds until the key can try again. 0 when not blocked. */
  retryAfterSeconds: number;
}

const DEFAULT_MAX_TRACKED_KEYS = 10_000;

export class LoginThrottle {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxTrackedKeys: number = DEFAULT_MAX_TRACKED_KEYS,
  ) {}

  /**
   * Records an attempt for `key` unless it's already over the limit.
   * Blocked attempts are not recorded — hammering a locked key doesn't
   * extend its lockout.
   */
  attempt(key: string): ThrottleResult {
    const current = this.now();
    const recent = (this.attempts.get(key) ?? []).filter((t) => t > current - this.windowMs);

    if (recent.length >= this.maxAttempts) {
      this.attempts.set(key, recent);
      const retryAfterMs = recent[0] + this.windowMs - current;
      return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    recent.push(current);
    this.attempts.set(key, recent);
    this.sweepIfNeeded(current);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  /** Clears the count for a key — called after a successful login. */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /** Number of keys currently tracked (exposed for tests). */
  trackedKeys(): number {
    return this.attempts.size;
  }

  /**
   * Keeps memory bounded: once past the cap, drop every key whose
   * attempts have all aged out of the window. Without this, a flood of
   * distinct emails/IPs would grow the map forever.
   */
  private sweepIfNeeded(current: number): void {
    if (this.attempts.size <= this.maxTrackedKeys) {
      return;
    }
    for (const [key, times] of this.attempts) {
      if (times.every((t) => t <= current - this.windowMs)) {
        this.attempts.delete(key);
      }
    }
  }
}

import { LoginThrottle } from "../../src/utils/login-throttle";

const WINDOW_MS = 15 * 60_000;

function makeThrottle(maxAttempts = 3, maxTrackedKeys?: number) {
  let time = 1_000_000;
  const throttle = new LoginThrottle(maxAttempts, WINDOW_MS, () => time, maxTrackedKeys);
  return {
    throttle,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("LoginThrottle", () => {
  it("allows attempts up to the limit, then blocks the next one", () => {
    const { throttle } = makeThrottle(3);
    expect(throttle.attempt("a").blocked).toBe(false);
    expect(throttle.attempt("a").blocked).toBe(false);
    expect(throttle.attempt("a").blocked).toBe(false);
    expect(throttle.attempt("a").blocked).toBe(true);
  });

  it("tracks each key independently", () => {
    const { throttle } = makeThrottle(1);
    expect(throttle.attempt("alice").blocked).toBe(false);
    expect(throttle.attempt("alice").blocked).toBe(true);
    expect(throttle.attempt("bob").blocked).toBe(false);
  });

  it("reports how long until the oldest attempt ages out", () => {
    const { throttle, advance } = makeThrottle(2);
    throttle.attempt("a");
    advance(5 * 60_000);
    throttle.attempt("a");
    const result = throttle.attempt("a");
    expect(result.blocked).toBe(true);
    // oldest attempt was 5 minutes ago, so 10 minutes (600s) remain
    expect(result.retryAfterSeconds).toBe(600);
  });

  it("unblocks once the window has passed", () => {
    const { throttle, advance } = makeThrottle(2);
    throttle.attempt("a");
    throttle.attempt("a");
    expect(throttle.attempt("a").blocked).toBe(true);
    advance(WINDOW_MS + 1);
    expect(throttle.attempt("a").blocked).toBe(false);
  });

  it("does not extend a lockout when a blocked key keeps trying", () => {
    const { throttle, advance } = makeThrottle(1);
    throttle.attempt("a");
    advance(10 * 60_000);
    // hammering while locked...
    for (let i = 0; i < 20; i++) {
      expect(throttle.attempt("a").blocked).toBe(true);
    }
    // ...doesn't push the unlock time past the original window
    advance(5 * 60_000 + 1);
    expect(throttle.attempt("a").blocked).toBe(false);
  });

  it("clears the count on reset (a successful login)", () => {
    const { throttle } = makeThrottle(2);
    throttle.attempt("a");
    throttle.attempt("a");
    throttle.reset("a");
    expect(throttle.attempt("a").blocked).toBe(false);
    expect(throttle.attempt("a").blocked).toBe(false);
    expect(throttle.attempt("a").blocked).toBe(true);
  });

  it("sweeps expired keys once past the tracking cap, keeping memory bounded", () => {
    const { throttle, advance } = makeThrottle(3, 2);
    throttle.attempt("k1");
    throttle.attempt("k2");
    throttle.attempt("k3");
    expect(throttle.trackedKeys()).toBe(3);
    advance(WINDOW_MS + 1);
    throttle.attempt("k4"); // size > cap triggers a sweep of the aged-out keys
    expect(throttle.trackedKeys()).toBe(1);
  });
});

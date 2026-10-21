import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { LoginThrottle } from "../utils/login-throttle";

// One shared instance for the whole process — the limiter's state has to
// outlive individual requests. The logic itself lives in
// utils/login-throttle.ts (pure, unit-tested); this file is only the
// Express glue and the env wiring.
const throttle = new LoginThrottle(env.loginMaxAttempts, env.loginWindowMinutes * 60_000);

/**
 * Mounted AFTER validateBody on POST /auth/login, so malformed requests
 * (which can't be password guesses) get a 422 without being counted.
 *
 * The attempt is counted before the credentials are checked. A correct
 * password (200), or a correct password on a deactivated account (423),
 * clears the count; a wrong one (401) leaves it counted. Keyed by IP +
 * email so one client hammering an account doesn't lock that user out
 * from everywhere else.
 */
export function loginThrottleMiddleware(req: Request, res: Response, next: NextFunction): void {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const key = `${req.ip ?? "unknown"}|${email}`;

  const result = throttle.attempt(key);
  if (result.blocked) {
    const minutes = Math.ceil(result.retryAfterSeconds / 60);
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({
      code: "TOO_MANY_REQUESTS",
      message: `Too many login attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    });
    return;
  }

  res.on("finish", () => {
    if (res.statusCode === 200 || res.statusCode === 423) {
      throttle.reset(key);
    }
  });

  next();
}

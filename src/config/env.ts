import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  fileStorageDir: string;
  corsAllowedOrigins: string[];
  loginMaxAttempts: number;
  loginWindowMinutes: number;
  trustProxyHops: number;
}

/**
 * Fails fast at boot if a required env var is missing, rather than
 * surfacing a confusing error later at first use.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Reads an optional non-negative integer env var. A set-but-invalid value
 * (e.g. "abc", "-1", "5.5") throws at boot rather than silently falling
 * back — for a security setting like the login limit, a typo quietly
 * disabling the protection is worse than refusing to start.
 */
function optionalInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Environment variable ${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
}

export const env: EnvConfig = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  // Local-disk document storage (Step 3 decision — see file-storage.ts for
  // why this sits behind an interface rather than being used directly).
  fileStorageDir: process.env.FILE_STORAGE_DIR ?? "./uploads",
  // Comma-separated list of origins allowed to call this API from a
  // browser, e.g. "https://lats.example.com,https://lats-staging.example.com".
  // Unset (or "*") means "allow any origin" — the original behavior, kept
  // as the default so this doesn't break local dev or the ngrok tunnel
  // mid-project. Set this to a real, specific list before any deployment
  // reachable outside your own machine (see cors.ts).
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  // Login throttling (see utils/login-throttle.ts): at most this many
  // attempts per IP+email within the window before /auth/login answers 429.
  loginMaxAttempts: optionalInt("LOGIN_MAX_ATTEMPTS", 5, 1),
  loginWindowMinutes: optionalInt("LOGIN_WINDOW_MINUTES", 15, 1),
  // How many reverse-proxy hops sit in front of this server (ngrok, nginx,
  // a hosting platform's load balancer). 0 = none, trust nothing — req.ip
  // is the direct connection. Set to 1 behind a single proxy so req.ip is
  // the real client rather than the proxy; without this, every client
  // behind a proxy shares one IP and the login throttle degrades to
  // per-email only.
  trustProxyHops: optionalInt("TRUST_PROXY_HOPS", 0, 0),
};

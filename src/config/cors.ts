/**
 * Pure origin-matching logic, deliberately free of any import on env.ts —
 * env.ts validates required vars eagerly on import, which would otherwise
 * drag a live environment requirement into what should be an isolated
 * unit test. The env-dependent wiring (reading CORS_ALLOWED_ORIGINS,
 * building the actual cors() options object) lives in app.ts instead,
 * which already depends on env for everything else.
 *
 * "*" in the allowed-origins list means "allow any origin," the
 * project's original behavior and the default in env.ts when
 * CORS_ALLOWED_ORIGINS is unset.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes("*")) {
    return true;
  }
  // No Origin header at all — a same-origin request, a server-to-server
  // call, or a tool like curl/Postman, never a cross-origin browser
  // request. The cors package itself treats this the same way.
  if (!origin) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

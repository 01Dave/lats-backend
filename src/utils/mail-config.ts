/**
 * Reads the optional SMTP settings. Pure (takes the environment as an
 * argument, imports nothing from config/env.ts or Prisma) so it is
 * unit-testable, same convention as roles.ts / login-throttle.ts.
 *
 * Email is OFF unless SMTP_HOST is set: the system works exactly as before
 * without it, and the rejection notice is simply skipped. A set-but-invalid
 * value throws at boot, rather than quietly dropping rejection emails.
 */

export interface MailConfig {
  host: string;
  port: number;
  /** true = connect over TLS from the start (usually port 465). */
  secure: boolean;
  user?: string;
  password?: string;
  /** Sender shown on every message, e.g. "LATS <lats-noreply@bank.com>". */
  from: string;
  /** Accept a self-signed or otherwise invalid server certificate. Discouraged. */
  allowInvalidCert: boolean;
}

type EnvSource = Record<string, string | undefined>;

function read(source: EnvSource, name: string): string | undefined {
  const raw = source[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readBool(source: EnvSource, name: string): boolean | undefined {
  const raw = read(source, name);
  if (raw === undefined) {
    return undefined;
  }
  const lower = raw.toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }
  throw new Error(`Environment variable ${name} must be "true" or "false", got "${raw}"`);
}

/** Returns null when email is not configured (SMTP_HOST unset). */
export function parseMailConfig(source: EnvSource): MailConfig | null {
  const host = read(source, "SMTP_HOST");
  if (!host) {
    return null;
  }

  const portRaw = read(source, "SMTP_PORT");
  const port = portRaw === undefined ? 587 : Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable SMTP_PORT must be a port number (1-65535), got "${portRaw}"`);
  }

  // Port 465 is TLS-from-the-start by convention; anything else negotiates
  // STARTTLS if the server offers it. Overridable.
  const secure = readBool(source, "SMTP_SECURE") ?? port === 465;

  const user = read(source, "SMTP_USER");
  const password = read(source, "SMTP_PASSWORD");
  if ((user && !password) || (!user && password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be set together (or both left unset)");
  }

  let from = read(source, "MAIL_FROM");
  if (!from) {
    if (user && user.includes("@")) {
      from = `LATS <${user}>`;
    } else {
      throw new Error("MAIL_FROM is required when SMTP_HOST is set (e.g. \"LATS <lats-noreply@yourbank.com>\")");
    }
  }

  return {
    host,
    port,
    secure,
    ...(user && password ? { user, password } : {}),
    from,
    allowInvalidCert: readBool(source, "SMTP_ALLOW_INVALID_CERT") ?? false,
  };
}

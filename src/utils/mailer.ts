import nodemailer from "nodemailer";
import { MailConfig } from "./mail-config";

/**
 * Thin wrapper over nodemailer. No env, Prisma or logger imports, so it can
 * be tested against a local fake mail server. It throws on failure; the
 * caller (services/notification-service.ts) decides what a failure means,
 * which for rejection notices is: log it and carry on.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** false when SMTP is not configured; send() must not be called then. */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export function createMailer(config: MailConfig | null): Mailer {
  if (!config) {
    return {
      enabled: false,
      async send(): Promise<void> {
        throw new Error("Email is not configured (SMTP_HOST is unset)");
      },
    };
  }

  // Short timeouts: a slow or unreachable mail server must not pile up open
  // connections. Nothing waits on the result (see notification-service.ts).
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.password ? { auth: { user: config.user, pass: config.password } } : {}),
    tls: { rejectUnauthorized: !config.allowInvalidCert },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    enabled: true,
    async send(message: MailMessage): Promise<void> {
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

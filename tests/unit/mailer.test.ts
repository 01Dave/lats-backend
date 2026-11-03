import { AddressInfo } from "net";
import { SMTPServer } from "smtp-server";
import { createMailer } from "../../src/utils/mailer";
import { MailConfig } from "../../src/utils/mail-config";

/** A real SMTP server on a random local port that records what it receives. */
function startFakeSmtp(options: { requireAuth?: { user: string; pass: string } } = {}) {
  const received: string[] = [];
  const auths: Array<{ user?: string | null; pass?: string | null }> = [];
  const server = new SMTPServer({
    secure: false,
    disabledCommands: options.requireAuth ? ["STARTTLS"] : ["STARTTLS", "AUTH"],
    authOptional: !options.requireAuth,
    allowInsecureAuth: true,
    onAuth(auth, _session, callback) {
      auths.push({ user: auth.username, pass: auth.password });
      if (options.requireAuth && (auth.username !== options.requireAuth.user || auth.password !== options.requireAuth.pass)) {
        callback(new Error("Invalid login"));
        return;
      }
      callback(null, { user: auth.username });
    },
    onData(stream, _session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        received.push(Buffer.concat(chunks).toString("utf8"));
        callback();
      });
    },
  });
  return new Promise<{ port: number; received: string[]; auths: typeof auths; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.server.address() as AddressInfo).port,
        received,
        auths,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

// Undo the line-wrapping and quoted-printable escapes nodemailer may apply.
function unwrap(raw: string): string {
  return raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
}

const message = {
  to: "sales.rep@bank.com",
  subject: "Loan application LN-2026-000123 rejected at Internal Control",
  text: "Hello Test Sales,\nReason given:\nFailed internal checks",
  html: "<p>Hello</p>",
};

describe("createMailer", () => {
  it("is disabled when there is no config, and refuses to send", async () => {
    const mailer = createMailer(null);
    expect(mailer.enabled).toBe(false);
    await expect(mailer.send(message)).rejects.toThrow("not configured");
  });

  it("delivers a message to a real SMTP server", async () => {
    const smtp = await startFakeSmtp();
    try {
      const config: MailConfig = {
        host: "127.0.0.1",
        port: smtp.port,
        secure: false,
        from: "LATS <lats-noreply@bank.com>",
        allowInvalidCert: false,
      };
      const mailer = createMailer(config);
      expect(mailer.enabled).toBe(true);
      await mailer.send(message);

      expect(smtp.received).toHaveLength(1);
      const raw = unwrap(smtp.received[0]);
      expect(raw).toContain("To: sales.rep@bank.com");
      expect(raw).toContain("From: LATS <lats-noreply@bank.com>");
      expect(raw).toContain("Subject: Loan application LN-2026-000123 rejected at Internal Control");
      expect(raw).toContain("Failed internal checks");
    } finally {
      await smtp.close();
    }
  }, 20000);

  it("logs in with the configured username and password", async () => {
    const smtp = await startFakeSmtp({ requireAuth: { user: "lats@bank.com", pass: "s3cret" } });
    try {
      const mailer = createMailer({
        host: "127.0.0.1",
        port: smtp.port,
        secure: false,
        user: "lats@bank.com",
        password: "s3cret",
        from: "lats@bank.com",
        allowInvalidCert: false,
      });
      await mailer.send(message);
      expect(smtp.auths).toEqual([{ user: "lats@bank.com", pass: "s3cret" }]);
      expect(smtp.received).toHaveLength(1);
    } finally {
      await smtp.close();
    }
  }, 20000);

  it("rejects (rather than hangs) when the password is wrong", async () => {
    const smtp = await startFakeSmtp({ requireAuth: { user: "lats@bank.com", pass: "s3cret" } });
    try {
      const mailer = createMailer({
        host: "127.0.0.1",
        port: smtp.port,
        secure: false,
        user: "lats@bank.com",
        password: "wrong",
        from: "lats@bank.com",
        allowInvalidCert: false,
      });
      await expect(mailer.send(message)).rejects.toThrow();
      expect(smtp.received).toHaveLength(0);
    } finally {
      await smtp.close();
    }
  }, 20000);

  it("rejects when nothing is listening on the port", async () => {
    // Open then close a server to get a port that is certainly free.
    const smtp = await startFakeSmtp();
    const port = smtp.port;
    await smtp.close();
    const mailer = createMailer({ host: "127.0.0.1", port, secure: false, from: "a@b.com", allowInvalidCert: false });
    await expect(mailer.send(message)).rejects.toThrow();
  }, 20000);
});

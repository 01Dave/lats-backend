import { parseMailConfig } from "../../src/utils/mail-config";

describe("parseMailConfig", () => {
  it("is off (null) when SMTP_HOST is unset or blank", () => {
    expect(parseMailConfig({})).toBeNull();
    expect(parseMailConfig({ SMTP_HOST: "   " })).toBeNull();
    // Other SMTP values alone don't switch it on.
    expect(parseMailConfig({ SMTP_PORT: "25", MAIL_FROM: "a@b.com" })).toBeNull();
  });

  it("reads a full configuration", () => {
    expect(
      parseMailConfig({
        SMTP_HOST: "mail.bank.com",
        SMTP_PORT: "587",
        SMTP_USER: "lats-noreply@bank.com",
        SMTP_PASSWORD: "secret",
        MAIL_FROM: "LATS <lats-noreply@bank.com>",
      }),
    ).toEqual({
      host: "mail.bank.com",
      port: 587,
      secure: false,
      user: "lats-noreply@bank.com",
      password: "secret",
      from: "LATS <lats-noreply@bank.com>",
      allowInvalidCert: false,
    });
  });

  it("defaults to port 587 without TLS-from-the-start", () => {
    const c = parseMailConfig({ SMTP_HOST: "h", MAIL_FROM: "a@b.com" });
    expect(c?.port).toBe(587);
    expect(c?.secure).toBe(false);
  });

  it("treats port 465 as TLS-from-the-start unless overridden", () => {
    expect(parseMailConfig({ SMTP_HOST: "h", SMTP_PORT: "465", MAIL_FROM: "a@b.com" })?.secure).toBe(true);
    expect(
      parseMailConfig({ SMTP_HOST: "h", SMTP_PORT: "465", SMTP_SECURE: "false", MAIL_FROM: "a@b.com" })?.secure,
    ).toBe(false);
  });

  it("allows an unauthenticated server (no user or password)", () => {
    const c = parseMailConfig({ SMTP_HOST: "relay.internal", SMTP_PORT: "25", MAIL_FROM: "a@b.com" });
    expect(c).not.toBeNull();
    expect(c?.user).toBeUndefined();
    expect(c?.password).toBeUndefined();
  });

  it("derives MAIL_FROM from SMTP_USER when that is an email address", () => {
    const c = parseMailConfig({ SMTP_HOST: "h", SMTP_USER: "lats@bank.com", SMTP_PASSWORD: "x" });
    expect(c?.from).toBe("LATS <lats@bank.com>");
  });

  it("refuses to start with email on but no sender it can work out", () => {
    expect(() => parseMailConfig({ SMTP_HOST: "h" })).toThrow("MAIL_FROM");
    expect(() => parseMailConfig({ SMTP_HOST: "h", SMTP_USER: "svc", SMTP_PASSWORD: "x" })).toThrow("MAIL_FROM");
  });

  it("requires user and password together", () => {
    expect(() => parseMailConfig({ SMTP_HOST: "h", MAIL_FROM: "a@b.com", SMTP_USER: "u" })).toThrow("together");
    expect(() => parseMailConfig({ SMTP_HOST: "h", MAIL_FROM: "a@b.com", SMTP_PASSWORD: "p" })).toThrow("together");
  });

  it("rejects an invalid port or boolean instead of guessing", () => {
    expect(() => parseMailConfig({ SMTP_HOST: "h", SMTP_PORT: "abc", MAIL_FROM: "a@b.com" })).toThrow("SMTP_PORT");
    expect(() => parseMailConfig({ SMTP_HOST: "h", SMTP_PORT: "70000", MAIL_FROM: "a@b.com" })).toThrow("SMTP_PORT");
    expect(() => parseMailConfig({ SMTP_HOST: "h", MAIL_FROM: "a@b.com", SMTP_SECURE: "yes" })).toThrow("SMTP_SECURE");
  });

  it("reads the invalid-certificate switch", () => {
    expect(
      parseMailConfig({ SMTP_HOST: "h", MAIL_FROM: "a@b.com", SMTP_ALLOW_INVALID_CERT: "true" })?.allowInvalidCert,
    ).toBe(true);
  });
});

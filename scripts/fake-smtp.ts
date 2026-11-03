/**
 * Local stand-in for the bank's mail server, for trying the rejection email
 * without real SMTP details. Accepts any message and prints it.
 *
 *   npm run fake-smtp
 *
 * Then, in .env:
 *   SMTP_HOST=127.0.0.1
 *   SMTP_PORT=1025
 *   MAIL_FROM="LATS <lats-noreply@bank.test>"
 * restart `npm run dev`, reject a loan, and the email prints here.
 * Development only: nothing is delivered anywhere.
 */
import { SMTPServer } from "smtp-server";

const PORT = Number(process.env.FAKE_SMTP_PORT ?? 1025);

const server = new SMTPServer({
  secure: false,
  authOptional: true,
  allowInsecureAuth: true,
  disabledCommands: ["STARTTLS"],
  onAuth(_auth, _session, callback) {
    callback(null, { user: "dev" });
  },
  onData(stream, _session, callback) {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").replace(/=\r?\n/g, "");
      console.log("\n==================== EMAIL RECEIVED ====================");
      console.log(raw);
      console.log("========================================================\n");
      callback();
    });
  },
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Fake mail server listening on 127.0.0.1:${PORT}. Nothing is delivered; emails print here.`);
});

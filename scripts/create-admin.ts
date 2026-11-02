/**
 * One-off: create the first real admin account on a fresh database, so
 * production never needs the shared-password seed users.
 *
 *   npm run create-admin
 *
 * Prompts for email, name and password (the password is hidden as you type
 * and asked twice). For non-interactive use set ADMIN_EMAIL, ADMIN_NAME and
 * ADMIN_PASSWORD instead. Never overwrites: if the email already exists it
 * stops. After this, create every other user through the admin API.
 */
import readline from "readline";
import bcrypt from "bcrypt";
import { prisma } from "../src/db/client";
import { validateBootstrapAdmin } from "../src/utils/admin-bootstrap";

function ask(question: string, hidden: boolean): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      // Mute echo while the answer is typed. _writeToOutput is the standard
      // readline hook for this; it isn't in the public typings.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyRl = rl as any;
      anyRl._writeToOutput = (text: string) => {
        if (text.includes(question)) {
          anyRl.output.write(text);
        }
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) {
        process.stdout.write("\n");
      }
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  let email = process.env.ADMIN_EMAIL ?? "";
  let name = process.env.ADMIN_NAME ?? "";
  let password = process.env.ADMIN_PASSWORD ?? "";

  if (!email) {
    email = await ask("Admin email: ", false);
  }
  if (!name) {
    name = await ask("Admin full name: ", false);
  }
  if (!password) {
    password = await ask("Admin password (hidden, 12+ characters): ", true);
    const again = await ask("Repeat password: ", true);
    if (again !== password) {
      console.error("Passwords did not match. Nothing was created.");
      process.exit(1);
    }
  }

  const problems = validateBootstrapAdmin({ email, name, password });
  if (problems.length > 0) {
    console.error("Nothing was created:");
    for (const p of problems) {
      console.error(`  - ${p}`);
    }
    process.exit(1);
  }

  const normalisedEmail = email.trim();
  const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
  if (existing) {
    console.error(`A user with ${normalisedEmail} already exists. Nothing was changed.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: normalisedEmail, name: name.trim(), role: "admin", passwordHash },
  });

  console.log(`Admin created: ${user.email} (${user.name}). Sign in with the password you just set.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

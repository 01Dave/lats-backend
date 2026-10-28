import bcrypt from "bcrypt";
import { prisma } from "../src/db/client";
import { RoleName } from "../src/config/roles";

const SEED_USERS: Array<{ email: string; name: string; role: RoleName }> = [
  { email: "sales@lats.test", name: "Test Sales", role: "sales" },
  { email: "hod@lats.test", name: "Test HOD", role: "hod" },
  { email: "creditreview@lats.test", name: "Test Credit Review", role: "credit_review" },
  // A second HOD / Credit Review, so automatic case-owner assignment and
  // reassignment have more than one person to pick between.
  { email: "hod2@lats.test", name: "Test HOD Two", role: "hod" },
  { email: "creditreview2@lats.test", name: "Test Credit Review Two", role: "credit_review" },
  { email: "internalcontrol@lats.test", name: "Test Internal Control", role: "internal_control" },
  { email: "md@lats.test", name: "Test MD", role: "md" },
  { email: "finance@lats.test", name: "Test Finance", role: "finance" },
  { email: "admin@lats.test", name: "Test Admin", role: "admin" },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
  }

  console.log(`Seeded ${SEED_USERS.length} users. Shared password: Password123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

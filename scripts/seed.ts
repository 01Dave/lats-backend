import bcrypt from "bcrypt";
import { prisma } from "../src/db/client";
import { RoleName } from "../src/config/roles";

// branch: "Main" on the branch-scoped roles (hod, credit_review) so they
// can actually see/act on applications created with branch: "Main" in
// manual testing — application:view:branch matches on this field, so an
// unset branch here means those users see nothing, by design.
const SEED_USERS: Array<{ email: string; name: string; role: RoleName; branch?: string }> = [
  { email: "sales@lats.test", name: "Test Sales", role: "sales", branch: "Main" },
  { email: "hod@lats.test", name: "Test HOD", role: "hod", branch: "Main" },
  { email: "creditreview@lats.test", name: "Test Credit Review", role: "credit_review", branch: "Main" },
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
      update: { branch: u.branch ?? null },
      create: { email: u.email, name: u.name, role: u.role, passwordHash, branch: u.branch },
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
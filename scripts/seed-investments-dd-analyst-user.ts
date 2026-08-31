/**
 * Seed an Investments department analyst for due-diligence task assignment (DEV nts).
 *
 * Usage: npx tsx scripts/seed-investments-dd-analyst-user.ts
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/database";
import { assertDevDatabase } from "./lib/assert-dev-database";

const EMAIL = "investments.analyst@nts.com";
const PASSWORD = "analyst123";

async function main() {
  await assertDevDatabase(prisma, "seed-investments-dd-analyst");

  let role = await prisma.role.findFirst({
    where: { OR: [{ name: "Investment Analyst" }, { name: { contains: "Investment Analyst" } }] },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: "Investment Analyst",
        description: "Analyzes investment opportunities — DD workstream assignee",
        permissions: [],
      },
    });
    console.log("[ok] created role Investment Analyst");
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  const payload = {
    password: hash,
    firstName: "Tendai",
    lastName: "Moyo",
    userDepartment: "Investments",
    departmentRole: "Investment Analyst",
    roleCode: "INV_ANALYST",
    roleId: role.id,
  };

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: payload });
    console.log(`[ok] updated user ${EMAIL}`);
  } else {
    await prisma.user.create({ data: { email: EMAIL, ...payload } });
    console.log(`[ok] created user ${EMAIL}`);
  }

  const count = await prisma.user.count({
    where: { userDepartment: "Investments", role: { name: { not: "applicant" } } },
  });

  console.log("\n=== Investments DD analyst ready ===");
  console.log(`Login: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Investments department users (excl. applicants): ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

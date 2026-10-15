/**
 * Idempotent local-only UAT role seed.
 *
 * This intentionally creates synthetic accounts that mirror the production role
 * assignments without copying production identities, passwords, or records.
 * Never run this against a production DATABASE_URL.
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;
const password = process.env.UAT_TEST_PASSWORD || "admin123";

const PERSONAS = [
  ["tino", "Synthetic CEO", "CEO", "Investments", "CEO"],
  ["sophia", "Synthetic CFO", "CFO", "Finance", "Chief Financial Officer"],
  ["ropa", "Synthetic Finance Assistant", "FIN_ASST", "Finance", "Finance Assistant"],
  ["brendon", "Synthetic Investment Analyst 1", "INV_ANALYST", "Investments", "Investment Analyst"],
  ["natsai", "Synthetic Investment Analyst 2", "INV_ANALYST", "Investments", "Investment Analyst"],
  ["vongai", "Synthetic Investment Analyst 3", "INV_ANALYST", "Investments", "Investment Analyst"],
  ["gilbert", "Synthetic Portfolio Manager", "PORTFOLIO_MGR", "Investments", "Portfolio Manager"],
] as const;

async function main() {
  await assertDevDatabase(prisma, "uat-role-personas");
  const hash = await bcrypt.hash(password, 10);

  for (const [key, fullName, roleCode, department, roleName] of PERSONAS) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) throw new Error(`Missing local role row: ${roleName}`);
    const dept = await prisma.department.findUnique({ where: { name: department }, select: { id: true } });
    if (!dept) throw new Error(`Missing local department row: ${department}`);
    const [firstName, ...lastParts] = fullName.split(" ");
    const lastName = lastParts.join(" ");
    const email = `uat.${key}@nts.local`;
    await prisma.user.upsert({
      where: { email },
      create: { email, password: hash, firstName, lastName, roleId: role.id, roleCode, departmentId: dept.id, userDepartment: department, status: "ACTIVE" },
      update: { password: hash, firstName, lastName, roleId: role.id, roleCode, departmentId: dept.id, userDepartment: department, status: "ACTIVE" },
    });
    console.log(`[uat-personas] upserted ${email} (${roleCode})`);
  }
}

main().catch((error) => {
  console.error(`[uat-personas] FAILED: ${error?.message || error}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

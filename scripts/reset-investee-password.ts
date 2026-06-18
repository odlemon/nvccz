// @ts-nocheck
/**
 * Reset investee portal user password for UAT.
 * Run: UAT_INVESTEE_EMAIL=karatakundai@gmail.com npm run reset:investee-password
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/database";

const EMAIL = process.env.UAT_INVESTEE_EMAIL || "karatakundai@gmail.com";
const PASSWORD = process.env.UAT_INVESTEE_PASSWORD || "password123";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    include: { portfolioCompany: { select: { id: true, name: true } } },
  });
  if (!user) throw new Error(`User not found: ${EMAIL}`);

  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });

  console.log(`Password reset for ${EMAIL}`);
  console.log(`  Portfolio company: ${user.portfolioCompany?.name || "—"} (${user.portfolioCompany?.id || "—"})`);
  console.log(`  New password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * One-off: delete term sheet by applicationId (dev cleanup).
 * Usage: npx ts-node --transpile-only -r dotenv/config scripts/delete-term-sheet-by-application.ts <applicationId>
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const applicationId = process.argv[2];
if (!applicationId) {
  console.error("Usage: delete-term-sheet-by-application.ts <applicationId>");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  await assertDevDatabase(prisma);
  const existing = await prisma.termSheet.findUnique({ where: { applicationId } });
  if (!existing) {
    console.log(`[ok] No term sheet for application ${applicationId}`);
    return;
  }
  await prisma.termSheet.delete({ where: { applicationId } });
  console.log(`[ok] Deleted term sheet ${existing.id} (${existing.title}) for ${applicationId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

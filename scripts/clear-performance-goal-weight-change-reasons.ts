/**
 * Clears `weightChangeReason` on all performance goals (column remains nullable; no Prisma migrate).
 * Idempotent: second run updates 0 rows.
 *
 * Run: npm run db:clear:performance-goal-weight-reasons
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.performanceGoal.updateMany({
    where: { weightChangeReason: { not: null } },
    data: { weightChangeReason: null }
  });
  console.log(`[ok] cleared weightChangeReason on ${result.count} row(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

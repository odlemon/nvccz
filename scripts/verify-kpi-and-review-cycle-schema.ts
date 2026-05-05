/**
 * Sanity check: verify KPI legacy columns removed and review cycle created_by_id exists.
 * Read-only. Run: ts-node scripts/verify-kpi-and-review-cycle-schema.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const kpiLegacyCols = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'kpis'
        AND COLUMN_NAME IN ('departmentId', 'weightValue', 'type')`
  );

  const cycleCols = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'performance_review_cycles'
        AND COLUMN_NAME IN ('created_by_id')`
  );

  console.log(JSON.stringify({ kpiLegacyCols, performanceReviewCycleCols: cycleCols }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


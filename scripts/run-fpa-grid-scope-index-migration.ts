/**
 * FP&A grid: composite index for cycle/department-scoped cell reads.
 * Idempotent. Run: npm run db:migrate:fpa-grid-scope-index
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const INDEX = "planning_cells_mvs_dept_idx";

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[fpa-grid-scope-index] database=${db}`);

  if (await indexExists("planning_cells", INDEX)) {
    console.log(`[skip] planning_cells.${INDEX} already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX \`${INDEX}\` ON \`planning_cells\` (\`model_id\`, \`version_id\`, \`scenario_id\`, \`department_id\`)`
  );
  console.log(`[ok] planning_cells.${INDEX}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

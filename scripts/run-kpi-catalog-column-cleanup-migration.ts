/**
 * Removes legacy KPI columns: departmentId, weightValue, type (use catalog_department_name + unit_category instead).
 * Idempotent. Run: npm run db:migrate:kpi-catalog-column-cleanup
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    tableName,
    columnName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function dropColumnIfExists(tableName: string, columnName: string) {
  if (!(await columnExists(tableName, columnName))) {
    console.log(`[skip] ${tableName}.${columnName} already absent`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
  console.log(`[ok] dropped ${tableName}.${columnName}`);
}

async function main() {
  await dropColumnIfExists("kpis", "departmentId");
  await dropColumnIfExists("kpis", "weightValue");
  await dropColumnIfExists("kpis", "type");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

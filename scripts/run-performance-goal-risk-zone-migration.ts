/**
 * Adds performance goal columns for persisted risk / escalation zone (C.05).
 * Idempotent. Does not use Prisma migrations.
 *
 * Run: npm run db:migrate:performance-goal-risk-zone
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

async function addColumnIfMissing(tableName: string, columnName: string, columnSql: string) {
  if (await columnExists(tableName, columnName)) {
    console.log(`[skip] ${tableName}.${columnName} already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSql}`);
  console.log(`[ok] added ${tableName}.${columnName}`);
}

async function main() {
  await addColumnIfMissing(
    "performance_goals",
    "performanceRiskZone",
    "`performanceRiskZone` VARCHAR(191) NULL"
  );
  await addColumnIfMissing(
    "performance_goals",
    "performanceRiskZoneAt",
    "`performanceRiskZoneAt` DATETIME(3) NULL"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

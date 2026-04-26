/**
 * Creates `performance_metric_snapshots` table for cached computed metrics (AUM, etc.).
 * No Prisma migrate; idempotent via information_schema.
 *
 * Run: npm run db:migrate:performance-metric-snapshots
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(1) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function main() {
  const table = "performance_metric_snapshots";
  if (await tableExists(table)) {
    console.log(`[skip] ${table} already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `CREATE TABLE \`${table}\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`value\` DECIMAL(18,6) NOT NULL,
      \`computed_at\` DATETIME(3) NOT NULL,
      \`source\` VARCHAR(128) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`performance_metric_snapshots_code_key\` (\`code\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  console.log(`[ok] created ${table}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


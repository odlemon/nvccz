/**
 * Rolling forecast settings table. Idempotent.
 * Run: npm run db:migrate:fpa-rolling-forecast
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[fpa-rolling-forecast] database=${db}`);
  const t = "fpa_rolling_forecast_settings";
  if (await tableExists(t)) {
    console.log(`[skip] ${t}`);
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`${t}\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`version_id\` VARCHAR(191) NULL,
      \`actuals_cutoff\` DATE NULL,
      \`forecast_start\` DATE NULL,
      \`horizon_months\` INT NULL DEFAULT 12,
      \`active_method\` VARCHAR(32) NULL DEFAULT 'DRIVER',
      \`created_by\` VARCHAR(191) NOT NULL,
      \`updated_by\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`fpa_rfs_model_idx\` (\`model_id\`),
      INDEX \`fpa_rfs_model_version_idx\` (\`model_id\`, \`version_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log(`[ok] ${t}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

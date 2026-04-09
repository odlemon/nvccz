/**
 * Reporting schedule configs (MySQL). Idempotent.
 * Ensures table exists **without** `fund_id` (legacy column + FK are dropped if present).
 *
 * Run: npm run db:migrate:reporting-schedule-configs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function dropFundColumnIfPresent(table: string): Promise<void> {
  if (!(await columnExists(table, "fund_id"))) {
    return;
  }
  const fkRows = await prisma.$queryRawUnsafe<Array<{ CONSTRAINT_NAME: string }>>(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'fund_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      LIMIT 1`,
    table
  );
  const fk = fkRows[0]?.CONSTRAINT_NAME;
  if (fk) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk}\``);
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` DROP COLUMN \`fund_id\``);
  console.log("[ok] dropped legacy fund_id from reporting_schedule_configs");
}

async function main() {
  const table = "reporting_schedule_configs";
  if (!(await tableExists(table))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${table}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`frequency\` VARCHAR(32) NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`auto_open_calendar\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`due_date_offset_days_after_period_end\` INT NOT NULL DEFAULT 15,
        \`open_calendar_after_period_end_days\` INT NOT NULL DEFAULT 1,
        \`default_attachment_option_ids\` JSON NULL,
        \`custom_month_ends\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`reporting_schedule_configs_is_active_idx\` (\`is_active\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created reporting_schedule_configs");
  } else {
    await dropFundColumnIfPresent(table);
    console.log("[skip] reporting_schedule_configs exists");
  }

  console.log("\nReporting schedule configs migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

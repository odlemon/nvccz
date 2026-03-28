/**
 * Creates recurring_journal_templates and recurring_journal_runs (MySQL). Idempotent.
 * Run: npm run db:migrate:recurring-journal-tables
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  if (!(await tableExists("recurring_journal_templates"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`recurring_journal_templates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`day_of_month\` INT NOT NULL DEFAULT 1,
        \`currency_id\` VARCHAR(191) NOT NULL,
        \`lines_json\` JSON NOT NULL,
        \`reference_prefix\` VARCHAR(191) NOT NULL DEFAULT 'REC-JE',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`recurring_journal_templates_currency_id_idx\` (\`currency_id\`),
        INDEX \`recurring_journal_templates_created_by_id_idx\` (\`created_by_id\`),
        CONSTRAINT \`recurring_journal_templates_currency_id_fkey\`
          FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`recurring_journal_templates_created_by_id_fkey\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created recurring_journal_templates");
  } else {
    console.log("[skip] recurring_journal_templates exists");
  }

  if (!(await tableExists("recurring_journal_runs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`recurring_journal_runs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`template_id\` VARCHAR(191) NOT NULL,
        \`year_month\` VARCHAR(7) NOT NULL,
        \`journal_entry_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`recurring_journal_runs_template_id_year_month_key\` (\`template_id\`, \`year_month\`),
        UNIQUE INDEX \`recurring_journal_runs_journal_entry_id_key\` (\`journal_entry_id\`),
        INDEX \`recurring_journal_runs_template_id_idx\` (\`template_id\`),
        CONSTRAINT \`recurring_journal_runs_template_id_fkey\`
          FOREIGN KEY (\`template_id\`) REFERENCES \`recurring_journal_templates\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`recurring_journal_runs_journal_entry_id_fkey\`
          FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created recurring_journal_runs");
  } else {
    console.log("[skip] recurring_journal_runs exists");
  }

  console.log("\nRecurring journal tables migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

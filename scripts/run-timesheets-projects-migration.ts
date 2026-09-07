/**
 * Creates projects, timesheets and timesheet_entries (MySQL). Idempotent.
 *
 * projects           — internal/client work-item lookup (NOT the investment Fund model).
 * timesheets         — weekly header, one per user per week_ending (unique).
 * timesheet_entries  — day/project line rows, FK to both timesheets and projects.
 *
 * Run: npm run db:migrate:timesheets-projects
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
  // —— projects ——
  if (!(await tableExists("projects"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`projects\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`client_name\` VARCHAR(255) NULL,
        \`project_type\` VARCHAR(64) NULL,
        \`budget\` DECIMAL(14, 2) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`projects_created_by_id_idx\` (\`created_by_id\`),
        CONSTRAINT \`projects_created_by_id_fkey\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created projects");
  } else {
    console.log("[skip] projects exists");
  }

  // —— timesheets ——
  if (!(await tableExists("timesheets"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`timesheets\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NOT NULL,
        \`week_ending\` DATE NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`submitted_at\` DATETIME(3) NULL,
        \`approved_by_id\` VARCHAR(191) NULL,
        \`approved_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`timesheets_user_id_week_ending_key\` (\`user_id\`, \`week_ending\`),
        INDEX \`timesheets_user_id_idx\` (\`user_id\`),
        INDEX \`timesheets_approved_by_id_idx\` (\`approved_by_id\`),
        CONSTRAINT \`timesheets_user_id_fkey\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`timesheets_approved_by_id_fkey\`
          FOREIGN KEY (\`approved_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created timesheets");
  } else {
    console.log("[skip] timesheets exists");
  }

  // —— timesheet_entries ——
  if (!(await tableExists("timesheet_entries"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`timesheet_entries\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`timesheet_id\` VARCHAR(191) NOT NULL,
        \`project_id\` VARCHAR(191) NOT NULL,
        \`date\` DATE NOT NULL,
        \`hours\` DECIMAL(5, 2) NOT NULL,
        \`billable\` BOOLEAN NOT NULL DEFAULT false,
        \`notes\` VARCHAR(500) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`timesheet_entries_timesheet_id_idx\` (\`timesheet_id\`),
        INDEX \`timesheet_entries_project_id_idx\` (\`project_id\`),
        INDEX \`timesheet_entries_timesheet_project_date_idx\` (\`timesheet_id\`, \`project_id\`, \`date\`),
        CONSTRAINT \`timesheet_entries_timesheet_id_fkey\`
          FOREIGN KEY (\`timesheet_id\`) REFERENCES \`timesheets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`timesheet_entries_project_id_fkey\`
          FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created timesheet_entries");
  } else {
    console.log("[skip] timesheet_entries exists");
  }

  console.log("\nTimesheets/Projects migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

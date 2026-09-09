/**
 * Performance Corrective Actions — performance_corrective_actions table (MySQL). Idempotent.
 * Backs the Performance module's Corrective Actions register (ID / Action / Trigger / Owner /
 * Severity / Progress / Target). Creates the table when absent, and additively adds any column
 * or index missing from an older copy of the table, so it is safe to re-run.
 *
 * NOTE: the API-level field is `trigger`, but `TRIGGER` is a MySQL reserved word, so the column
 * is `trigger_source` and the Prisma model maps it (`trigger String? @map("trigger_source")`).
 *
 * Run: npm run db:migrate:performance-corrective-actions
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

const TABLE = "performance_corrective_actions";

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    index
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function constraintExists(table: string, constraint: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    table,
    constraint
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** Additive columns checked on every run so an older copy of the table catches up. */
const ADDITIVE_COLUMNS: Array<{ column: string; ddl: string }> = [
  { column: "reference", ddl: "ADD COLUMN `reference` VARCHAR(32) NOT NULL" },
  { column: "title", ddl: "ADD COLUMN `title` VARCHAR(255) NOT NULL" },
  { column: "description", ddl: "ADD COLUMN `description` TEXT NULL" },
  { column: "trigger_source", ddl: "ADD COLUMN `trigger_source` TEXT NULL" },
  { column: "owner_id", ddl: "ADD COLUMN `owner_id` VARCHAR(191) NULL" },
  { column: "department_id", ddl: "ADD COLUMN `department_id` VARCHAR(191) NULL" },
  { column: "severity", ddl: "ADD COLUMN `severity` VARCHAR(16) NOT NULL DEFAULT 'medium'" },
  { column: "status", ddl: "ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'open'" },
  { column: "progress", ddl: "ADD COLUMN `progress` INT NULL" },
  { column: "target_date", ddl: "ADD COLUMN `target_date` DATETIME(3) NULL" },
  { column: "closed_at", ddl: "ADD COLUMN `closed_at` DATETIME(3) NULL" },
  { column: "created_by_id", ddl: "ADD COLUMN `created_by_id` VARCHAR(191) NOT NULL" },
  {
    column: "created_at",
    ddl: "ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
  },
  {
    column: "updated_at",
    ddl: "ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
  },
];

const ADDITIVE_INDEXES: Array<{ index: string; ddl: string }> = [
  {
    index: "performance_corrective_actions_reference_key",
    ddl: "ADD UNIQUE INDEX `performance_corrective_actions_reference_key` (`reference`)",
  },
  {
    index: "performance_corrective_actions_status_idx",
    ddl: "ADD INDEX `performance_corrective_actions_status_idx` (`status`)",
  },
  {
    index: "performance_corrective_actions_owner_idx",
    ddl: "ADD INDEX `performance_corrective_actions_owner_idx` (`owner_id`)",
  },
  {
    index: "performance_corrective_actions_department_idx",
    ddl: "ADD INDEX `performance_corrective_actions_department_idx` (`department_id`)",
  },
  // Not in the original spec, but required: the schema runs relationMode = "prisma", so Prisma
  // emits no FK-backed index of its own and warns on any un-indexed relation scalar.
  {
    index: "performance_corrective_actions_created_by_idx",
    ddl: "ADD INDEX `performance_corrective_actions_created_by_idx` (`created_by_id`)",
  },
];

const ADDITIVE_CONSTRAINTS: Array<{ constraint: string; ddl: string }> = [
  {
    constraint: "performance_corrective_actions_owner_fk",
    ddl:
      "ADD CONSTRAINT `performance_corrective_actions_owner_fk` " +
      "FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  },
  {
    constraint: "performance_corrective_actions_department_fk",
    ddl:
      "ADD CONSTRAINT `performance_corrective_actions_department_fk` " +
      "FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  },
  {
    constraint: "performance_corrective_actions_created_by_fk",
    ddl:
      "ADD CONSTRAINT `performance_corrective_actions_created_by_fk` " +
      "FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
  },
];

async function main() {
  await assertDevDatabase(prisma, "performance-corrective-actions");

  if (!(await tableExists(TABLE))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${TABLE}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`reference\` VARCHAR(32) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NULL,
        \`trigger_source\` TEXT NULL,
        \`owner_id\` VARCHAR(191) NULL,
        \`department_id\` VARCHAR(191) NULL,
        \`severity\` VARCHAR(16) NOT NULL DEFAULT 'medium',
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'open',
        \`progress\` INT NULL,
        \`target_date\` DATETIME(3) NULL,
        \`closed_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`performance_corrective_actions_reference_key\` (\`reference\`),
        INDEX \`performance_corrective_actions_status_idx\` (\`status\`),
        INDEX \`performance_corrective_actions_owner_idx\` (\`owner_id\`),
        INDEX \`performance_corrective_actions_department_idx\` (\`department_id\`),
        INDEX \`performance_corrective_actions_created_by_idx\` (\`created_by_id\`),
        CONSTRAINT \`performance_corrective_actions_owner_fk\`
          FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`performance_corrective_actions_department_fk\`
          FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`performance_corrective_actions_created_by_fk\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log(`[ok] created ${TABLE}`);
  } else {
    console.log(`[skip] ${TABLE} exists`);

    for (const { column, ddl } of ADDITIVE_COLUMNS) {
      if (await columnExists(TABLE, column)) {
        console.log(`[skip] ${TABLE}.${column} exists`);
        continue;
      }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ${ddl}`);
      console.log(`[ok] added ${TABLE}.${column}`);
    }

    for (const { index, ddl } of ADDITIVE_INDEXES) {
      if (await indexExists(TABLE, index)) {
        console.log(`[skip] index ${index} exists`);
        continue;
      }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ${ddl}`);
      console.log(`[ok] added index ${index}`);
    }

    for (const { constraint, ddl } of ADDITIVE_CONSTRAINTS) {
      if (await constraintExists(TABLE, constraint)) {
        console.log(`[skip] constraint ${constraint} exists`);
        continue;
      }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ${ddl}`);
      console.log(`[ok] added constraint ${constraint}`);
    }
  }

  console.log("\nPerformance corrective actions migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

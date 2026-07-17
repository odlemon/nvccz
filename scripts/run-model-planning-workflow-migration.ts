/**
 * Model Planning cycle workflow columns (Stages 6–9).
 * Idempotent. Run: npm run db:migrate:model-planning-workflow
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[model-planning-workflow] database=${db}`);
  const t = "model_planning_cycles";

  await addColumn(
    t,
    "current_stage",
    `ALTER TABLE \`${t}\` ADD COLUMN \`current_stage\` VARCHAR(64) NULL AFTER \`status\``
  );
  await addColumn(
    t,
    "submitted_at",
    `ALTER TABLE \`${t}\` ADD COLUMN \`submitted_at\` DATETIME(3) NULL AFTER \`current_stage\``
  );
  await addColumn(
    t,
    "submitted_by",
    `ALTER TABLE \`${t}\` ADD COLUMN \`submitted_by\` VARCHAR(191) NULL AFTER \`submitted_at\``
  );
  await addColumn(
    t,
    "approved_at",
    `ALTER TABLE \`${t}\` ADD COLUMN \`approved_at\` DATETIME(3) NULL AFTER \`submitted_by\``
  );
  await addColumn(
    t,
    "approved_by",
    `ALTER TABLE \`${t}\` ADD COLUMN \`approved_by\` VARCHAR(191) NULL AFTER \`approved_at\``
  );
  await addColumn(
    t,
    "locked_at",
    `ALTER TABLE \`${t}\` ADD COLUMN \`locked_at\` DATETIME(3) NULL AFTER \`approved_by\``
  );
  await addColumn(
    t,
    "locked_by",
    `ALTER TABLE \`${t}\` ADD COLUMN \`locked_by\` VARCHAR(191) NULL AFTER \`locked_at\``
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

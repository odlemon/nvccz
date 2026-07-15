/**
 * Add model_code column to planning_models table.
 * Idempotent. Run: npm run db:migrate:planning-model-code
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "planning_models";
  const column = "model_code";

  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`planning_models\` ADD COLUMN \`model_code\` VARCHAR(255) NOT NULL DEFAULT '' AFTER \`model_name\``
  );
  console.log(`[ok] Added ${column} to ${table}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());